import https from 'https';
import http from 'http';
import { URL } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

// ─────────────────────────────────────────────────────────────────────────────
// DETECTION CONSTANTS  (ported from the Python checker)
// Success = BOTH needles present in the SAME response body:
//   1. data-client-token  → PayPal Commerce SDK token attribute
//   2. give-form-url      → GiveWP donation-form hidden input
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_NEEDLE = 'data-client-token';
const FORMURL_NEEDLE = 'give-form-url';
const MAX_NEEDLE_LEN = Math.max(TOKEN_NEEDLE.length, FORMURL_NEEDLE.length);

// GiveWP plugin fingerprints. If ANY of these appears in the homepage HTML the
// site almost certainly uses GiveWP and is worth blind-probing default routes.
const GIVEWP_FINGERPRINTS = [
  '/wp-content/plugins/give/',
  '/wp-content/plugins/give-',
  'givewp',
  'give-form-wrap',
  'give-form-',
  'data-form-id',
  'class="give-',
  "class='give-",
  'id="give-',
  "id='give-",
  '/give/donation-form',
];

// Default GiveWP routes to probe blindly (ordered by hit-frequency).
const GIVEWP_PROBE_PATHS = [
  '/give/donation-form/',
  '/give/donation-form',
  '/donations/donation-form/',
  '/donate/',
  '/donation/',
  '/donation-form/',
];

// One regex pass over raw HTML extracts every href that looks like a donate
// / give route.
const DONATE_HREF_RE =
  /href\s*=\s*["']([^"']*(?:\/give\/|\/donations?\/|\/donate(?:[/?#-]|$)|\/donation-form|\/give-now|\/contribute|\/support-us)[^"']*)["']/gi;

// Static-asset extensions to drop from extracted hrefs.
const ASSET_EXT_RE =
  /\.(?:css|js|mjs|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|pdf|zip|mp4|webm|mp3|xml|json)(?:[?#]|$)/i;

// GiveWP embed iframe (token usually lives inside).
const IFRAME_RE =
  /<iframe[^>]*name=["']give-embed-form["'][^>]*src=["']([^"']+)["']/i;
const IFRAME_RE_REV =
  /<iframe[^>]*src=["']([^"']+)["'][^>]*name=["']give-embed-form["']/i;

// Captcha fingerprints (kept from the previous checker — used by the UI).
const CAPTCHA_PATTERNS = [
  { name: 'reCAPTCHA',            regex: /g-recaptcha|www\.google\.com\/recaptcha|recaptcha\/api\.js|grecaptcha/i },
  { name: 'hCaptcha',             regex: /hcaptcha\.com|h-captcha/i },
  { name: 'Cloudflare Turnstile', regex: /challenges\.cloudflare\.com\/turnstile|cf-turnstile/i },
  { name: 'Cloudflare Challenge', regex: /cf-challenge|__cf_chl_|cdn-cgi\/challenge-platform/i },
  { name: 'FunCaptcha',           regex: /funcaptcha|arkoselabs/i },
  { name: 'GeeTest',              regex: /geetest/i },
  { name: 'Captcha',              regex: /captcha/i },
];

function detectCaptcha(body) {
  for (const p of CAPTCHA_PATTERNS) {
    if (p.regex.test(body)) return p.name;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP plumbing (keep-alive agents, proxy support — unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2000,
  maxFreeSockets: 500,
  rejectUnauthorized: false,
});
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 2000,
  maxFreeSockets: 500,
});

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

function buildHeaders({ referer, isIframe } = {}) {
  const h = {
    'User-Agent': randomUA(),
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity', // skip gzip — saves CPU at scale
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': isIframe ? 'iframe' : 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    Connection: 'keep-alive',
  };
  if (referer) h.Referer = referer;
  return h;
}

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

  if (/^(https?|socks[45]?h?):\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return { url: u.toString(), type: u.protocol.startsWith('socks') ? 'socks' : 'http' };
    } catch {
      return null;
    }
  }

  const parts = raw.split(':');
  if (parts.length === 2 || parts.length === 4) {
    const [host, port, user, pass] = parts;
    if (!host || !port || !/^\d+$/.test(port)) return null;
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass || '')}@` : '';
    return { url: `http://${auth}${host}:${port}`, type: 'http' };
  }
  return null;
}

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

/**
 * Streaming single-request fetch with early abort when both detection needles
 * are seen. Returns:
 *   { body, status, finalUrl, tokenHit }
 *
 *   tokenHit = true iff `data-client-token` AND `give-form-url` both appear
 *              in the body bytes received so far.
 */
function fetchOnce(targetUrl, timeoutMs, redirectsLeft, proxyInfo, opts = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
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

    const hardTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { req && req.destroy(new Error('Timeout')); } catch { /* noop */ }
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
        headers: { ...buildHeaders(opts), Host: parsed.host },
      },
      (res) => {
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
          settled = true;
          clearTimeout(hardTimer);
          return fetchOnce(next, timeoutMs, redirectsLeft - 1, proxyInfo, opts).then(resolve, reject);
        }

        const finalUrl = (() => {
          try { return new URL(res.url || '', targetUrl).toString(); } catch { return targetUrl; }
        })();

        let body = '';
        let size = 0;
        let truncated = false;
        let tail = '';
        let foundToken = false;
        let foundFormUrl = false;

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          const windowStr = tail + chunk;
          if (!foundToken && windowStr.includes(TOKEN_NEEDLE)) foundToken = true;
          if (!foundFormUrl && windowStr.includes(FORMURL_NEEDLE)) foundFormUrl = true;

          size += chunk.length;
          if (size <= MAX_BYTES) {
            body += chunk;
          } else if (!truncated) {
            truncated = true;
            body += chunk.slice(0, MAX_BYTES - (size - chunk.length));
          }

          if (foundToken && foundFormUrl) {
            try { req.destroy(); } catch { /* noop */ }
            return done(resolve, { body, status: res.statusCode, finalUrl, tokenHit: true });
          }

          tail = chunk.length >= MAX_NEEDLE_LEN ? chunk.slice(-MAX_NEEDLE_LEN) : windowStr.slice(-MAX_NEEDLE_LEN);

          if (truncated) {
            try { req.destroy(); } catch { /* noop */ }
            done(resolve, { body, status: res.statusCode, finalUrl, tokenHit: false });
          }
        });
        res.on('end', () => {
          done(resolve, { body, status: res.statusCode, finalUrl, tokenHit: foundToken && foundFormUrl });
        });
        res.on('error', (e) => done(reject, e));
      },
    );

    req.on('timeout', () => {
      try { req.destroy(new Error('Timeout')); } catch { /* noop */ }
      done(reject, new Error('Timeout'));
    });
    req.on('error', (e) => done(reject, e));
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate-URL extraction (mirrors the Python helpers)
// ─────────────────────────────────────────────────────────────────────────────
function originOf(url) {
  try {
    const p = new URL(url);
    return `${p.protocol}//${p.host}`;
  } catch {
    return null;
  }
}

