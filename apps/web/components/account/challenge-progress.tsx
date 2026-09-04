import { ChallengeProgress } from '@/lib/trading-accounts-api';

interface ChallengeProgressProps {
  progress: ChallengeProgress;
}

export function ChallengeProgressComponent({ progress }: ChallengeProgressProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-600';
      case 'PASSED':
        return 'text-blue-600';
      case 'BREACHED':
      case 'SUSPENDED':
      case 'CLOSED':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Your account is active and available for simulated trading.';
      case 'PASSED':
        return 'Congratulations! You have successfully passed this challenge.';
      case 'BREACHED':
        return 'Trading is disabled because the challenge rules were breached.';
      case 'SUSPENDED':
        return 'Trading is currently disabled for this account.';
      case 'CLOSED':
        return 'This account is closed and no longer available for trading.';
      default:
        return 'Account status unknown.';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Progress</h2>
      
      {/* Overall Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Overall Progress</span>
          <span className="text-lg font-bold text-gray-900">{progress.overallProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${Math.min(100, parseFloat(progress.overallProgress))}%` }}
          />
        </div>
        <div className="mt-3">
          <div className={`font-semibold ${getStatusColor(progress.accountStatus)}`}>
            {progress.accountResult}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {getStatusMessage(progress.accountStatus)}
          </p>
        </div>
      </div>

      {/* Profit Target */}
      {progress.rules.profitTarget && (
        <div className="mb-4 p-4 border border-gray-200 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-semibold text-gray-900">Profit Target</h3>
              <p className="text-sm text-gray-600">
                Reach ${progress.rules.profitTarget.requiredProfit} profit
              </p>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              progress.rules.profitTarget.completed
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {progress.rules.profitTarget.completed ? 'Completed' : 'In Progress'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Current Profit:</span>
              <span className={`font-semibold ${
                parseFloat(progress.rules.profitTarget.currentProfit) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                ${progress.rules.profitTarget.currentProfit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining:</span>
              <span className="font-semibold text-gray-900">
                ${progress.rules.profitTarget.remainingProfit}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.profitTarget.progressPercentage))}%`,
                }}
              />
            </div>
            <div className="text-right text-gray-600">
              {progress.rules.profitTarget.progressPercentage}% Complete
            </div>
          </div>
        </div>
      )}

      {/* Maximum Drawdown */}
      {progress.rules.maxDrawdown && (
        <div className="mb-4 p-4 border border-gray-200 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-semibold text-gray-900">Maximum Drawdown</h3>
              <p className="text-sm text-gray-600">
                Do not exceed ${progress.rules.maxDrawdown.maximumAllowedLoss} loss
              </p>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              progress.rules.maxDrawdown.breached
                ? 'bg-red-100 text-red-700'
                : parseFloat(progress.rules.maxDrawdown.usagePercentage) > 80
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {progress.rules.maxDrawdown.breached ? 'Breached' : 'Safe'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Current Drawdown:</span>
              <span className="font-semibold text-red-600">
                ${progress.rules.maxDrawdown.currentDrawdown}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining Allowance:</span>
              <span className="font-semibold text-gray-900">
                ${progress.rules.maxDrawdown.remainingLossAllowance}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full ${
                  parseFloat(progress.rules.maxDrawdown.usagePercentage) > 80
                    ? 'bg-red-600'
                    : parseFloat(progress.rules.maxDrawdown.usagePercentage) > 50
                    ? 'bg-yellow-600'
                    : 'bg-green-600'
                }`}
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.maxDrawdown.usagePercentage))}%`,
                }}
              />
            </div>
            <div className="text-right text-gray-600">
              {progress.rules.maxDrawdown.usagePercentage}% Used
            </div>
          </div>
        </div>
      )}

      {/* Daily Loss */}
      {progress.rules.dailyLoss && (
        <div className="mb-4 p-4 border border-gray-200 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-semibold text-gray-900">Daily Loss Limit</h3>
              <p className="text-sm text-gray-600">
                Daily limit: ${progress.rules.dailyLoss.dailyLossLimit}
              </p>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              progress.rules.dailyLoss.breached
                ? 'bg-red-100 text-red-700'
                : parseFloat(progress.rules.dailyLoss.usagePercentage) > 80
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {progress.rules.dailyLoss.breached ? 'Breached' : 'Safe'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Today's Loss:</span>
              <span className="font-semibold text-red-600">
                ${progress.rules.dailyLoss.currentDailyLoss}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining Today:</span>
              <span className="font-semibold text-gray-900">
                ${progress.rules.dailyLoss.remainingDailyLoss}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full ${
                  parseFloat(progress.rules.dailyLoss.usagePercentage) > 80
                    ? 'bg-red-600'
                    : parseFloat(progress.rules.dailyLoss.usagePercentage) > 50
                    ? 'bg-yellow-600'
                    : 'bg-green-600'
                }`}
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.dailyLoss.usagePercentage))}%`,
                }}
              />
            </div>
            <div className="text-right text-gray-600">
              {progress.rules.dailyLoss.usagePercentage}% Used
            </div>
          </div>
        </div>
      )}

      {/* Minimum Trading Days */}
      {progress.rules.minimumTradingDays && (
        <div className="p-4 border border-gray-200 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-semibold text-gray-900">Minimum Trading Days</h3>
              <p className="text-sm text-gray-600">
                Trade on at least {progress.rules.minimumTradingDays.requiredTradingDays} days
              </p>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              progress.rules.minimumTradingDays.completed
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {progress.rules.minimumTradingDays.completed ? 'Completed' : 'In Progress'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Days Traded:</span>
              <span className="font-semibold text-gray-900">
                {progress.rules.minimumTradingDays.completedTradingDays} / {progress.rules.minimumTradingDays.requiredTradingDays}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining Days:</span>
              <span className="font-semibold text-gray-900">
                {progress.rules.minimumTradingDays.remainingTradingDays}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.minimumTradingDays.progressPercentage))}%`,
                }}
              />
            </div>
            <div className="text-right text-gray-600">
              {progress.rules.minimumTradingDays.progressPercentage}% Complete
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
