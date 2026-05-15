import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { JobManager } from './jobManager.js';

const PORT = Number(process.env.PORT) || 3001;
const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});
const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'proxyFile', maxCount: 1 },
]);

const jobs = new JobManager();

// --- Health ---
app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// --- Create job (upload domain list) ---
app.post('/api/jobs', uploadFields, (req, res) => {
  const domainFile = req.files?.file?.[0];
  const proxyFile = req.files?.proxyFile?.[0];
  if (!domainFile) return res.status(400).json({ error: 'No domains file uploaded' });

  let proxyList = [];
  if (proxyFile) {
    try {
      proxyList = fs
        .readFileSync(proxyFile.path, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    } catch (e) {
      console.warn('Failed to read proxy file:', e.message);
    } finally {
      try {
        fs.unlinkSync(proxyFile.path);
      } catch {
        /* ignore */
      }
    }
  }

  const id = crypto.randomBytes(8).toString('hex');
  const job = jobs.create(id, domainFile.path, {
    concurrency: req.body.concurrency,
    timeout: req.body.timeout,
    proxy: req.body.proxy,
    proxyList,
  });
  res.json(job.toInfo());
});

// --- List jobs ---
app.get('/api/jobs', (_req, res) => res.json(jobs.list()));

// --- Get job info ---
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job.toInfo());
});

// --- Live stream (SSE) ---
app.get('/api/jobs/:id/stream', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Initial snapshot
  send('state', job.toInfo());
  send('stats', job.stats);

  const onStats = (s) => send('stats', s);
  const onHit = (r) => send('hit', r);
  const onState = (s) => send('state', s);
  const onDone = (info) => {
    send('done', info);
  };

  job.on('stats', onStats);
  job.on('hit', onHit);
  job.on('state', onState);
  job.on('done', onDone);

  // Keep-alive ping (some proxies close idle connections)
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(ping);
    job.off('stats', onStats);
    job.off('hit', onHit);
    job.off('state', onState);
    job.off('done', onDone);
  });
});

// --- Paginated results ---
app.get('/api/jobs/:id/results', async (req, res) => {
  const { page = '0', pageSize = '100', filter = 'all', search = '' } = req.query;
  const data = await jobs.getResults(req.params.id, {
    page: parseInt(page, 10) || 0,
    pageSize: Math.min(parseInt(pageSize, 10) || 100, 500),
    filter: String(filter),
    search: String(search),
  });
  res.json(data);
});

// --- Export (streamed) ---
app.get('/api/jobs/:id/export', async (req, res) => {
  const { filter = 'paypal', search = '', format = 'txt' } = req.query;
  await jobs.streamExport(
    req.params.id,
    String(filter),
    String(search),
    String(format),
    res,
  );
});

// --- Controls ---
app.post('/api/jobs/:id/pause', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  job.pause();
  res.json(job.toInfo());
});

app.post('/api/jobs/:id/resume', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  job.resume();
  res.json(job.toInfo());
});

app.post('/api/jobs/:id/stop', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  job.stop();
  res.json(job.toInfo());
});

app.delete('/api/jobs/:id', (req, res) => {
  const deleted = jobs.delete(req.params.id);
  res.json({ deleted });
});

// --- Serve built frontend (production) ---
const DIST_DIR = path.resolve('dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

const server = app.listen(PORT, () => {
  console.log(`\n🚀  Domain Checker API running on http://localhost:${PORT}`);
  console.log(`    POST /api/jobs              upload a .txt file of domains`);
  console.log(`    GET  /api/jobs/:id/stream   live SSE stream`);
  console.log(`    GET  /api/jobs/:id/results  paginated results`);
  console.log(`    GET  /api/jobs/:id/export   download filtered results\n`);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  for (const job of jobs.values()) {
    try { job.stop(); } catch { /* ignore */ }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
