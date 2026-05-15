import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { createJob } from '../api';
import type { JobInfo } from '../types';

interface Props {
  onJobCreated: (job: JobInfo) => void;
}

const LS_KEY = 'pcs.upload.settings.v1';

interface Saved {
  concurrency: number;
  timeout: number;
  proxy: string;
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { concurrency: 100, timeout: 15000, proxy: '' };
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      concurrency: Number(v.concurrency) || 100,
      timeout: Number(v.timeout) || 15000,
      proxy: typeof v.proxy === 'string' ? v.proxy : '',
    };
  } catch {
    return { concurrency: 100, timeout: 15000, proxy: '' };
  }
}

export function UploadPanel({ onJobCreated }: Props) {
  const saved = loadSaved();
  const [file, setFile] = useState<File | null>(null);
  const [proxyFile, setProxyFile] = useState<File | null>(null);
  const [proxyFileCount, setProxyFileCount] = useState(0);
  const [concurrency, setConcurrency] = useState(saved.concurrency);
  const [timeout, setTimeout] = useState(saved.timeout);
  const [proxy, setProxy] = useState(saved.proxy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const proxyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ concurrency, timeout, proxy }));
    } catch {
      /* ignore */
    }
  }, [concurrency, timeout, proxy]);

  const onPick = (f: File | null) => {
    if (!f) return;
    if (!/\.(txt|csv|list)$/i.test(f.name)) {
      setError('Please use a .txt or .csv file');
      return;
    }
    setError(null);
    setFile(f);
  };

  const onPickProxyFile = async (f: File | null) => {
    if (!f) {
      setProxyFile(null);
      setProxyFileCount(0);
      return;
    }
    setProxyFile(f);
    try {
      const text = await f.text();
      const count = text
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith('#')).length;
      setProxyFileCount(count);
    } catch {
      setProxyFileCount(0);
    }
  };

  const onSubmit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const job = await createJob(file, concurrency, timeout, proxy, proxyFile);
      onJobCreated(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Start a new check</h2>
        <p className="text-sm text-white/60">Upload a .txt file with one domain per line.</p>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onPick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`
          flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
          py-10 px-6 cursor-pointer transition
          ${dragging ? 'border-sky-400 bg-sky-400/5' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'}
        `}
      >
        <Upload className="h-8 w-8 text-white/60" />
        <div className="text-center">
          <p className="font-medium">{file ? file.name : 'Drop file here or click to browse'}</p>
          <p className="text-xs text-white/50">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
              : 'Supports millions of domains, up to 2 GB'}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.csv,.list,text/plain"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label mb-1 block">Concurrency</label>
          <input
            type="number"
            min={1}
            max={500}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
            className="input"
          />
          <p className="mt-1 text-[11px] text-white/40">1–500 parallel requests</p>
        </div>
        <div>
          <label className="label mb-1 block">Timeout (ms)</label>
          <input
            type="number"
            min={1000}
            max={60000}
            step={1000}
            value={timeout}
            onChange={(e) => setTimeout(Number(e.target.value) || 15000)}
            className="input"
          />
          <p className="mt-1 text-[11px] text-white/40">
            {proxy || proxyFile
              ? 'Try 25000–40000 with residential proxies'
              : 'Per-domain timeout'}
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <span className="label">Proxy (optional)</span>
          <span className="text-[11px] text-white/40">Remembered between sessions</span>
        </div>

        <input
          type="text"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          placeholder="host:port  or  host:port:user:pass"
          autoComplete="off"
          spellCheck={false}
          className="input font-mono"
        />
        <p className="text-[11px] text-white/40">
          Formats: <code>host:port</code>, <code>host:port:user:pass</code>,{' '}
          <code>http://user:pass@host:port</code>, <code>socks5://user:pass@host:port</code>
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={() => proxyInputRef.current?.click()} className="btn-ghost">
            <FileText className="h-4 w-4" />
            {proxyFile ? 'Change proxy list' : 'Upload proxy list (.txt)'}
          </button>

          {proxyFile && (
            <div className="flex items-center gap-2 text-xs text-white/70">
              <span className="font-mono">{proxyFile.name}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5">
                {proxyFileCount.toLocaleString()} proxies
              </span>
              <button
                type="button"
                onClick={() => onPickProxyFile(null)}
                className="text-white/50 hover:text-white"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <input
            ref={proxyInputRef}
            type="file"
            accept=".txt,.csv,.list,text/plain"
            className="hidden"
            onChange={(e) => onPickProxyFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <p className="text-[11px] text-white/40">
          One proxy per line. Proxies rotate round-robin across requests. The single field
          above is used in addition to the list.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <button onClick={onSubmit} disabled={!file || busy} className="btn-primary w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? 'Uploading…' : 'Start check'}
      </button>
    </div>
  );
}
