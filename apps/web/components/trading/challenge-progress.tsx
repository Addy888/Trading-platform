'use client';

interface ChallengeProgressProps {
  progress: {
    accountStatus: string;
    accountResult: string;
    overallProgress: string;
    rules: {
      profitTarget?: {
        requiredProfit: string;
        currentProfit: string;
        remainingProfit: string;
        progressPercentage: string;
        completed: boolean;
      };
      maxDrawdown?: {
        maximumAllowedLoss: string;
        currentDrawdown: string;
        remainingLossAllowance: string;
        usagePercentage: string;
        breached: boolean;
      };
      dailyLoss?: {
        dailyLossLimit: string;
        currentDailyLoss: string;
        remainingDailyLoss: string;
        usagePercentage: string;
        breached: boolean;
      };
      minimumTradingDays?: {
        requiredTradingDays: number;
        completedTradingDays: number;
        remainingTradingDays: number;
        progressPercentage: string;
        completed: boolean;
      };
    };
  };
}

export function ChallengeProgress({ progress }: ChallengeProgressProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-600';
      case 'PASSED': return 'bg-blue-600';
      case 'BREACHED': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };

  const getProgressBarColor = (percentage: number, isRisk: boolean = false) => {
    if (isRisk) {
      if (percentage >= 80) return 'bg-red-500';
      if (percentage >= 60) return 'bg-yellow-500';
      return 'bg-green-500';
    } else {
      if (percentage >= 80) return 'bg-green-500';
      if (percentage >= 50) return 'bg-blue-500';
      return 'bg-gray-500';
    }
  };

  return (
    <div className="bg-gray-900 text-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Challenge Progress
        </h3>
        <span className={`px-3 py-1 rounded text-xs font-semibold ${getStatusColor(progress.accountStatus)}`}>
          {progress.accountResult}
        </span>
      </div>

      {/* Overall Progress */}
      <div className="bg-gray-800 rounded-lg p-3">
        <div className="text-xs text-gray-400 mb-2">Overall Progress</div>
        <div className="w-full bg-gray-700 rounded-full h-3 mb-1">
          <div
            className={`h-3 rounded-full transition-all ${getProgressBarColor(parseFloat(progress.overallProgress))}`}
            style={{ width: `${Math.min(100, Math.max(0, parseFloat(progress.overallProgress)))}%` }}
          />
        </div>
        <div className="text-right text-xs text-gray-300">{parseFloat(progress.overallProgress).toFixed(1)}%</div>
      </div>

      {/* Profit Target */}
      {progress.rules.profitTarget && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400">Profit Target</div>
            {progress.rules.profitTarget.completed && (
              <span className="text-xs text-green-400">✓ Completed</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${getProgressBarColor(parseFloat(progress.rules.profitTarget.progressPercentage))}`}
              style={{ width: `${Math.min(100, Math.max(0, parseFloat(progress.rules.profitTarget.progressPercentage)))}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-400">Required:</div>
              <div className="font-mono">${progress.rules.profitTarget.requiredProfit}</div>
            </div>
            <div>
              <div className="text-gray-400">Current:</div>
              <div className={`font-mono ${parseFloat(progress.rules.profitTarget.currentProfit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${progress.rules.profitTarget.currentProfit}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Max Drawdown */}
      {progress.rules.maxDrawdown && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400">Max Drawdown</div>
            {progress.rules.maxDrawdown.breached ? (
              <span className="text-xs text-red-400">✗ Breached</span>
            ) : (
              <span className="text-xs text-green-400">✓ Safe</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${getProgressBarColor(parseFloat(progress.rules.maxDrawdown.usagePercentage), true)}`}
              style={{ width: `${Math.min(100, Math.max(0, parseFloat(progress.rules.maxDrawdown.usagePercentage)))}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-400">Max Loss:</div>
              <div className="font-mono">${progress.rules.maxDrawdown.maximumAllowedLoss}</div>
            </div>
            <div>
              <div className="text-gray-400">Current:</div>
              <div className="font-mono text-yellow-400">
                ${progress.rules.maxDrawdown.currentDrawdown}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Loss */}
      {progress.rules.dailyLoss && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400">Daily Loss Limit</div>
            {progress.rules.dailyLoss.breached ? (
              <span className="text-xs text-red-400">✗ Breached</span>
            ) : (
              <span className="text-xs text-green-400">✓ Safe</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${getProgressBarColor(parseFloat(progress.rules.dailyLoss.usagePercentage), true)}`}
              style={{ width: `${Math.min(100, Math.max(0, parseFloat(progress.rules.dailyLoss.usagePercentage)))}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-400">Limit:</div>
              <div className="font-mono">${progress.rules.dailyLoss.dailyLossLimit}</div>
            </div>
            <div>
              <div className="text-gray-400">Today:</div>
              <div className="font-mono text-yellow-400">
                ${progress.rules.dailyLoss.currentDailyLoss}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Min Trading Days */}
      {progress.rules.minimumTradingDays && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400">Min Trading Days</div>
            {progress.rules.minimumTradingDays.completed && (
              <span className="text-xs text-green-400">✓ Completed</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${getProgressBarColor(parseFloat(progress.rules.minimumTradingDays.progressPercentage))}`}
              style={{ width: `${Math.min(100, Math.max(0, parseFloat(progress.rules.minimumTradingDays.progressPercentage)))}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-400">Required:</div>
              <div className="font-mono">{progress.rules.minimumTradingDays.requiredTradingDays} days</div>
            </div>
            <div>
              <div className="text-gray-400">Completed:</div>
              <div className="font-mono text-blue-400">
                {progress.rules.minimumTradingDays.completedTradingDays} days
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
