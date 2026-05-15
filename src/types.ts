export type JobState = 'pending' | 'running' | 'paused' | 'stopped' | 'done';

export interface JobStats {
  total: number;
  completed: number;
  paypal: number;
  captcha: number;
  errors: number;
  ok: number;
}

export interface JobInfo {
  id: string;
  state: JobState;
  concurrency: number;
  timeout: number;
  proxy?: string | null;
  proxyCount?: number;
  startedAt: number | null;
  finishedAt: number | null;
  stats: JobStats;
}

export interface DomainResult {
  domain: string;
  ok: boolean;
  status?: number;
  paypal?: boolean;
  captcha?: boolean;
  finalUrl?: string;
  error?: string;
  ms: number;
}

export type ResultFilter =
  | 'all'
  | 'paypal'
  | 'captcha'
  | 'both'
  | 'paypal-no-captcha'
  | 'errors'
  | 'ok';
