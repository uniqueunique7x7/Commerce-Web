import React from 'react';
import { ProxyConfig } from '../types/domain';
import { Settings, Zap, Clock, Server } from 'lucide-react';

interface ConfigPanelProps {
  concurrency: number;
  setConcurrency: (value: number) => void;
  timeout: number;
  setTimeout: (value: number) => void;
  proxyConfig: ProxyConfig | null;
  setProxyConfig: (config: ProxyConfig | null) => void;
  disabled?: boolean;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  concurrency,
  setConcurrency,
  timeout,
  setTimeout,
  proxyConfig,
  setProxyConfig,
  disabled
}) => {
  const handleProxyChange = (field: keyof ProxyConfig, value: string) => {
    if (!proxyConfig) {
      setProxyConfig({
        ip: '',
        port: 8080,
        username: '',
        password: ''
      });
      return;
    }
    
    setProxyConfig({
      ...proxyConfig,
      [field]: field === 'port' ? parseInt(value) || 0 : value
    });
  };

  const clearProxy = () => {
    setProxyConfig(null);
  };

  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
        <h3 className="text-lg font-semibold text-white">Configuration</h3>
      </div>

      <div className="space-y-5">
        {/* Performance Settings */}
        <div className="space-y-3">
          <h4 className="font-medium text-white/80 flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-cyan-400" />
            Performance
          </h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Concurrency
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                disabled={disabled}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none disabled:bg-white/5 disabled:cursor-not-allowed text-sm"
              />
              <p className="text-xs text-white/40 mt-1">Parallel requests (1-200)</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Timeout (ms)
              </label>
              <input
                type="number"
                min="1000"
                max="60000"
                step="1000"
                value={timeout}
                onChange={(e) => setTimeout(parseInt(e.target.value) || 15000)}
                disabled={disabled}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none disabled:bg-white/5 disabled:cursor-not-allowed text-sm"
              />
              <p className="text-xs text-white/40 mt-1">Request timeout</p>
            </div>
          </div>
        </div>

        {/* Proxy Settings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-white/80 flex items-center gap-2 text-sm">
              <Server className="w-4 h-4 text-purple-400" />
              Proxy Configuration
            </h4>
            {proxyConfig && (
              <button
                onClick={clearProxy}
                disabled={disabled}
                className="text-sm text-red-400 hover:text-red-300 disabled:text-white/30 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                IP Address
              </label>
              <input
                type="text"
                placeholder="proxy.example.com"
                value={proxyConfig?.ip || ''}
                onChange={(e) => handleProxyChange('ip', e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none disabled:bg-white/5 disabled:cursor-not-allowed text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Port
              </label>
              <input
                type="number"
                placeholder="8080"
                value={proxyConfig?.port || ''}
                onChange={(e) => handleProxyChange('port', e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none disabled:bg-white/5 disabled:cursor-not-allowed text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Username
              </label>
              <input
                type="text"
                placeholder="username"
                value={proxyConfig?.username || ''}
                onChange={(e) => handleProxyChange('username', e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none disabled:bg-white/5 disabled:cursor-not-allowed text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Password
              </label>
              <input
                type="password"
                placeholder="password"
                value={proxyConfig?.password || ''}
                onChange={(e) => handleProxyChange('password', e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none disabled:bg-white/5 disabled:cursor-not-allowed text-sm"
              />
            </div>
          </div>
          
          <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-3">
            <p className="text-sm text-amber-200">
              <strong>Note:</strong> Proxy configuration is optional. Due to CORS limitations, this demo simulates domain checking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};