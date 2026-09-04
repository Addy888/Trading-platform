'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { useAuth } from '@/lib/auth-context';
import { tradingAccountsApi, TradingAccount } from '@/lib/trading-accounts-api';
import {
  tradingApi,
  type AccountPerformance,
  type OpenPosition,
  type Trade,
  type OpenTradeRequest,
  type ChallengeProgress,
} from '@/lib/trading-api';

export default function TradingAccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const accountId = params.id as string;
  
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [performance, setPerformance] = useState<AccountPerformance | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress | null>(null);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Trading form state
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [tradeFormData, setTradeFormData] = useState<OpenTradeRequest>({
    symbol: 'EURUSD',
    side: 'BUY',
    volume: 1,
  });
  const [submitting, setSubmitting] = useState(false);

  const supportedSymbols = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD',
    'XAUUSD', 'XAGUSD', 'WTIUSD', 'BTCUSD', 'ETHUSD'
  ];

  useEffect(() => {
    if (accountId && accessToken) {
      fetchAllData();
    }
  }, [accountId, accessToken]);

  const fetchAllData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const [accountData, perfData, progressData, posData, tradesData] = await Promise.all([
        tradingAccountsApi.getUserAccount(accessToken, accountId),
        tradingApi.getAccountPerformance(accessToken, accountId),
        tradingApi.getChallengeProgress(accessToken, accountId),
        tradingApi.getOpenPositions(accessToken, accountId),
        tradingApi.getTradeHistory(accessToken, accountId, { page: 1, limit: 10 }),
      ]);
      
      setAccount(accountData);
      setPerformance(perfData);
      setChallengeProgress(progressData);
      setPositions(posData);
      setTrades(tradesData.trades);
    } catch (err: any) {
      setError(err.message || 'Failed to load account');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTrade = async () => {
    if (!accessToken || submitting) return;

    try {
      setSubmitting(true);
      await tradingApi.openTrade(accessToken, accountId, tradeFormData);
      setShowTradeForm(false);
      setTradeFormData({
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 1,
      });
      await fetchAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to open trade');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseTrade = async (tradeId: string) => {
    if (!accessToken || !confirm('Are you sure you want to close this position?')) return;

    try {
      await tradingApi.closeTrade(accessToken, accountId, tradeId);
      await fetchAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to close trade');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'PASSED':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'BREACHED':
      case 'SUSPENDED':
      case 'CLOSED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
      case 'PENDING':
        return 'This account is pending activation.';
      default:
        return '';
    }
  };

  const canTrade = account?.status === 'ACTIVE';

  if (loading) {
    return (
      <ProtectedRoute requireRole="USER">
        <UserLayout>
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-600">Loading account...</div>
          </div>
        </UserLayout>
      </ProtectedRoute>
    );
  }

  if (error || !account) {
    return (
      <ProtectedRoute requireRole="USER">
        <UserLayout>
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error || 'Account not found'}</p>
            <button
              onClick={() => router.push('/dashboard/accounts')}
              className="text-blue-600 hover:text-blue-800"
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
          <div>
            <button
              onClick={() => router.push('/dashboard/accounts')}
              className="text-blue-600 hover:text-blue-800 mb-2 text-sm"
            >
              ← Back to Accounts
            </button>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{account.accountNumber}</h1>
                <p className="text-gray-600">{account.challengePlan?.name}</p>
              </div>
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(account.status)}`}>
                {account.status}
              </span>
            </div>
          </div>

          {/* Account Status Message */}
          {getStatusMessage(account.status) && (
            <div className={`rounded-lg p-4 ${
              account.status === 'ACTIVE' ? 'bg-green-50 border-l-4 border-green-400' :
              account.status === 'PASSED' ? 'bg-blue-50 border-l-4 border-blue-400' :
              'bg-yellow-50 border-l-4 border-yellow-400'
            }`}>
              <p className={`${
                account.status === 'ACTIVE' ? 'text-green-800' :
                account.status === 'PASSED' ? 'text-blue-800' :
                'text-yellow-800'
              }`}>
                <strong>{account.status}:</strong> {getStatusMessage(account.status)}
              </p>
            </div>
          )}

          {/* Account Overview */}
          {performance && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Account Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium mb-1">Starting Balance</div>
                  <div className="text-xl font-bold text-gray-900">
                    ${parseFloat(performance.initialBalance).toLocaleString()}
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-600 font-medium mb-1">Current Balance</div>
                  <div className="text-xl font-bold text-gray-900">
                    ${parseFloat(performance.currentBalance).toLocaleString()}
                  </div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-sm text-purple-600 font-medium mb-1">Equity</div>
                  <div className="text-xl font-bold text-gray-900">
                    ${parseFloat(performance.equity).toLocaleString()}
                  </div>
                </div>
                <div className={`${parseFloat(performance.totalPnl) >= 0 ? 'bg-green-50' : 'bg-red-50'} p-4 rounded-lg`}>
                  <div className={`text-sm font-medium mb-1 ${parseFloat(performance.totalPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Total P&L
                  </div>
                  <div className={`text-xl font-bold ${parseFloat(performance.totalPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${parseFloat(performance.totalPnl).toFixed(2)}
                    <span className="text-sm ml-1">({performance.returnPercentage}%)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Challenge Progress */}
          {challengeProgress && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Progress</h2>
              
              {/* Overall Progress */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                  <span className="text-sm font-semibold text-blue-600">{challengeProgress.overallProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all"
                    style={{ width: `${Math.min(100, parseFloat(challengeProgress.overallProgress))}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-1">{challengeProgress.accountResult}</p>
              </div>

              {/* Individual Rules Progress */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Profit Target */}
                {challengeProgress.rules.profitTarget && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-900">Profit Target</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        challengeProgress.rules.profitTarget.completed
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {challengeProgress.rules.profitTarget.completed ? 'Completed' : 'In Progress'}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Required:</span>
                        <span className="font-semibold">${challengeProgress.rules.profitTarget.requiredProfit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current:</span>
                        <span className={`font-semibold ${parseFloat(challengeProgress.rules.profitTarget.currentProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${challengeProgress.rules.profitTarget.currentProfit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Remaining:</span>
                        <span className="font-semibold">${challengeProgress.rules.profitTarget.remainingProfit}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${Math.min(100, parseFloat(challengeProgress.rules.profitTarget.progressPercentage))}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-center">
                        {challengeProgress.rules.profitTarget.progressPercentage}%
                      </p>
                    </div>
                  </div>
                )}

                {/* Maximum Drawdown */}
                {challengeProgress.rules.maxDrawdown && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-900">Maximum Drawdown</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        challengeProgress.rules.maxDrawdown.breached
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {challengeProgress.rules.maxDrawdown.breached ? 'Breached' : 'Safe'}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Maximum Allowed:</span>
                        <span className="font-semibold">${challengeProgress.rules.maxDrawdown.maximumAllowedLoss}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current Loss:</span>
                        <span className="font-semibold text-red-600">${challengeProgress.rules.maxDrawdown.currentDrawdown}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Remaining:</span>
                        <span className="font-semibold">${challengeProgress.rules.maxDrawdown.remainingLossAllowance}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            parseFloat(challengeProgress.rules.maxDrawdown.usagePercentage) > 80
                              ? 'bg-red-600'
                              : parseFloat(challengeProgress.rules.maxDrawdown.usagePercentage) > 50
                              ? 'bg-yellow-600'
                              : 'bg-green-600'
                          }`}
                          style={{ width: `${Math.min(100, parseFloat(challengeProgress.rules.maxDrawdown.usagePercentage))}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-center">
                        {challengeProgress.rules.maxDrawdown.usagePercentage}% used
                      </p>
                    </div>
                  </div>
                )}

                {/* Daily Loss Limit */}
                {challengeProgress.rules.dailyLoss && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-900">Daily Loss Limit</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        challengeProgress.rules.dailyLoss.breached
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {challengeProgress.rules.dailyLoss.breached ? 'Breached' : 'Safe'}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Daily Limit:</span>
                        <span className="font-semibold">${challengeProgress.rules.dailyLoss.dailyLossLimit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Today's Loss:</span>
                        <span className="font-semibold text-red-600">${challengeProgress.rules.dailyLoss.currentDailyLoss}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Remaining:</span>
                        <span className="font-semibold">${challengeProgress.rules.dailyLoss.remainingDailyLoss}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            parseFloat(challengeProgress.rules.dailyLoss.usagePercentage) > 80
                              ? 'bg-red-600'
                              : parseFloat(challengeProgress.rules.dailyLoss.usagePercentage) > 50
                              ? 'bg-yellow-600'
                              : 'bg-green-600'
                          }`}
                          style={{ width: `${Math.min(100, parseFloat(challengeProgress.rules.dailyLoss.usagePercentage))}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-center">
                        {challengeProgress.rules.dailyLoss.usagePercentage}% used
                      </p>
                    </div>
                  </div>
                )}

                {/* Minimum Trading Days */}
                {challengeProgress.rules.minimumTradingDays && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-900">Minimum Trading Days</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        challengeProgress.rules.minimumTradingDays.completed
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {challengeProgress.rules.minimumTradingDays.completed ? 'Completed' : 'In Progress'}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Required:</span>
                        <span className="font-semibold">{challengeProgress.rules.minimumTradingDays.requiredTradingDays} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Completed:</span>
                        <span className="font-semibold text-blue-600">{challengeProgress.rules.minimumTradingDays.completedTradingDays} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Remaining:</span>
                        <span className="font-semibold">{challengeProgress.rules.minimumTradingDays.remainingTradingDays} days</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${Math.min(100, parseFloat(challengeProgress.rules.minimumTradingDays.progressPercentage))}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-center">
                        {challengeProgress.rules.minimumTradingDays.progressPercentage}%
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Open Positions */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Open Positions</h2>
              {canTrade && (
                <button
                  onClick={() => setShowTradeForm(!showTradeForm)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                >
                  {showTradeForm ? 'Cancel' : 'Open Trade'}
                </button>
              )}
            </div>

            {/* Trade Form */}
            {showTradeForm && canTrade && (
              <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4">New Trade</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Symbol</label>
                    <select
                      value={tradeFormData.symbol}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, symbol: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {supportedSymbols.map(symbol => (
                        <option key={symbol} value={symbol}>{symbol}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Side</label>
                    <select
                      value={tradeFormData.side}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, side: e.target.value as 'BUY' | 'SELL' })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Volume</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={tradeFormData.volume}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, volume: parseFloat(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Stop Loss (Optional)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.00001"
                      value={tradeFormData.stopLoss || ''}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, stopLoss: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Take Profit (Optional)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.00001"
                      value={tradeFormData.takeProfit || ''}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, takeProfit: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleOpenTrade}
                      disabled={submitting}
                      className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                    >
                      {submitting ? 'Opening...' : 'Execute Trade'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  ⚠️ Simulated trading platform - no real money involved
                </p>
              </div>
            )}

            {/* Positions List */}
            {positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Side</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">P&L</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {positions.map((position) => (
                      <tr key={position.id}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{position.symbol}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            position.side === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {position.side}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{position.volume}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{parseFloat(position.entryPrice).toFixed(5)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{parseFloat(position.currentPrice).toFixed(5)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`font-semibold ${parseFloat(position.unrealizedPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${parseFloat(position.unrealizedPnl).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => handleCloseTrade(position.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-medium"
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No open positions</p>
                {canTrade && <p className="text-sm mt-2">Click "Open Trade" to start trading</p>}
              </div>
            )}
          </div>

          {/* Trade History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Trade History</h2>
            {trades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Side</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Exit</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">P&L</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {trades.map((trade) => (
                      <tr key={trade.id}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{trade.symbol}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            trade.side === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {trade.side}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{trade.volume}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{parseFloat(trade.entryPrice).toFixed(5)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {trade.exitPrice ? parseFloat(trade.exitPrice).toFixed(5) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`font-semibold ${parseFloat(trade.realizedPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${parseFloat(trade.realizedPnl).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            trade.status === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                            trade.status === 'CLOSED' ? 'bg-gray-100 text-gray-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {trade.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No trade history yet
              </div>
            )}
          </div>

          {/* Challenge Rules */}
          {account.ruleSet?.ruleSetRules && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Rules</h2>
              <p className="text-gray-600 mb-4">
                You must follow these rules while trading. Breaking any rule will result in account breach.
              </p>
              <div className="space-y-3">
                {account.ruleSet.ruleSetRules.map((rsr: any) => (
                  <div key={rsr.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-gray-900">{rsr.rule.name}</h3>
                        {rsr.rule.description && (
                          <p className="text-sm text-gray-600 mt-1">{rsr.rule.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {rsr.rule.value}{rsr.rule.isPercentage ? '%' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
