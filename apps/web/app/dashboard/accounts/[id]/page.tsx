'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { tradingAccountsApi, type TradingAccount, type ChallengeProgress } from '@/lib/trading-accounts-api';
import { tradingApi, type AccountPerformance } from '@/lib/trading-api';

export default function AccountDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const accountId = params.id as string;

  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [performance, setPerformance] = useState<AccountPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      loadData();
    }
  }, [accessToken, accountId]);

  const loadData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError(null);

      const [accountData, progressData, performanceData] = await Promise.all([
        tradingAccountsApi.getUserAccount(accessToken, accountId),
        tradingAccountsApi.getAccountProgress(accessToken, accountId),
        tradingApi.getAccountPerformance(accessToken, accountId),
      ]);

      setAccount(accountData);
      setProgress(progressData);
      setPerformance(performanceData);
    } catch (err: any) {
      console.error('Failed to load account:', err);
      setError(err.message || 'Failed to load account');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requireRole="USER">
        <UserLayout>
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-600">Loading account details...</div>
          </div>
        </UserLayout>
      </ProtectedRoute>
    );
  }

  if (error || !account) {
    return (
      <ProtectedRoute requireRole="USER">
        <UserLayout>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-700">{error || 'Account not found'}</p>
            <button
              onClick={() => router.push('/dashboard/accounts')}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Back to Accounts
            </button>
          </div>
        </UserLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Account Details</h1>
                <p className="text-gray-600 mt-1">Account: {account.accountNumber}</p>
              </div>
              <div className="flex gap-3">
                {account.status === 'ACTIVE' && (
                  <button
                    onClick={() => router.push(`/dashboard/trading/${account.id}`)}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                  >
                    Open Trading Terminal
                  </button>
                )}
                <button
                  onClick={() => router.push('/dashboard/accounts')}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Back
                </button>
              </div>
            </div>
          </div>

          {/* Account Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Account Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <div className="text-sm text-gray-600 mb-1">Status</div>
                <span
                  className={`inline-block px-3 py-1 rounded text-sm font-semibold ${
                    account.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800'
                      : account.status === 'PASSED'
                      ? 'bg-blue-100 text-blue-800'
                      : account.status === 'BREACHED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {account.status}
                </span>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Challenge Plan</div>
                <div className="text-lg font-semibold text-gray-900">
                  {account.challengePlan?.name || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Created</div>
                <div className="text-lg font-semibold text-gray-900">
                  {new Date(account.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Started</div>
                <div className="text-lg font-semibold text-gray-900">
                  {account.startedAt ? new Date(account.startedAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Financial Overview */}
          {performance && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Financial Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Initial Balance</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${parseFloat(performance.initialBalance).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Current Balance</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${parseFloat(performance.currentBalance).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Equity</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${parseFloat(performance.equity).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Return</div>
                  <div
                    className={`text-2xl font-bold ${
                      parseFloat(performance.returnPercentage) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {parseFloat(performance.returnPercentage) >= 0 ? '+' : ''}
                    {parseFloat(performance.returnPercentage).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Total Trades</div>
                  <div className="text-xl font-semibold text-gray-900">{performance.totalTrades}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Open Trades</div>
                  <div className="text-xl font-semibold text-blue-600">{performance.openTrades}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Closed Trades</div>
                  <div className="text-xl font-semibold text-gray-600">{performance.closedTrades}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Total P&L</div>
                  <div
                    className={`text-xl font-semibold ${
                      parseFloat(performance.totalPnl) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    ${parseFloat(performance.totalPnl).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Challenge Progress */}
          {progress && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Challenge Progress</h2>
              
              {/* Overall Progress */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">Overall Progress</span>
                  <span className="text-sm font-semibold text-blue-600">{progress.overallProgress}</span>
                </div>
                <div className="text-xs text-gray-600">Status: {progress.accountResult}</div>
              </div>

              {/* Profit Target */}
              {progress.rules.profitTarget && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">Profit Target</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        progress.rules.profitTarget.completed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {progress.rules.profitTarget.completed ? 'Completed' : 'In Progress'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Required</div>
                      <div className="font-semibold">${progress.rules.profitTarget.requiredProfit}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Current</div>
                      <div className="font-semibold text-blue-600">${progress.rules.profitTarget.currentProfit}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Remaining</div>
                      <div className="font-semibold">${progress.rules.profitTarget.remainingProfit}</div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${progress.rules.profitTarget.progressPercentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {progress.rules.profitTarget.progressPercentage}% Complete
                    </div>
                  </div>
                </div>
              )}

              {/* Max Drawdown */}
              {progress.rules.maxDrawdown && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">Maximum Drawdown</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        progress.rules.maxDrawdown.breached
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {progress.rules.maxDrawdown.breached ? 'Breached' : 'Within Limit'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Maximum</div>
                      <div className="font-semibold">${progress.rules.maxDrawdown.maximumAllowedLoss}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Current</div>
                      <div className="font-semibold text-red-600">${progress.rules.maxDrawdown.currentDrawdown}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Remaining</div>
                      <div className="font-semibold">${progress.rules.maxDrawdown.remainingLossAllowance}</div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          parseFloat(progress.rules.maxDrawdown.usagePercentage) > 80
                            ? 'bg-red-600'
                            : parseFloat(progress.rules.maxDrawdown.usagePercentage) > 50
                            ? 'bg-yellow-600'
                            : 'bg-green-600'
                        }`}
                        style={{ width: `${progress.rules.maxDrawdown.usagePercentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {progress.rules.maxDrawdown.usagePercentage}% Used
                    </div>
                  </div>
                </div>
              )}

              {/* Daily Loss */}
              {progress.rules.dailyLoss && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">Daily Loss Limit</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        progress.rules.dailyLoss.breached
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {progress.rules.dailyLoss.breached ? 'Breached' : 'Within Limit'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Limit</div>
                      <div className="font-semibold">${progress.rules.dailyLoss.dailyLossLimit}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Current</div>
                      <div className="font-semibold text-red-600">${progress.rules.dailyLoss.currentDailyLoss}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Remaining</div>
                      <div className="font-semibold">${progress.rules.dailyLoss.remainingDailyLoss}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Minimum Trading Days */}
              {progress.rules.minimumTradingDays && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">Minimum Trading Days</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        progress.rules.minimumTradingDays.completed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {progress.rules.minimumTradingDays.completed ? 'Completed' : 'In Progress'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Required</div>
                      <div className="font-semibold">{progress.rules.minimumTradingDays.requiredTradingDays} days</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Completed</div>
                      <div className="font-semibold text-blue-600">
                        {progress.rules.minimumTradingDays.completedTradingDays} days
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Remaining</div>
                      <div className="font-semibold">{progress.rules.minimumTradingDays.remainingTradingDays} days</div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${progress.rules.minimumTradingDays.progressPercentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {progress.rules.minimumTradingDays.progressPercentage}% Complete
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
