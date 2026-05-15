import React, { useState } from 'react';
import { ProxyConfig } from '../types/domain';
import { Settings, Zap, Clock, Server, X, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  concurrency: number;
  setConcurrency: (value: number) => void;
  timeout: number;
  setTimeout: (value: number) => void;
  proxyConfig: ProxyConfig | null;
  setProxyConfig: (config: ProxyConfig | null) => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  concurrency,
  setConcurrency,
  timeout,
  setTimeout,
  proxyConfig,
  setProxyConfig,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validateConfig = () => {
    const newErrors: Record<string, string> = {};

    if (concurrency < 1 || concurrency > 200) {
      newErrors.concurrency = 'Concurrency must be between 1 and 200';
    }

    if (timeout < 1000 || timeout > 60000) {
      newErrors.timeout = 'Timeout must be between 1000ms and 60000ms';
    }

    if (proxyConfig) {
      if (!proxyConfig.ip.trim()) {
        newErrors.proxyIp = 'Proxy IP/hostname is required';
      }
      if (!proxyConfig.port || proxyConfig.port < 1 || proxyConfig.port > 65535) {
        newErrors.proxyPort = 'Port must be between 1 and 65535';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateConfig()) {
      onClose();
    }
  };

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

    // Clear related errors
    if (field === 'ip') {
      const newErrors = { ...errors };
      delete newErrors.proxyIp;
      setErrors(newErrors);
    }
    if (field === 'port') {
      const newErrors = { ...errors };
      delete newErrors.proxyPort;
      setErrors(newErrors);
    }
  };

  const clearProxy = () => {
    setProxyConfig(null);
    const newErrors = { ...errors };
    delete newErrors.proxyIp;
    delete newErrors.proxyPort;
    setErrors(newErrors);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const testProxyConnection = () => {
    // In a real app, this would test the proxy connection
    alert('Proxy test functionality would be implemented in production');
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-purple-400" />
            Configuration
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/60 hover:text-white" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Performance Settings */}
          <div className="space-y-4">
            <h3 className="font-medium text-white/80 flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-cyan-400" />
              Performance Settings
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Concurrency (Parallel Requests)
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={concurrency}
                  onChange={(e) => {
                    setConcurrency(parseInt(e.target.value) || 1);
                    const newErrors = { ...errors };
                    delete newErrors.concurrency;
                    setErrors(newErrors);
                  }}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none ${
                    errors.concurrency ? 'border-red-400' : 'border-white/20'
                  }`}
                />
                {errors.concurrency && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.concurrency}
                  </p>
                )}
                <p className="text-xs text-white/40 mt-2">
                  Higher values = faster checking but more resource usage (1-200)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Request Timeout (milliseconds)
                </label>
                <input
                  type="number"
                  min="1000"
                  max="60000"
                  step="1000"
                  value={timeout}
                  onChange={(e) => {
                    setTimeout(parseInt(e.target.value) || 15000);
                    const newErrors = { ...errors };
                    delete newErrors.timeout;
                    setErrors(newErrors);
                  }}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none ${
                    errors.timeout ? 'border-red-400' : 'border-white/20'
                  }`}
                />
                {errors.timeout && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.timeout}
                  </p>
                )}
                <p className="text-xs text-white/40 mt-2">
                  Maximum time to wait for each request (1-60 seconds)
                </p>
              </div>
            </div>
          </div>

          {/* Proxy Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white/80 flex items-center gap-2 text-lg">
                <Server className="w-5 h-5 text-purple-400" />
                Proxy Configuration
              </h3>
              <div className="flex gap-2">
                {proxyConfig && proxyConfig.ip && (
                  <button
                    onClick={testProxyConnection}
                    className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors px-3 py-1 rounded-lg hover:bg-cyan-500/20"
                  >
                    Test Connection
                  </button>
                )}
                {proxyConfig && (
                  <button
                    onClick={clearProxy}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors px-3 py-1 rounded-lg hover:bg-red-500/20"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  IP Address / Hostname *
                </label>
                <input
                  type="text"
                  placeholder="proxy.example.com"
                  value={proxyConfig?.ip || ''}
                  onChange={(e) => handleProxyChange('ip', e.target.value)}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none ${
                    errors.proxyIp ? 'border-red-400' : 'border-white/20'
                  }`}
                />
                {errors.proxyIp && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.proxyIp}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Port *
                </label>
                <input
                  type="number"
                  placeholder="8080"
                  min="1"
                  max="65535"
                  value={proxyConfig?.port || ''}
                  onChange={(e) => handleProxyChange('port', e.target.value)}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none ${
                    errors.proxyPort ? 'border-red-400' : 'border-white/20'
                  }`}
                />
                {errors.proxyPort && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.proxyPort}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Username (Optional)
                </label>
                <input
                  type="text"
                  placeholder="username"
                  value={proxyConfig?.username || ''}
                  onChange={(e) => handleProxyChange('username', e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Password (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="password"
                    value={proxyConfig?.password || ''}
                    onChange={(e) => handleProxyChange('password', e.target.value)}
                    className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-200">
                  <p className="font-medium mb-1">Important Note</p>
                  <p>
                    Proxy configuration is optional and simulated in this demo. In production, 
                    you would need a backend service to handle actual HTTP requests through proxies 
                    due to browser CORS limitations.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-white/20">
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                Save Configuration
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all duration-200 border border-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};