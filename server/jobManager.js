import { EventEmitter } from 'events';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { checkDomain, parseProxy } from './checker.js';

const JOBS_DIR = path.resolve('jobs');
if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Tiny p-limit replacement. */
function makeLimiter(max) {
  let active = 0;
  const queue = [];
  const tryNext = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        tryNext();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      tryNext();
    });
}

export class Job extends EventEmitter {
  constructor(id, inputPath, options) {
    super();
    this.setMaxListeners(0);
    this.id = id;
    this.inputPath = inputPath;
    this.concurrency = Math.max(1, Math.min(500, Number(options.concurrency) || 100));
    this.timeout = Math.max(1000, Math.min(60000, Number(options.timeout) || 15000));

    // Build proxy pool: either a single proxy, a list (rotated round-robin), or none.
    this.proxyPool = [];
    this.proxyRawList = [];
    const singleRaw = options.proxy ? String(options.proxy).trim() : '';
    if (singleRaw) {
      const p = parseProxy(singleRaw);
      if (p) {
        this.proxyPool.push(p);
        this.proxyRawList.push(singleRaw);
      }
    }
    if (Array.isArray(options.proxyList)) {
      for (const raw of options.proxyList) {
        const trimmed = String(raw).trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const p = parseProxy(trimmed);
        if (p) {
          this.proxyPool.push(p);
          this.proxyRawList.push(trimmed);
        }
      }
    }
    this._proxyIdx = 0;
    this.state = 'pending'; // pending | running | paused | stopped | done
    this.paused = false;
    this.stopped = false;
    this.startedAt = null;
    this.finishedAt = null;
    this.stats = {
      total: 0,
      completed: 0,
      paypal: 0,
      captcha: 0,
      errors: 0,
      ok: 0,
    };
    this.resultsPath = path.join(JOBS_DIR, `${id}.jsonl`);
    this.writeStream = fs.createWriteStream(this.resultsPath, { flags: 'w' });
    this._lastStatsEmit = 0;
  }

  toInfo() {
    return {
      id: this.id,
      state: this.state,
      concurrency: this.concurrency,
      timeout: this.timeout,
      proxyCount: this.proxyPool.length,
      proxy:
        this.proxyPool.length === 0
          ? null
          : this.proxyPool.length === 1
            ? maskProxy(this.proxyRawList[0])
            : `${this.proxyPool.length} proxies (rotating)`,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      stats: this.stats,
    };
  }

  _pickProxy() {
    if (this.proxyPool.length === 0) return null;
    const p = this.proxyPool[this._proxyIdx % this.proxyPool.length];
    this._proxyIdx++;
    return p;
  }

  async start() {
    this.state = 'running';
    this.startedAt = Date.now();
    this.emit('state', this.toInfo());

    // Count total lines first (fast, streamed)
    await this._countLines();

    // Process
    await this._process();

    this.writeStream.end();
    this.finishedAt = Date.now();
    this.state = this.stopped ? 'stopped' : 'done';
    this._emitStats(true);
    this.emit('done', this.toInfo());
  }

  async _countLines() {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(this.inputPath),
        crlfDelay: Infinity,
      });
      let count = 0;
      rl.on('line', (l) => {
        if (l.trim()) count++;
      });
      rl.on('close', () => {
        this.stats.total = count;
        this._emitStats(true);
        resolve();
      });
    });
  }

  async _process() {
    const limit = makeLimiter(this.concurrency);
    const tasks = [];

    const rl = readline.createInterface({
      input: fs.createReadStream(this.inputPath),
      crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
      if (this.stopped) break;
      const line = rawLine.trim();
      if (!line) continue;

      tasks.push(
        limit(async () => {
          // Honor pause: wait without consuming the slot too aggressively
          while (this.paused && !this.stopped) await sleep(150);
          if (this.stopped) return;

          let result;
          try {
            result = await checkDomain(line, this.timeout, this._pickProxy());
          } catch (e) {
            result = {
              domain: line,
              ok: false,
              error: (e && e.message) || 'Unknown error',
              ms: 0,
            };
          }

          // Persist
          this.writeStream.write(JSON.stringify(result) + '\n');

          // Stats
          this.stats.completed++;
          if (result.error) this.stats.errors++;
          if (result.ok) this.stats.ok++;
          if (result.paypal) this.stats.paypal++;
          if (result.captcha) this.stats.captcha++;

          // Emit interesting results in real time (paypal hits)
          if (result.paypal) this.emit('hit', result);

          // Throttled stats
          const now = Date.now();
          if (now - this._lastStatsEmit > 250) {
            this._lastStatsEmit = now;
            this._emitStats();
          }
        }),
      );
    }

    await Promise.allSettled(tasks);
  }

  _emitStats(force = false) {
    if (force) this._lastStatsEmit = Date.now();
    this.emit('stats', this.stats);
  }

  pause() {
    if (this.state === 'running') {
      this.paused = true;
      this.state = 'paused';
      this.emit('state', this.toInfo());
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.paused = false;
      this.state = 'running';
      this.emit('state', this.toInfo());
    }
  }

  stop() {
    this.stopped = true;
    this.paused = false;
    this.emit('state', this.toInfo());
  }
}

