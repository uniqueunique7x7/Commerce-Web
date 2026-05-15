import React, { useState, useMemo } from 'react';
import { DomainResult } from '../types/domain';
import { CheckCircle, XCircle, Clock, Shield, CreditCard, Download, Search, Filter, TrendingUp, ExternalLink, Copy, Check } from 'lucide-react';

interface ResultsTableProps {
  results: DomainResult[];
}

type FilterType = 'paypal' | 'all' | 'captcha' | 'both' | 'errors';
type SortField = 'domain' | 'status' | 'responseTime';
type SortDirection = 'asc' | 'desc';

export const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterType>('paypal'); // Default to PayPal only
  const [sortField, setSortField] = useState<SortField>('domain');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  const filteredAndSortedResults = useMemo(() => {
    let filtered = results.filter(result => {
      const matchesSearch = result.domain.toLowerCase().includes(searchTerm.toLowerCase());
      
      switch (filter) {
        case 'paypal':
          return matchesSearch && result.paypalCommerceFound;
        case 'captcha':
          return matchesSearch && result.captchaFound && !result.paypalCommerceFound;
        case 'both':
          return matchesSearch && result.paypalCommerceFound && result.captchaFound;
        case 'errors':
          return matchesSearch && result.status === 'error';
        case 'all':
          return matchesSearch;
        default:
          return matchesSearch && result.paypalCommerceFound;
      }
    });

    // Sort results
    filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'domain':
          aValue = a.domain.toLowerCase();
          bValue = b.domain.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'responseTime':
          aValue = a.responseTime || 0;
          bValue = b.responseTime || 0;
          break;
        default:
          aValue = a.domain.toLowerCase();
          bValue = b.domain.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [results, searchTerm, filter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const copyDomain = async (domain: string) => {
    try {
      await navigator.clipboard.writeText(domain);
      setCopiedDomain(domain);
      setTimeout(() => setCopiedDomain(null), 2000);
    } catch (err) {
      console.error('Failed to copy domain:', err);
    }
  };

  const openDomain = (domain: string) => {
    window.open(`https://${domain}`, '_blank', 'noopener,noreferrer');
  };

  const downloadPayPalOnly = () => {
    const paypalOnlyDomains = results
      .filter(r => r.paypalCommerceFound && !r.captchaFound)
      .map(r => `https://${r.domain}`)
      .join('\n');
    
    const blob = new Blob([paypalOnlyDomains], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paypal-only-domains-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPayPalWithCaptcha = () => {
    const paypalWithCaptchaDomains = results
      .filter(r => r.paypalCommerceFound && r.captchaFound)
      .map(r => `https://${r.domain}`)
      .join('\n');
    
    const blob = new Blob([paypalWithCaptchaDomains], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paypal-captcha-domains-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllResults = () => {
    const csvContent = [
      'Domain,Status,PayPal Commerce,Captcha,Response Time,Error',
      ...results.map(r => 
        `https://${r.domain},${r.status},${r.paypalCommerceFound ? 'Yes' : 'No'},${r.captchaFound ? 'Yes' : 'No'},${r.responseTime || ''},${r.error || ''}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `domain-check-results-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (result: DomainResult) => {
    switch (result.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'checking':
        return <Clock className="w-4 h-4 text-cyan-400 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const stats = {
    total: results.length,
    paypal: results.filter(r => r.paypalCommerceFound).length,
    paypalOnly: results.filter(r => r.paypalCommerceFound && !r.captchaFound).length,
    captcha: results.filter(r => r.captchaFound).length,
    both: results.filter(r => r.paypalCommerceFound && r.captchaFound).length,
    errors: results.filter(r => r.status === 'error').length
  };

  if (results.length === 0) {
    return (
      <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-16 h-16 text-white/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Ready to Analyze</h3>
          <p className="text-white/60">Upload domains and start checking to see results here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex flex-col">
      {/* Header with Stats - Fixed Height */}
      <div className="flex-shrink-0 p-4 border-b border-white/20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
            Results ({filteredAndSortedResults.length} of {results.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={downloadPayPalOnly}
              disabled={stats.paypalOnly === 0}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none text-sm"
              title="Download PayPal-only domains (no captcha)"
            >
              <Download className="w-4 h-4" />
              PayPal ({stats.paypalOnly})
            </button>
            <button
              onClick={downloadPayPalWithCaptcha}
              disabled={stats.both === 0}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none text-sm"
              title="Download PayPal domains with captcha"
            >
              <Download className="w-4 h-4" />
              PayPal+Captcha ({stats.both})
            </button>
            <button
              onClick={downloadAllResults}
              disabled={results.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none text-sm"
              title="Download all results as CSV"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>

        {/* Quick Stats - Compact */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-white">{stats.total}</div>
            <div className="text-xs text-white/60">Total</div>
          </div>
          <div className="bg-emerald-500/20 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-emerald-300">{stats.paypalOnly}</div>
            <div className="text-xs text-emerald-200">PayPal Only</div>
          </div>
          <div className="bg-purple-500/20 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-purple-300">{stats.both}</div>
            <div className="text-xs text-purple-200">PayPal+Captcha</div>
          </div>
          <div className="bg-orange-500/20 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-orange-300">{stats.captcha}</div>
            <div className="text-xs text-orange-200">Captcha Only</div>
          </div>
          <div className="bg-red-500/20 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-red-300">{stats.errors}</div>
            <div className="text-xs text-red-200">Errors</div>
          </div>
        </div>

        {/* Search and Filter - Compact */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40 w-4 h-4" />
            <input
              type="text"
              placeholder="Search domains..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none text-sm"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40 w-4 h-4" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="pl-10 pr-8 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none text-sm min-w-[140px]"
            >
              <option value="paypal" className="bg-slate-800">PayPal Only</option>
              <option value="both" className="bg-slate-800">PayPal + Captcha</option>
              <option value="captcha" className="bg-slate-800">Captcha Only</option>
              <option value="all" className="bg-slate-800">All Results</option>
              <option value="errors" className="bg-slate-800">Errors Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Scrollable Table - Takes remaining height */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white/10 backdrop-blur-xl border-b border-white/20">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-white/80 text-sm">Status</th>
                <th 
                  className="text-left px-3 py-2 font-semibold text-white/80 text-sm cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('domain')}
                >
                  Domain {getSortIcon('domain')}
                </th>
                <th className="text-center px-3 py-2 font-semibold text-white/80 text-sm">PayPal</th>
                <th className="text-center px-3 py-2 font-semibold text-white/80 text-sm">Captcha</th>
                <th 
                  className="text-right px-3 py-2 font-semibold text-white/80 text-sm cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('responseTime')}
                >
                  Time {getSortIcon('responseTime')}
                </th>
                <th className="text-center px-3 py-2 font-semibold text-white/80 text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedResults.map((result, index) => (
                <tr key={index} className="border-b border-white/10 hover:bg-white/5 transition-colors duration-150">
                  <td className="px-3 py-2">
                    {getStatusIcon(result)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-white text-sm truncate max-w-[200px]" title={result.domain}>
                      {result.domain}
                    </div>
                    {result.error && (
                      <div className="text-xs text-red-400 mt-1 truncate max-w-[200px]" title={result.error}>
                        {result.error}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {result.paypalCommerceFound ? (
                      <div className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-medium">
                        <CreditCard className="w-3 h-3" />
                        Found
                      </div>
                    ) : (
                      <span className="text-white/30 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {result.captchaFound ? (
                      <div className="inline-flex items-center gap-1 px-2 py-1 bg-orange-500/20 text-orange-300 rounded-lg text-xs font-medium">
                        <Shield className="w-3 h-3" />
                        Found
                      </div>
                    ) : (
                      <span className="text-white/30 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-white/60">
                    {result.responseTime ? `${result.responseTime}ms` : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => copyDomain(result.domain)}
                        className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors"
                        title="Copy domain"
                      >
                        {copiedDomain === result.domain ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => openDomain(result.domain)}
                        className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors"
                        title="Open domain"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredAndSortedResults.length === 0 && (
            <div className="text-center py-12">
              <p className="text-white/60">
                {filter === 'paypal' 
                  ? 'No PayPal domains found yet. Upload domains and start checking to see results.'
                  : 'No results match your current filter criteria.'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};