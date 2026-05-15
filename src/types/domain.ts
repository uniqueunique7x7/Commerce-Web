export interface DomainResult {
  domain: string;
  paypalCommerceFound: boolean;
  captchaFound: boolean;
  status: 'pending' | 'checking' | 'completed' | 'error';
  responseTime?: number;
  statusCode?: number;
  error?: string;
}

export interface CheckProgress {
  total: number;
  completed: number;
  successful: number;
  errors: number;
}

export interface ProxyConfig {
  ip: string;
  port: number;
  username: string;
  password: string;
}