export class JobManager {
  constructor() {
    this.jobs = new Map();
  }

  create(id, inputPath, options) {
    const job = new Job(id, inputPath, options);
    this.jobs.set(id, job);
    // Start in background; the API responds immediately
    job.start().catch((err) => {
      console.error(`Job ${id} crashed:`, err);
      job.state = 'stopped';
      job.emit('done', job.toInfo());
    });
    return job;
  }

  get(id) {
    return this.jobs.get(id);
  }

  list() {
    return [...this.jobs.values()].map((j) => j.toInfo());
  }

  delete(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.stop();
    try {
      fs.unlinkSync(job.resultsPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(job.inputPath);
    } catch {
      /* ignore */
    }
    this.jobs.delete(id);
    return true;
  }

  /**
   * Stream results from disk, applying a filter, with pagination.
   * Returns { rows, total } where total is the number of rows matching the filter.
   */
  async getResults(id, { page = 0, pageSize = 100, filter = 'all', search = '' } = {}) {
    const job = this.jobs.get(id);
    if (!job) return { rows: [], total: 0 };

    const matches = filterFn(filter);
    const q = (search || '').trim().toLowerCase();
    const rows = [];
    let total = 0;
    const start = page * pageSize;
    const end = start + pageSize;

    const rl = readline.createInterface({
      input: fs.createReadStream(job.resultsPath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line) continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (!matches(r)) continue;
      if (q && !r.domain.toLowerCase().includes(q)) continue;
      if (total >= start && total < end) rows.push(r);
      total++;
    }

    return { rows, total };
  }

  async streamExport(id, filter, search, format, res) {
    const job = this.jobs.get(id);
    if (!job) {
      res.statusCode = 404;
      return res.end();
    }
    const matches = filterFn(filter);
    const q = (search || '').trim().toLowerCase();
    const isJson = format === 'json';

    res.setHeader('Content-Type', isJson ? 'application/x-ndjson' : 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${id}-${filter}.${isJson ? 'jsonl' : 'txt'}"`,
    );

    const rl = readline.createInterface({
      input: fs.createReadStream(job.resultsPath),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (!matches(r)) continue;
      if (q && !r.domain.toLowerCase().includes(q)) continue;
      res.write(isJson ? line + '\n' : r.domain + '\n');
    }
    res.end();
  }
}

function filterFn(filter) {
  switch (filter) {
    case 'paypal':
      return (r) => !!r.paypal;
    case 'captcha':
      return (r) => !!r.captcha;
    case 'both':
      return (r) => !!r.paypal && !!r.captcha;
    case 'paypal-no-captcha':
      return (r) => !!r.paypal && !r.captcha;
    case 'errors':
      return (r) => !!r.error;
    case 'ok':
      return (r) => !!r.ok;
    default:
      return () => true;
  }
}

/** Mask credentials so we don't leak the proxy password in API responses. */
function maskProxy(raw) {
  if (!raw) return null;
  const s = String(raw);
  // host:port:user:pass form
  const parts = s.split(':');
  if (parts.length === 4) return `${parts[0]}:${parts[1]} (auth: ${parts[2]}:***)`;
  if (parts.length === 2) return `${parts[0]}:${parts[1]}`;
  // URL form
  try {
    const u = new URL(s);
    const auth = u.username ? `${u.username}:***@` : '';
    return `${u.protocol}//${auth}${u.host}`;
  } catch {
    return 'configured';
  }
}
