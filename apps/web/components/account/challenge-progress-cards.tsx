'use client';

import { ChallengeProgress } from '@/lib/analytics-api';

interface ChallengeProgressCardsProps {
  progress: ChallengeProgress;
}

export function ChallengeProgressCards({ progress }: ChallengeProgressCardsProps) {
  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Profit Target */}
      {progress.rules.profitTarget && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Profit Target</h3>
            {progress.rules.profitTarget.completed && (
              <span className="text-green-600 text-sm font-semibold">✓ Completed</span>
            )}
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Progress</span>
              <span className="font-semibold text-gray-900">
                {progress.rules.profitTarget.progressPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  progress.rules.profitTarget.completed ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.profitTarget.progressPercentage))}%`,
                }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatCurrency(progress.rules.profitTarget.currentProfit)} /{' '}
              {formatCurrency(progress.rules.profitTarget.requiredProfit)}
            </div>
            <div className="text-sm text-gray-600">
              Remaining: {formatCurrency(progress.rules.profitTarget.remainingProfit)}
            </div>
          </div>
        </div>
      )}

      {/* Maximum Drawdown */}
      {progress.rules.maxDrawdown && (
        <div className={`border rounded-lg p-6 ${
          progress.rules.maxDrawdown.breached ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Maximum Drawdown</h3>
            {progress.rules.maxDrawdown.breached && (
              <span className="text-red-600 text-sm font-semibold">⚠ Breached</span>
            )}
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Usage</span>
              <span className="font-semibold text-gray-900">
                {progress.rules.maxDrawdown.usagePercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  parseFloat(progress.rules.maxDrawdown.usagePercentage) > 80
                    ? 'bg-red-500'
                    : parseFloat(progress.rules.maxDrawdown.usagePercentage) > 60
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.maxDrawdown.usagePercentage))}%`,
                }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatCurrency(progress.rules.maxDrawdown.currentDrawdown)} /{' '}
              {formatCurrency(progress.rules.maxDrawdown.maximumAllowedLoss)}
            </div>
            <div className="text-sm text-gray-600">
              Remaining: {formatCurrency(progress.rules.maxDrawdown.remainingLossAllowance)}
            </div>
          </div>
        </div>
      )}

      {/* Daily Loss */}
      {progress.rules.dailyLoss && (
        <div className={`border rounded-lg p-6 ${
          progress.rules.dailyLoss.breached ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Daily Loss Limit</h3>
            {progress.rules.dailyLoss.breached && (
              <span className="text-red-600 text-sm font-semibold">⚠ Breached</span>
            )}
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Usage</span>
              <span className="font-semibold text-gray-900">
                {progress.rules.dailyLoss.usagePercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  parseFloat(progress.rules.dailyLoss.usagePercentage) > 80
                    ? 'bg-red-500'
                    : parseFloat(progress.rules.dailyLoss.usagePercentage) > 60
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.dailyLoss.usagePercentage))}%`,
                }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {formatCurrency(progress.rules.dailyLoss.currentDailyLoss)} /{' '}
              {formatCurrency(progress.rules.dailyLoss.dailyLossLimit)}
            </div>
            <div className="text-sm text-gray-600">
              Remaining: {formatCurrency(progress.rules.dailyLoss.remainingDailyLoss)}
            </div>
          </div>
        </div>
      )}

      {/* Minimum Trading Days */}
      {progress.rules.minimumTradingDays && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Minimum Trading Days</h3>
            {progress.rules.minimumTradingDays.completed && (
              <span className="text-green-600 text-sm font-semibold">✓ Completed</span>
            )}
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Progress</span>
              <span className="font-semibold text-gray-900">
                {progress.rules.minimumTradingDays.progressPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  progress.rules.minimumTradingDays.completed ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{
                  width: `${Math.min(100, parseFloat(progress.rules.minimumTradingDays.progressPercentage))}%`,
                }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {progress.rules.minimumTradingDays.completedTradingDays} /{' '}
              {progress.rules.minimumTradingDays.requiredTradingDays} Days
            </div>
            <div className="text-sm text-gray-600">
              Remaining: {progress.rules.minimumTradingDays.remainingTradingDays} days
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
