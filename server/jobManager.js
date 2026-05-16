import { EventEmitter } from 'events';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { checkDomain, parseProxy } from './checker.js';

const JOBS_DIR = path.resolve('jobs');
if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });

// Pagination index: remember the byte offset of every Nth result row so we can
// seek directly into the .jsonl file instead of re-scanning from the start.
const INDEX_STRIDE = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

    // Offset index: offsetIndex[k] = byte position where row (k * INDEX_STRIDE) begins.
    // Row 0 always starts at byte 0.
    this._offsetIndex = [0];
    this._bytesWritten = 0;
    this._rowsWritten = 0;
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
    const rl = readline.createInterface({
      input: fs.createReadStream(this.inputPath),
      crlfDelay: Infinity,
    });
    const iterator = rl[Symbol.asyncIterator]();

    // Pull-based worker pool: N workers each pull the next line from the
    // shared async iterator and process it. This keeps memory flat
    // regardless of input size (no pre-queueing of 300k+ tasks).
    const runWorker = async () => {
      while (!this.stopped) {
        // Honor pause without busy-spinning the CPU
        while (this.paused && !this.stopped) await sleep(150);
        if (this.stopped) break;

        const { value, done } = await iterator.next();
        if (done) break;
        const line = value && value.trim();
        if (!line) continue;

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
        const line2 = JSON.stringify(result) + '\n';
        this.writeStream.write(line2);

        // Maintain the offset index. Safe across workers: everything between
        // the await above and here is synchronous on a single thread.
        this._bytesWritten += Buffer.byteLength(line2, 'utf8');
        this._rowsWritten++;
        if (this._rowsWritten % INDEX_STRIDE === 0) {
          this._offsetIndex.push(this._bytesWritten);
        }

        // Stats
        this.stats.completed++;
        if (result.error) this.stats.errors++;
        if (result.ok) this.stats.ok++;
        if (result.paypal) this.stats.paypal++;
        if (result.captcha) this.stats.captcha++;

        if (result.paypal) this.emit('hit', result);

        // Throttled stats
        const now = Date.now();
        if (now - this._lastStatsEmit > 250) {
          this._lastStatsEmit = now;
          this._emitStats();
        }
      }
    };

    const workers = [];
    for (let i = 0; i < this.concurrency; i++) workers.push(runWorker());
    await Promise.allSettled(workers);

    // Drain readline if we stopped early
    try { rl.close(); } catch { /* ignore */ }
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
   *
   * Fast path: when filter='all' and no search, we use the offset index to seek
   * directly to the requested page instead of scanning the whole file.
   */
  async getResults(id, { page = 0, pageSize = 100, filter = 'all', search = '' } = {}) {
    const job = this.jobs.get(id);
    if (!job) return { rows: [], total: 0 };

    const matches = filterFn(filter);
    const q = (search || '').trim().toLowerCase();

    // ---- Fast path: random-access via offset index ----
    if (filter === 'all' && !q) {
      const targetRow = page * pageSize;
      const idx = job._offsetIndex;
      const k = Math.min(Math.floor(targetRow / INDEX_STRIDE), idx.length - 1);
      const startByte = idx[k];
      let toSkip = targetRow - k * INDEX_STRIDE;
      const rows = [];
      let needed = pageSize;

      const rl = readline.createInterface({
        input: fs.createReadStream(job.resultsPath, { start: startByte }),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line) continue;
        if (toSkip > 0) { toSkip--; continue; }
        try { rows.push(JSON.parse(line)); } catch { continue; }
        if (--needed === 0) break;
      }
      rl.close();
      return { rows, total: job.stats.completed };
    }

    // ---- Cheap totals for single-flag filters when there's no search ----
    // (Pagination through filtered rows still scans, but the total comes free.)
    let knownTotal = null;
    if (!q) {
      if (filter === 'paypal') knownTotal = job.stats.paypal;
      else if (filter === 'captcha') knownTotal = job.stats.captcha;
      else if (filter === 'errors') knownTotal = job.stats.errors;
      else if (filter === 'ok') knownTotal = job.stats.ok;
    }

    // ---- Fallback: full scan for complex filters / search ----
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
      // Early exit when we have the page AND we already know the total.
      if (knownTotal !== null && rows.length === pageSize && total >= end) {
        return { rows, total: knownTotal };
      }
    }

    return { rows, total: knownTotal !== null ? knownTotal : total };
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
      if (isJson) {
        res.write(line + '\n');
      } else {
        // Prefer the post-redirect final URL; fall back to the original domain.
        res.write((r.finalUrl || r.domain) + '\n');
      }
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
