import https from 'https';
import http from 'http';
import { URL } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const PAYPAL_PATTERNS = [
  /paypal-commerce/i,
  /data-client-token/i,
];

const CAPTCHA_PATTERNS = [
  /g-recaptcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /turnstile/i,
  /cf-challenge/i,
  /funcaptcha/i,
  /geetest/i,
  /captcha/i,
];

// Reusable keep-alive agents — critical for performance at scale.
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2000,
  maxFreeSockets: 500,
  rejectUnauthorized: false, // some sites have bad certs but still answer
});
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 2000,
  maxFreeSockets: 500,
});

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.7',
  'Accept-Encoding': 'identity', // skip gzip — saves CPU at scale
  Connection: 'keep-alive',
};

const MAX_BYTES = 512 * 1024; // 512 KB cap per response

/**
 * Parse a proxy string. Supports:
 *   - host:port
 *   - host:port:user:pass
 *   - http://user:pass@host:port
 *   - socks5://user:pass@host:port
 */
export function parseProxy(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Full URL form
  if (/^(https?|socks[45]?h?):\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return { url: u.toString(), type: u.protocol.startsWith('socks') ? 'socks' : 'http' };
    } catch {
      return null;
    }
  }

  // host:port[:user:pass]
  const parts = raw.split(':');
  if (parts.length === 2 || parts.length === 4) {
    const [host, port, user, pass] = parts;
    if (!host || !port || !/^\d+$/.test(port)) return null;
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass || '')}@` : '';
    return { url: `http://${auth}${host}:${port}`, type: 'http' };
  }
  return null;
}

// Cache proxy agents so we reuse sockets per proxy.
const proxyAgentCache = new Map();
function getProxyAgent(proxyInfo) {
  if (!proxyInfo) return null;
  const key = proxyInfo.url;
  if (proxyAgentCache.has(key)) return proxyAgentCache.get(key);
  const agent =
    proxyInfo.type === 'socks'
      ? new SocksProxyAgent(proxyInfo.url, { keepAlive: true })
      : new HttpsProxyAgent(proxyInfo.url, { keepAlive: true, rejectUnauthorized: false });
  proxyAgentCache.set(key, agent);
  return agent;
}

function simplifyError(msg) {
  const m = msg || '';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return 'DNS lookup failed';
  if (/ECONNREFUSED/i.test(m)) return 'Connection refused';
  if (/ETIMEDOUT|timeout/i.test(m)) return 'Timeout';
  if (/CERT|self.signed|altname|SSL|TLS/i.test(m)) return 'SSL/TLS error';
  if (/ECONNRESET/i.test(m)) return 'Connection reset';
  if (/socket hang up/i.test(m)) return 'Socket hang up';
  return m.slice(0, 120);
}

function fetchOnce(targetUrl, timeoutMs, redirectsLeft, proxyInfo) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error('Invalid URL'));
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return reject(new Error('Unsupported protocol'));
    }

    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const proxyAgent = getProxyAgent(proxyInfo);
    const agent = proxyAgent || (isHttps ? httpsAgent : httpAgent);

    let settled = false;
    let req;

    // Hard outer timeout: fires even when the socket is stuck mid-CONNECT/TLS handshake
    // (which is the typical failure mode for residential proxies).
    const hardTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        req && req.destroy(new Error('Timeout'));
      } catch {
        /* noop */
      }
      reject(new Error('Timeout'));
    }, timeoutMs + 500);

    const done = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      fn(val);
    };

    req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: (parsed.pathname || '/') + parsed.search,
        method: 'GET',
        agent,
        timeout: timeoutMs,
        headers: { ...DEFAULT_HEADERS, Host: parsed.host },
      },
      (res) => {
        // Handle redirects
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          let next;
          try {
            next = new URL(res.headers.location, targetUrl).toString();
          } catch {
            return done(reject, new Error('Invalid redirect URL'));
          }
          // Cancel our outer timer; the next call will set its own.
          settled = true;
          clearTimeout(hardTimer);
          return fetchOnce(next, timeoutMs, redirectsLeft - 1, proxyInfo).then(resolve, reject);
        }

        let body = '';
        let size = 0;
        let truncated = false;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size <= MAX_BYTES) {
            body += chunk;
          } else if (!truncated) {
            truncated = true;
            body += chunk.slice(0, MAX_BYTES - (size - chunk.length));
            req.destroy();
            done(resolve, { body, status: res.statusCode, finalUrl: targetUrl });
          }
        });
        res.on('end', () => {
          if (!truncated) done(resolve, { body, status: res.statusCode, finalUrl: targetUrl });
        });
        res.on('error', (e) => done(reject, e));
      },
    );

    req.on('timeout', () => {
      try {
        req.destroy(new Error('Timeout'));
      } catch {
        /* noop */
      }
      done(reject, new Error('Timeout'));
    });
    req.on('error', (e) => done(reject, e));
    req.end();
  });
}

export async function checkDomain(rawDomain, timeoutMs = 15000, proxyInfo = null) {
  const domain = String(rawDomain)
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();

  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return {
      domain: rawDomain.trim(),
      ok: false,
      error: 'Invalid domain format',
      ms: 0,
    };
  }

  const started = Date.now();

  // Try HTTPS first, fall back to HTTP
  try {
    const { body, status, finalUrl } = await fetchOnce(`https://${domain}`, timeoutMs, 5, proxyInfo);
    return {
      domain,
      ok: status >= 200 && status < 400,
      status,
      paypal: PAYPAL_PATTERNS.some((p) => p.test(body)),
      captcha: CAPTCHA_PATTERNS.some((p) => p.test(body)),
      finalUrl,
      ms: Date.now() - started,
    };
  } catch (errHttps) {
    try {
      const { body, status, finalUrl } = await fetchOnce(`http://${domain}`, timeoutMs, 5, proxyInfo);
      return {
        domain,
        ok: status >= 200 && status < 400,
        status,
        paypal: PAYPAL_PATTERNS.some((p) => p.test(body)),
        captcha: CAPTCHA_PATTERNS.some((p) => p.test(body)),
        finalUrl,
        ms: Date.now() - started,
      };
    } catch (errHttp) {
      return {
        domain,
        ok: false,
        error: simplifyError(errHttp.message || errHttps.message),
        ms: Date.now() - started,
      };
    }
  }
}
