import axios, { AxiosResponse } from 'axios';
import { DomainResult, CheckProgress, ProxyConfig } from '../types/domain';

// Known captcha providers patterns
const CAPTCHA_PATTERNS = [
  /g-recaptcha/i,
  /captcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /cloudflare/i,
  /funcaptcha/i,
  /geetest/i,
];

// PayPal patterns to look for
const PAYPAL_PATTERNS = [
  /paypal-commerce/i,
];

// CORS proxy services (fallback options)
const CORS_PROXIES = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
  'https://thingproxy.freeboard.io/fetch/',
  'https://proxy.cors.sh/',
];

export class DomainChecker {
  private abortController: AbortController | null = null;
  private isPaused: boolean = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private concurrency: number;
  private timeout: number;

  constructor(concurrency = 100, timeout = 10000) {
    this.concurrency = concurrency;
    this.timeout = timeout;
  }

  private containsPaypalCommerce(text: string): boolean {
    return PAYPAL_PATTERNS.some(pattern => pattern.test(text));
  }

  private containsCaptcha(text: string): boolean {
    return CAPTCHA_PATTERNS.some(pattern => pattern.test(text));
  }

  private cleanDomain(domain: string): string {
    return domain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
  }

  private async waitIfPaused(): Promise<void> {
    if (this.isPaused && this.pausePromise) {
      await this.pausePromise;
    }
  }

  private async fetchWithAxios(url: string, proxyConfig?: ProxyConfig): Promise<{ data: string; status: number; statusText: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Configure axios with proxy if provided
      const axiosConfig: any = {
        method: 'GET',
        url: url,
        timeout: this.timeout,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'DNT': '1',
        },
      };

      const response: AxiosResponse = await axios(axiosConfig);
      clearTimeout(timeoutId);
      
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText
      };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async fetchWithCorsProxy(domain: string): Promise<{ data: string; status: number; statusText: string }> {
    const url = `https://${domain}`;
    const errors: string[] = [];

    // Try each CORS proxy with individual timeout and error handling
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxy = CORS_PROXIES[i];
      
      try {
        let proxyUrl: string;
        let response: AxiosResponse;

        // Create a new AbortController for each proxy attempt
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeout, 8000)); // Shorter timeout for proxies

        try {
          if (proxy.includes('allorigins.win')) {
            proxyUrl = `${proxy}${encodeURIComponent(url)}`;
            response = await axios.get(proxyUrl, { 
              timeout: Math.min(this.timeout, 8000),
              signal: controller.signal,
              headers: {
                'Accept': 'application/json',
              }
            });
            
            clearTimeout(timeoutId);
            
            if (response.data && response.data.contents) {
              return {
                data: response.data.contents,
                status: response.data.status?.http_code || 200,
                statusText: 'OK'
              };
            } else {
              throw new Error('Invalid response format from allorigins.win');
            }
          } else {
            proxyUrl = `${proxy}${url}`;
            response = await axios.get(proxyUrl, { 
              timeout: Math.min(this.timeout, 8000),
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              }
            });
            
            clearTimeout(timeoutId);
            
            return {
              data: response.data,
              status: response.status,
              statusText: response.statusText
            };
          }
        } catch (proxyError) {
          clearTimeout(timeoutId);
          throw proxyError;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Proxy ${i + 1}: ${errorMsg}`);
        
        // Add a small delay between proxy attempts to avoid overwhelming services
        if (i < CORS_PROXIES.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    // All proxies failed - throw a more informative error
    throw new Error(`All CORS proxies unavailable. This is a common issue with public proxy services. Consider implementing a backend service for reliable domain checking. Errors: ${errors.join('; ')}`);
  }

  private async fetchDomain(domain: string, proxyConfig?: ProxyConfig): Promise<DomainResult> {
    const cleanDomain = this.cleanDomain(domain);
    const startTime = Date.now();

    const result: DomainResult = {
      domain: cleanDomain,
      paypalCommerceFound: false,
      captchaFound: false,
      status: 'checking',
    };

    try {
      // Wait if paused
      await this.waitIfPaused();

      // Check if aborted
      if (this.abortController?.signal.aborted) {
        result.status = 'error';
        result.error = 'Check aborted by user';
        return result;
      }
      
      let response: { data: string; status: number; statusText: string };

      try {
        // First try direct request with axios
        response = await this.fetchWithAxios(`https://${cleanDomain}`, proxyConfig);
      } catch (directError) {
        
        try {
          // If direct request fails (likely due to CORS), try CORS proxies
          response = await this.fetchWithCorsProxy(cleanDomain);
        } catch (proxyError) {
          // Handle the case where all proxies fail
          const errorMsg = proxyError instanceof Error ? proxyError.message : 'All proxy services failed';
          result.error = `CORS blocked - ${errorMsg}`;
          result.status = 'error';
          result.responseTime = Date.now() - startTime;
          return result;
        }
      }
      
      if (response.status >= 200 && response.status < 300) {
        const content = response.data;
        
        result.paypalCommerceFound = this.containsPaypalCommerce(content);
        result.captchaFound = this.containsCaptcha(content);
        result.statusCode = response.status;
        result.responseTime = Date.now() - startTime;
        result.status = 'completed';

      } else {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        result.statusCode = response.status;
        result.status = 'error';
        result.responseTime = Date.now() - startTime;
      }

    } catch (error) {
      console.error(`❌ Error checking ${cleanDomain}:`, error);
      
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('aborted')) {
          result.error = 'Request timeout';
        } else if (error.message.includes('CORS') || error.message.includes('proxy')) {
          result.error = error.message;
        } else if (error.message.includes('Network Error')) {
          result.error = 'Network error - unable to reach domain or proxy services unavailable';
        } else {
          result.error = error.message;
        }
      } else {
        result.error = 'Unknown error occurred';
      }
      result.status = 'error';
      result.responseTime = Date.now() - startTime;
    }

    return result;
  }

  async checkDomains(
    domains: string[],
    onProgress: (progress: CheckProgress) => void,
    onResult: (result: DomainResult) => void,
    proxyConfig?: ProxyConfig
  ): Promise<void> {
    this.abortController = new AbortController();
    this.isPaused = false;
    this.pausePromise = null;
    this.pauseResolve = null;

    const progress: CheckProgress = {
      total: domains.length,
      completed: 0,
      successful: 0,
      errors: 0,
    };
    
    const semaphore = this.createSemaphore(this.concurrency);

    const promises = domains.map(async (domain) => {
      if (this.abortController?.signal.aborted) return;

      return semaphore(async () => {
        if (this.abortController?.signal.aborted) return;

        const result = await this.fetchDomain(domain, proxyConfig);

        progress.completed++;
        if (result.status === 'completed' && result.paypalCommerceFound) {
          progress.successful++;
        } else if (result.status === 'error') {
          progress.errors++;
        }

        onProgress({ ...progress });
        onResult(result);
      });
    });

    await Promise.allSettled(promises);
  }

  private createSemaphore(limit: number) {
    let running = 0;
    const queue: (() => void)[] = [];

    return async <T>(fn: () => Promise<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const run = async () => {
          running++;
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            running--;
            if (queue.length > 0 && running < limit) {
              const next = queue.shift();
              next?.();
            }
          }
        };

        if (running < limit) {
          run();
        } else {
          queue.push(run);
        }
      });
    };
  }

  pause(): void {
    this.isPaused = true;
    this.pausePromise = new Promise(resolve => {
      this.pauseResolve = resolve;
    });
  }

  resume(): void {
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
      this.pausePromise = null;
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.resume();
  }
}