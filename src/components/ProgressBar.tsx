import React from 'react';
import { CheckProgress } from '../types/domain';
import { Play, Pause } from 'lucide-react';

interface ProgressBarProps {
  progress: CheckProgress;
  isRunning: boolean;
  isPaused?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, isRunning, isPaused }) => {
  const percentage = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const successRate = progress.completed > 0 ? (progress.successful / progress.completed) * 100 : 0;

  const getStatusText = () => {
    if (isPaused) return 'Paused';
    if (isRunning) return 'Checking Domains...';
    return 'Check Complete';
  };

  const getStatusIcon = () => {
    if (isPaused) return <Pause className="w-4 h-4 text-amber-400" />;
    if (isRunning) return <div className="w-4 h-4 bg-cyan-400 rounded-full animate-pulse" />;
    return <div className="w-4 h-4 bg-emerald-400 rounded-full" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          {getStatusIcon()}
          {getStatusText()}
        </h3>
        <span className="text-sm text-white/60">
          {progress.completed} / {progress.total}
        </span>
      </div>
      
      <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ease-out ${
            isPaused 
              ? 'bg-gradient-to-r from-amber-400 to-orange-400' 
              : 'bg-gradient-to-r from-emerald-400 to-cyan-400'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-emerald-300">{progress.successful}</div>
          <div className="text-xs text-emerald-200">PayPal Found</div>
        </div>
        
        <div className="bg-red-500/20 rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-red-300">{progress.errors}</div>
          <div className="text-xs text-red-200">Errors</div>
        </div>
      </div>

      <div className="bg-purple-500/20 rounded-xl p-3 text-center">
        <div className="text-lg font-bold text-purple-300">{successRate.toFixed(1)}%</div>
        <div className="text-xs text-purple-200">PayPal Success Rate</div>
      </div>
    </div>
  );
};