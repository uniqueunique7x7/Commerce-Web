import type { DomainResult, JobInfo, ResultFilter } from './types';

const BASE = '/api';

export async function createJob(
  file: File,
  concurrency: number,
  timeout: number,
  proxy: string,
  proxyFile: File | null,
): Promise<JobInfo> {
  const form = new FormData();
  form.append('file', file);
  form.append('concurrency', String(concurrency));
  form.append('timeout', String(timeout));
  if (proxy.trim()) form.append('proxy', proxy.trim());
  if (proxyFile) form.append('proxyFile', proxyFile);
  const res = await fetch(`${BASE}/jobs`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json();
}

export async function getJob(id: string): Promise<JobInfo> {
  const res = await fetch(`${BASE}/jobs/${id}`);
  if (!res.ok) throw new Error('Job not found');
  return res.json();
}

export async function getResults(
  id: string,
  page: number,
  pageSize: number,
  filter: ResultFilter,
  search: string,
): Promise<{ rows: DomainResult[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    filter,
    search,
  });
  const res = await fetch(`${BASE}/jobs/${id}/results?${params}`);
  if (!res.ok) throw new Error('Results fetch failed');
  return res.json();
}

export async function pauseJob(id: string) {
  await fetch(`${BASE}/jobs/${id}/pause`, { method: 'POST' });
}
export async function resumeJob(id: string) {
  await fetch(`${BASE}/jobs/${id}/resume`, { method: 'POST' });
}
export async function stopJob(id: string) {
  await fetch(`${BASE}/jobs/${id}/stop`, { method: 'POST' });
}
export async function deleteJob(id: string) {
  await fetch(`${BASE}/jobs/${id}`, { method: 'DELETE' });
}

export function exportUrl(id: string, filter: ResultFilter, search: string, format: 'txt' | 'json' = 'txt') {
  const params = new URLSearchParams({ filter, search, format });
  return `${BASE}/jobs/${id}/export?${params}`;
}

export function openStream(
  id: string,
  handlers: {
    onState?: (info: JobInfo) => void;
    onStats?: (stats: JobInfo['stats']) => void;
    onHit?: (r: DomainResult) => void;
    onDone?: (info: JobInfo) => void;
    onError?: () => void;
  },
): EventSource {
  const es = new EventSource(`${BASE}/jobs/${id}/stream`);
  if (handlers.onState)
    es.addEventListener('state', (e) => handlers.onState!(JSON.parse((e as MessageEvent).data)));
  if (handlers.onStats)
    es.addEventListener('stats', (e) => handlers.onStats!(JSON.parse((e as MessageEvent).data)));
  if (handlers.onHit)
    es.addEventListener('hit', (e) => handlers.onHit!(JSON.parse((e as MessageEvent).data)));
  if (handlers.onDone)
    es.addEventListener('done', (e) => handlers.onDone!(JSON.parse((e as MessageEvent).data)));
  if (handlers.onError) es.onerror = () => handlers.onError!();
  return es;
}
