import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Download,
  Pause,
  Play,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteJob,
  exportUrl,
  getResults,
  openStream,
  pauseJob,
  resumeJob,
  stopJob,
} from '../api';
import type { DomainResult, JobInfo, JobStats, ResultFilter } from '../types';

interface Props {
  job: JobInfo;
  onClose: () => void;
}

const FILTERS: { value: ResultFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paypal', label: 'PayPal Commerce' },
  { value: 'paypal-no-captcha', label: 'PayPal (no captcha)' },
  { value: 'captcha', label: 'Captcha' },
  { value: 'both', label: 'PayPal + Captcha' },
  { value: 'ok', label: 'OK (2xx/3xx)' },
  { value: 'errors', label: 'Errors' },
];

const PAGE_SIZE = 100;

export function JobDashboard({ job: initialJob, onClose }: Props) {
  const [job, setJob] = useState<JobInfo>(initialJob);
  const [stats, setStats] = useState<JobStats>(initialJob.stats);
  const [hits, setHits] = useState<DomainResult[]>([]);
  const [filter, setFilter] = useState<ResultFilter>('paypal');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<DomainResult[]>([]);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState<'live' | 'browse'>('live');
  const hitsRef = useRef<HTMLDivElement>(null);

  // Live stream
  useEffect(() => {
    const es = openStream(job.id, {
      onState: (info) => setJob(info),
      onStats: (s) => setStats(s),
      onHit: (r) =>
        setHits((prev) => {
          const next = [r, ...prev];
          return next.length > 500 ? next.slice(0, 500) : next;
        }),
      onDone: (info) => {
        setJob(info);
        setStats(info.stats);
      },
    });
    return () => es.close();
  }, [job.id]);

  // Load paginated results when browsing
  useEffect(() => {
    if (tab !== 'browse') return;
    let cancelled = false;
    getResults(job.id, page, PAGE_SIZE, filter, search).then((data) => {
      if (cancelled) return;
      setRows(data.rows);
      setTotal(data.total);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, job.id, page, filter, search, stats.completed]);

  const progress =
    stats.total > 0 ? Math.min(100, (stats.completed / stats.total) * 100) : 0;

  const elapsed = (() => {
    if (!job.startedAt) return 0;
    const end = job.finishedAt || Date.now();
    return Math.max(0, end - job.startedAt) / 1000;
  })();

  const rate = elapsed > 0 ? stats.completed / elapsed : 0;
  const eta =
    stats.total > 0 && rate > 0
      ? Math.max(0, (stats.total - stats.completed) / rate)
      : 0;

  const isRunning = job.state === 'running';
  const isPaused = job.state === 'paused';
  const isDone = job.state === 'done' || job.state === 'stopped';

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="card flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              isRunning
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                : isPaused
                  ? 'bg-amber-400'
                  : 'bg-white/30'
            }`}
          />
          <div>
            <div className="text-sm font-semibold">Job {job.id}</div>
            <div className="text-xs text-white/50">
              {job.concurrency} concurrent · {job.timeout / 1000}s timeout · {job.state}
              {job.proxy && <> · proxy: <span className="font-mono text-white/70">{job.proxy}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button onClick={() => pauseJob(job.id)} className="btn-ghost">
              <Pause className="h-4 w-4" /> Pause
            </button>
          )}
          {isPaused && (
            <button onClick={() => resumeJob(job.id)} className="btn-success">
              <Play className="h-4 w-4" /> Resume
            </button>
          )}
          {!isDone && (
            <button onClick={() => stopJob(job.id)} className="btn-danger">
              <Square className="h-4 w-4" /> Stop
            </button>
          )}
          <button
            onClick={async () => {
              if (confirm('Delete this job and its results?')) {
                await deleteJob(job.id);
                onClose();
              }
            }}
            className="btn-ghost"
            title="Delete job"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="btn-ghost" title="Back">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat icon={<Activity className="h-4 w-4 text-sky-300" />} label="Progress" value={`${progress.toFixed(1)}%`} />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} label="Completed" value={`${stats.completed.toLocaleString()} / ${stats.total.toLocaleString()}`} />
        <Stat icon={<ShieldCheck className="h-4 w-4 text-fuchsia-300" />} label="PayPal hits" value={stats.paypal.toLocaleString()} accent="fuchsia" />
        <Stat icon={<ShieldCheck className="h-4 w-4 text-amber-300" />} label="Captcha hits" value={stats.captcha.toLocaleString()} />
        <Stat icon={<AlertCircle className="h-4 w-4 text-rose-300" />} label="Errors" value={stats.errors.toLocaleString()} />
        <Stat icon={<Activity className="h-4 w-4 text-cyan-300" />} label="Rate" value={`${rate.toFixed(1)}/s`} sub={eta > 0 ? `ETA ${formatDuration(eta)}` : undefined} />
      </div>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-white/60">
          <span>{formatDuration(elapsed)} elapsed</span>
          <span className="tabular-nums">{progress.toFixed(2)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('live')}
          className={`btn ${tab === 'live' ? 'bg-white/10 border border-white/15' : 'bg-transparent text-white/60 hover:bg-white/5'}`}
        >
          Live hits {hits.length > 0 && <span className="ml-1 rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[11px] text-fuchsia-200">{hits.length}</span>}
        </button>
        <button
          onClick={() => setTab('browse')}
          className={`btn ${tab === 'browse' ? 'bg-white/10 border border-white/15' : 'bg-transparent text-white/60 hover:bg-white/5'}`}
        >
          Browse all results
        </button>
      </div>

      {/* Body */}
      {tab === 'live' ? (
        <div ref={hitsRef} className="card flex-1 min-h-0 overflow-auto">
          {hits.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-white/50">
              {isDone
                ? `Scan complete — ${stats.paypal} PayPal Commerce hits found.`
                : 'Live PayPal Commerce hits will appear here as they\'re found.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#0f1320]/95 backdrop-blur">
                <tr className="text-left text-xs uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Flags</th>
                  <th className="px-4 py-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {hits.map((h, i) => (
                  <ResultRow key={`${h.domain}-${i}`} r={h} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <BrowseResults
          jobId={job.id}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          page={page}
          setPage={setPage}
          rows={rows}
          total={total}
        />
      )}
    </div>
  );
}

interface BrowseProps {
  jobId: string;
  filter: ResultFilter;
  setFilter: (f: ResultFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  page: number;
  setPage: (p: number) => void;
  rows: DomainResult[];
  total: number;
}

function BrowseResults({
  jobId,
  filter,
  setFilter,
  search,
  setSearch,
  page,
  setPage,
  rows,
  total,
}: BrowseProps) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="card flex flex-1 min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search domain…"
            className="input pl-9"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as ResultFilter);
            setPage(0);
          }}
          className="input w-auto"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <a href={exportUrl(jobId, filter, search, 'txt')} className="btn-ghost" download>
          <Download className="h-4 w-4" /> .txt
        </a>
        <a href={exportUrl(jobId, filter, search, 'json')} className="btn-ghost" download>
          <Download className="h-4 w-4" /> .jsonl
        </a>
        <div className="ml-auto text-xs text-white/60 tabular-nums">
          {total.toLocaleString()} matches
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-white/50">
            No results match this filter yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#0f1320]/95 backdrop-blur">
              <tr className="text-left text-xs uppercase tracking-wider text-white/50">
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r, i) => (
                <ResultRow key={`${r.domain}-${i}`} r={r} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/10 p-3 text-sm">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="btn-ghost"
        >
          Previous
        </button>
        <span className="text-white/60 tabular-nums">
          Page {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="btn-ghost"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ResultRow({ r }: { r: DomainResult }) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-4 py-2.5 font-mono text-[13px]">
        <a
          href={`https://${r.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 hover:underline"
        >
          {r.domain}
        </a>
      </td>
      <td className="px-4 py-2.5">
        {r.error ? (
          <span className="text-rose-300">{r.error}</span>
        ) : (
          <span className={r.ok ? 'text-emerald-300' : 'text-amber-300'}>{r.status ?? '-'}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-1">
          {r.paypal && <span className="badge bg-fuchsia-500/20 text-fuchsia-200">PAYPAL</span>}
          {r.captcha && <span className="badge bg-amber-500/20 text-amber-200">CAPTCHA</span>}
          {!r.paypal && !r.captcha && !r.error && <span className="text-xs text-white/30">—</span>}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{r.ms}ms</td>
    </tr>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'fuchsia';
}) {
  return (
    <div className="stat-tile">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        {icon}
      </div>
      <span
        className={`stat-value ${accent === 'fuchsia' ? 'text-fuchsia-300' : ''}`}
      >
        {value}
      </span>
      {sub && <span className="text-[11px] text-white/40">{sub}</span>}
    </div>
  );
}

function formatDuration(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
