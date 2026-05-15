import React, { useState, useCallback, useEffect } from 'react';
import { Search, Play, Square, RotateCcw, Pause, Settings, Upload, Menu, X, ArrowLeft } from 'lucide-react';
import { DomainResult, CheckProgress, ProxyConfig } from './types/domain';
import { DomainChecker } from './utils/domainChecker';
import { FileUploadModal } from './components/FileUploadModal';
import { ProgressBar } from './components/ProgressBar';
import { ResultsTable } from './components/ResultsTable';
import { ConfigModal } from './components/ConfigModal';

function App() {
  const [domains, setDomains] = useState<string[]>([]);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [progress, setProgress] = useState<CheckProgress>({ total: 0, completed: 0, successful: 0, errors: 0 });
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [domainChecker] = useState(() => new DomainChecker());
  
  // Modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Configuration state with localStorage persistence
  const [concurrency, setConcurrency] = useState(() => {
    const saved = localStorage.getItem('domainChecker_concurrency');
    return saved ? parseInt(saved, 10) : 50;
  });
  
  const [timeout, setTimeout] = useState(() => {
    const saved = localStorage.getItem('domainChecker_timeout');
    return saved ? parseInt(saved, 10) : 15000;
  });
  
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | null>(() => {
    const saved = localStorage.getItem('domainChecker_proxyConfig');
    return saved ? JSON.parse(saved) : null;
  });

  // Save configuration to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('domainChecker_concurrency', concurrency.toString());
  }, [concurrency]);

  useEffect(() => {
    localStorage.setItem('domainChecker_timeout', timeout.toString());
  }, [timeout]);

  useEffect(() => {
    if (proxyConfig) {
      localStorage.setItem('domainChecker_proxyConfig', JSON.stringify(proxyConfig));
    } else {
      localStorage.removeItem('domainChecker_proxyConfig');
    }
  }, [proxyConfig]);

  // Close mobile menu when clicking outside or on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMobileMenu(false);
      }
    };

    if (showMobileMenu) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [showMobileMenu]);

  const handleFileUpload = useCallback((uploadedDomains: string[]) => {
    setDomains(uploadedDomains);
    setResults([]);
    setProgress({ total: 0, completed: 0, successful: 0, errors: 0 });
    setShowUploadModal(false);
    setShowMobileMenu(false);
  }, []);

  const handleProgressUpdate = useCallback((newProgress: CheckProgress) => {
    setProgress(newProgress);
  }, []);

  const handleResultUpdate = useCallback((result: DomainResult) => {
    setResults(prev => {
      const existingIndex = prev.findIndex(r => r.domain === result.domain);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = result;
        return updated;
      }
      return [...prev, result];
    });
  }, []);

  const startCheck = async () => {
    if (domains.length === 0 || isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    setShowMobileMenu(false);
    if (results.length === 0) {
      setResults([]);
      setProgress({ total: domains.length, completed: 0, successful: 0, errors: 0 });
    }

    // Update checker configuration
    domainChecker['concurrency'] = concurrency;
    domainChecker['timeout'] = timeout;

    try {
      await domainChecker.checkDomains(
        domains,
        handleProgressUpdate,
        handleResultUpdate,
        proxyConfig || undefined
      );
    } catch (error) {
      console.error('Check failed:', error);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
    }
  };

  const pauseCheck = () => {
    domainChecker.pause();
    setIsPaused(true);
    setIsRunning(false);
  };

  const resumeCheck = () => {
    domainChecker.resume();
    setIsPaused(false);
    setIsRunning(true);
  };

  const stopCheck = () => {
    domainChecker.abort();
    setIsRunning(false);
    setIsPaused(false);
  };

  const resetAll = () => {
    if (isRunning) {
      domainChecker.abort();
    }
    setDomains([]);
    setResults([]);
    setProgress({ total: 0, completed: 0, successful: 0, errors: 0 });
    setIsRunning(false);
    setIsPaused(false);
    setShowMobileMenu(false);
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col overflow-hidden">
      {/* Modern Header - Fixed Height */}
      <div className="bg-white/10 backdrop-blur-xl border-b border-white/20 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 sm:p-3 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl sm:rounded-2xl shadow-lg">
                <Search className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white">PayPal Checker Pro</h1>
                <p className="text-cyan-200 text-xs sm:text-sm hidden sm:block">
                  Advanced PayPal-Commerce & Captcha Detection
                </p>
              </div>
            </div>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-xl transition-colors"
              aria-label="Toggle mobile menu"
            >
              {showMobileMenu ? (
                <X className="w-6 h-6 text-white" />
              ) : (
                <Menu className="w-6 h-6 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-4 min-h-0 w-full">
        {/* Desktop Layout */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4 h-full">
          {/* Left Sidebar - Desktop */}
          <div className="col-span-3 space-y-4 overflow-y-auto">
            {/* Quick Actions */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                Quick Actions
              </h2>
              
              <div className="space-y-3">
                <button
                  onClick={() => setShowUploadModal(true)}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none text-sm"
                >
                  <Upload className="w-4 h-4" />
                  Upload Domains
                </button>

                <button
                  onClick={() => setShowConfigModal(true)}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none text-sm"
                >
                  <Settings className="w-4 h-4" />
                  Configuration
                </button>
              </div>

              {domains.length > 0 && (
                <div className="mt-3 p-2 bg-emerald-500/20 border border-emerald-400/30 rounded-lg">
                  <p className="text-emerald-300 font-medium text-sm">
                    ✓ {domains.length} domains loaded
                  </p>
                </div>
              )}

              {/* Show current proxy status */}
              {proxyConfig && proxyConfig.ip && (
                <div className="mt-3 p-2 bg-purple-500/20 border border-purple-400/30 rounded-lg">
                  <p className="text-purple-300 font-medium text-sm">
                    🔒 Proxy: {proxyConfig.ip}:{proxyConfig.port}
                  </p>
                </div>
              )}
            </div>

            {/* Progress */}
            {(isRunning || isPaused || progress.total > 0) && (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
                <ProgressBar progress={progress} isRunning={isRunning} isPaused={isPaused} />
              </div>
            )}

            {/* Main Controls */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                Controls
              </h3>
              <div className="space-y-2">
                {!isRunning && !isPaused && (
                  <button
                    onClick={startCheck}
                    disabled={domains.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none text-sm"
                  >
                    <Play className="w-4 h-4" />
                    Start Check
                  </button>
                )}
                
                {isRunning && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={pauseCheck}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] text-sm"
                    >
                      <Pause className="w-4 h-4" />
                      Pause
                    </button>
                    <button
                      onClick={stopCheck}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] text-sm"
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                  </div>
                )}

                {isPaused && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={resumeCheck}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] text-sm"
                    >
                      <Play className="w-4 h-4" />
                      Resume
                    </button>
                    <button
                      onClick={stopCheck}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] text-sm"
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                  </div>
                )}
                
                <button
                  onClick={resetAll}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 disabled:from-slate-800 disabled:to-slate-900 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset All
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Results Desktop */}
          <div className="col-span-9 min-h-0">
            <ResultsTable results={results} />
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden h-full flex flex-col">
          {/* Mobile Controls Panel */}
          {showMobileMenu && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden">
              <div className="fixed top-0 left-0 w-80 h-full bg-slate-900/95 backdrop-blur-xl border-r border-white/20 overflow-y-auto">
                {/* Mobile Menu Header with Back Button */}
                <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl border-b border-white/20 p-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowMobileMenu(false)}
                      className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                      aria-label="Close mobile menu"
                    >
                      <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <h2 className="text-lg font-semibold text-white">Controls</h2>
                  </div>
                </div>

                {/* Mobile Menu Content */}
                <div className="p-4 space-y-4">
                  {/* Quick Actions */}
                  <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                      Quick Actions
                    </h3>
                    
                    <div className="space-y-3">
                      <button
                        onClick={() => setShowUploadModal(true)}
                        disabled={isRunning}
                        className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Domains
                      </button>

                      <button
                        onClick={() => setShowConfigModal(true)}
                        disabled={isRunning}
                        className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm"
                      >
                        <Settings className="w-4 h-4" />
                        Configuration
                      </button>
                    </div>

                    {domains.length > 0 && (
                      <div className="mt-3 p-2 bg-emerald-500/20 border border-emerald-400/30 rounded-lg">
                        <p className="text-emerald-300 font-medium text-sm">
                          ✓ {domains.length} domains loaded
                        </p>
                      </div>
                    )}

                    {/* Show current proxy status on mobile too */}
                    {proxyConfig && proxyConfig.ip && (
                      <div className="mt-3 p-2 bg-purple-500/20 border border-purple-400/30 rounded-lg">
                        <p className="text-purple-300 font-medium text-sm">
                          🔒 Proxy: {proxyConfig.ip}:{proxyConfig.port}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Progress */}
                  {(isRunning || isPaused || progress.total > 0) && (
                    <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
                      <ProgressBar progress={progress} isRunning={isRunning} isPaused={isPaused} />
                    </div>
                  )}

                  {/* Main Controls */}
                  <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      Controls
                    </h3>
                    <div className="space-y-3">
                      {!isRunning && !isPaused && (
                        <button
                          onClick={startCheck}
                          disabled={domains.length === 0}
                          className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm"
                        >
                          <Play className="w-4 h-4" />
                          Start Check
                        </button>
                      )}
                      
                      {isRunning && (
                        <div className="space-y-2">
                          <button
                            onClick={pauseCheck}
                            className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm"
                          >
                            <Pause className="w-4 h-4" />
                            Pause Check
                          </button>
                          <button
                            onClick={stopCheck}
                            className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm"
                          >
                            <Square className="w-4 h-4" />
                            Stop Check
                          </button>
                        </div>
                      )}

                      {isPaused && (
                        <div className="space-y-2">
                          <button
                            onClick={resumeCheck}
                            className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm"
                          >
                            <Play className="w-4 h-4" />
                            Resume Check
                          </button>
                          <button
                            onClick={stopCheck}
                            className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg text-sm"
                          >
                            <Square className="w-4 h-4" />
                            Stop Check
                          </button>
                        </div>
                      )}
                      
                      <button
                        onClick={resetAll}
                        disabled={isRunning}
                        className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 disabled:from-slate-800 disabled:to-slate-900 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 text-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset All
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Results - Full Height */}
          <div className="flex-1 min-h-0">
            <ResultsTable results={results} />
          </div>
        </div>
      </div>

      {/* Modals */}
      <FileUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onFileUpload={handleFileUpload}
      />

      <ConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        concurrency={concurrency}
        setConcurrency={setConcurrency}
        timeout={timeout}
        setTimeout={setTimeout}
        proxyConfig={proxyConfig}
        setProxyConfig={setProxyConfig}
      />
    </div>
  );
}

export default App;