function extractGiveIframe(body, baseUrl) {
  const m = IFRAME_RE.exec(body) || IFRAME_RE_REV.exec(body);
  if (!m) return null;
  const src = (m[1] || '').trim();
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  try { return new URL(src, baseUrl).toString(); } catch { return null; }
}

function hasGivewpFingerprint(body) {
  return GIVEWP_FINGERPRINTS.some((sig) => body.includes(sig));
}

function extractDonateHrefs(body, baseUrl, limit) {
  const out = [];
  const seen = new Set();
  const origin = originOf(baseUrl) || '';
  DONATE_HREF_RE.lastIndex = 0;
  let m;
  while ((m = DONATE_HREF_RE.exec(body)) !== null) {
    if (out.length >= limit) break;
    let href = (m[1] || '').trim();
    if (!href) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    if (href.includes('/wp-content/') || href.includes('/wp-includes/')) continue;
    if (ASSET_EXT_RE.test(href)) continue;

    let abs;
    if (href.startsWith('//')) abs = 'https:' + href;
    else if (/^https?:\/\//i.test(href)) abs = href;
    else {
      try { abs = new URL(href, baseUrl).toString(); } catch { continue; }
    }

    if (origin && !abs.startsWith(origin)) continue; // same-origin only
    abs = abs.split('#', 1)[0];
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

function buildCandidates(homeUrl, body, maxDonateLinks) {
  const origin = originOf(homeUrl) || homeUrl.replace(/\/+$/, '');
  const seen = new Set([homeUrl, homeUrl.replace(/\/+$/, ''), homeUrl.replace(/\/+$/, '') + '/']);
  const candidates = [];

  // 1) GiveWP iframe
  const iframeUrl = extractGiveIframe(body, homeUrl);
  if (iframeUrl && !seen.has(iframeUrl)) {
    seen.add(iframeUrl);
    candidates.push({ kind: 'iframe', url: iframeUrl });
  }

  // 2) Real donate-route hrefs from raw HTML (highest signal)
  const real = extractDonateHrefs(body, homeUrl, maxDonateLinks * 4);
  for (const u of real.slice(0, maxDonateLinks)) {
    if (seen.has(u)) continue;
    seen.add(u);
    candidates.push({ kind: 'href', url: u });
  }

  // 3) Blind GiveWP probes — only when plugin fingerprint detected
  if (hasGivewpFingerprint(body)) {
    for (const p of GIVEWP_PROBE_PATHS) {
      const u = origin + p;
      if (seen.has(u)) continue;
      seen.add(u);
      candidates.push({ kind: 'givewp', url: u });
    }
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
const MAX_DONATE_LINKS = 5;

async function fetchWithFallback(domain, timeoutMs, proxyInfo, opts) {
  // Try HTTPS first, fall back to HTTP.
  try {
    return await fetchOnce(`https://${domain}`, timeoutMs, 5, proxyInfo, opts);
  } catch (errHttps) {
    try {
      return await fetchOnce(`http://${domain}`, timeoutMs, 5, proxyInfo, opts);
    } catch (errHttp) {
      const err = new Error(simplifyError(errHttp.message || errHttps.message));
      err.original = errHttp;
      throw err;
    }
  }
}

export async function checkDomain(rawDomain, timeoutMs = 15000, proxyInfo = null) {
  const domain = String(rawDomain)
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();

  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return { domain: rawDomain.trim(), ok: false, error: 'Invalid domain format', ms: 0 };
  }

  const started = Date.now();

  // ── Step 1: fetch homepage ──────────────────────────────────────────────
  let home;
  try {
    home = await fetchWithFallback(domain, timeoutMs, proxyInfo, {});
  } catch (e) {
    return { domain, ok: false, error: simplifyError(e.message), ms: Date.now() - started };
  }

  const homeOk = home.status >= 200 && home.status < 400;
  const captcha = detectCaptcha(home.body);

  // Token already on the homepage?
  if (home.tokenHit) {
    return {
      domain,
      ok: homeOk,
      status: home.status,
      paypal: true,
      captcha,
      finalUrl: home.finalUrl,
      ms: Date.now() - started,
    };
  }

  // ── Step 2: build candidate probe list from homepage bytes ──────────────
  const candidates = buildCandidates(home.finalUrl, home.body, MAX_DONATE_LINKS);

  // ── Step 3: probe candidates, abort at first hit ────────────────────────
  for (const { kind, url } of candidates) {
    let r;
    try {
      r = await fetchOnce(url, timeoutMs, 5, proxyInfo, {
        referer: home.finalUrl,
        isIframe: kind === 'iframe',
      });
    } catch {
      continue;
    }
    if (r.tokenHit) {
      return {
        domain,
        ok: true,
        status: r.status,
        paypal: true,
        captcha,
        finalUrl: r.finalUrl,
        ms: Date.now() - started,
      };
    }

    // Nested give-embed-form iframe inside this candidate page
    if (r.body) {
      const nested = extractGiveIframe(r.body, r.finalUrl);
      if (nested) {
        try {
          const r3 = await fetchOnce(nested, timeoutMs, 5, proxyInfo, {
            referer: r.finalUrl,
            isIframe: true,
          });
          if (r3.tokenHit) {
            return {
              domain,
              ok: true,
              status: r3.status,
              paypal: true,
              captcha,
              finalUrl: r3.finalUrl,
              ms: Date.now() - started,
            };
          }
        } catch { /* ignore, keep probing */ }
      }
    }
  }

  // No token anywhere — return homepage result without `paypal: true`.
  return {
    domain,
    ok: homeOk,
    status: home.status,
    paypal: false,
    captcha,
    finalUrl: home.finalUrl,
    ms: Date.now() - started,
  };
}
