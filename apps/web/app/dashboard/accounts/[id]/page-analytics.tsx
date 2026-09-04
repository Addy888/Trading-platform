'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/lib/auth-context';
import { tradingAccountsApi, TradingAccount } from '@/lib/trading-accounts-api';
import { analyticsApi, AccountAnalytics, EquityHistoryPoint, ChallengeProgress } from '@/lib/analytics-api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  tradingApi,
  type OpenPosition,
  type Trade,
  type OpenTradeRequest,
} from '@/lib/trading-api';

export default function TradingAccountAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const accountId = params.id as string;
  
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [analytics, setAnalytics] = useState<AccountAnalytics | null>(null);
  const [equityHistory, setEquityHistory] = useState<EquityHistoryPoint[]>([]);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyRange, setHistoryRange] = useState<'7d' | '30d' | 'all'>('all');
  
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

  useEffect(() => {
    if (accountId && accessToken) {
      fetchEquityHistory();
    }
  }, [accountId, accessToken, historyRange]);

  const fetchAllData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const [accountData, analyticsData, posData, tradesData] = await Promise.all([
        tradingAccountsApi.getUserAccount(accessToken, accountId),
        analyticsApi.getAccountAnalytics(accountId, accessToken),
        tradingApi.getOpenPositions(accessToken, accountId),
        tradingApi.getTradeHistory(accessToken, accountId, { page: 1, limit: 20 }),
      ]);
      
      setAccount(accountData);
      setAnalytics(analyticsData);
      setPositions(posData);
      setTrades(tradesData.trades);
    } catch (err: any) {
      setError(err.message || 'Failed to load account');
    } finally {
      setLoading(false);
    }
  };

  const fetchEquityHistory = async () => {
    if (!accessToken) return;
    try {
      const history = await analyticsApi.getEquityHistory(accountId, accessToken, historyRange);
      setEquityHistory(history);
    } catch (err) {
      console.error('Failed to load equity history:', err);
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
      await fetchEquityHistory();
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
      await fetchEquityHistory();
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

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const canTrade = account?.status === 'ACTIVE';

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-gray-600">Loading account...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !account || !analytics) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || 'Account not found'}</p>
            <button
              onClick={() => router.push('/dashboard/accounts')}
              className="text-blue-600 hover:text-blue-800"
            >
              Back to Accounts
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const progress = analytics.challengeProgress;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <button
              onClick={() => router.push('/dashboard/accounts')}
              className="text-blue-100 hover:text-white mb-4 flex items-center"
            >
              ← Back to Accounts
            </button>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-4xl font-bold mb-2">{account.accountNumber}</h1>
                <p className="text-blue-100">{account.challengePlan?.name}</p>
              </div>
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(account.status)}`}>
                {account.status}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Account Status Warning */}
          {!canTrade && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Trading Disabled:</strong> This account is {account.status}. You cannot open new trades.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Performance Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600 font-medium mb-1">Initial Balance</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(analytics.overview.initialBalance)}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600 font-medium mb-1">Current Balance</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(analytics.overview.currentBalance)}
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-600 font-medium mb-1">Equity</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(analytics.overview.equity)}
                </div>
              </div>
              <div className={`${parseFloat(analytics.overview.totalPnl) >= 0 ? 'bg-green-50' : 'bg-red-50'} p-4 rounded-lg`}>
                <div className={`text-sm font-medium mb-1 ${parseFloat(analytics.overview.totalPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Total PnL
                </div>
                <div className={`text-xl font-bold ${parseFloat(analytics.overview.totalPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analytics.overview.totalPnl)}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 font-medium mb-1">Return</div>
                <div className={`text-xl font-bold ${parseFloat(analytics.overview.returnPercentage) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {parseFloat(analytics.overview.returnPercentage).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          {/* Challenge Progress */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Progress</h2>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Overall Progress</span>
                <span className="font-semibold text-gray-900">{parseFloat(progress.overallProgress).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, parseFloat(progress.overallProgress))}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {progress.rules.profitTarget && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">Profit Target</h3>
                    {progress.rules.profitTarget.completed ? (
                      <span className="text-green-600 text-xs font-semibold">✓ COMPLETED</span>
                    ) : (
                      <span className="text-gray-500 text-xs">{progress.rules.profitTarget.progressPercentage}%</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {formatCurrency(progress.rules.profitTarget.currentProfit)} / {formatCurrency(progress.rules.profitTarget.requiredProfit)}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${progress.rules.profitTarget.completed ? 'bg-green-600' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(100, parseFloat(progress.rules.profitTarget.progressPercentage))}%` }}
                    />
                  </div>
                </div>
              )}

              {progress.rules.maxDrawdown && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">Maximum Drawdown</h3>
                    {progress.rules.maxDrawdown.breached ? (
                      <span className="text-red-600 text-xs font-semibold">⚠ BREACHED</span>
                    ) : (
                      <span className="text-gray-500 text-xs">{progress.rules.maxDrawdown.usagePercentage}% used</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {formatCurrency(progress.rules.maxDrawdown.currentDrawdown)} used / {formatCurrency(progress.rules.maxDrawdown.maximumAllowedLoss)} limit
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        progress.rules.maxDrawdown.breached ? 'bg-red-600' :
                        parseFloat(progress.rules.maxDrawdown.usagePercentage) > 75 ? 'bg-yellow-600' :
                        'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(100, parseFloat(progress.rules.maxDrawdown.usagePercentage))}%` }}
                    />
                  </div>
                </div>
              )}

              {progress.rules.dailyLoss && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">Daily Loss Limit</h3>
                    {progress.rules.dailyLoss.breached ? (
                      <span className="text-red-600 text-xs font-semibold">⚠ BREACHED</span>
                    ) : (
                      <span className="text-gray-500 text-xs">{progress.rules.dailyLoss.usagePercentage}% used</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {formatCurrency(progress.rules.dailyLoss.currentDailyLoss)} used / {formatCurrency(progress.rules.dailyLoss.dailyLossLimit)} limit
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        progress.rules.dailyLoss.breached ? 'bg-red-600' :
                        parseFloat(progress.rules.dailyLoss.usagePercentage) > 75 ? 'bg-yellow-600' :
                        'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(100, parseFloat(progress.rules.dailyLoss.usagePercentage))}%` }}
                    />
                  </div>
                </div>
              )}

              {progress.rules.minimumTradingDays && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">Minimum Trading Days</h3>
                    {progress.rules.minimumTradingDays.completed ? (
                      <span className="text-green-600 text-xs font-semibold">✓ COMPLETED</span>
                    ) : (
                      <span className="text-gray-500 text-xs">{progress.rules.minimumTradingDays.progressPercentage}%</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {progress.rules.minimumTradingDays.completedTradingDays} / {progress.rules.minimumTradingDays.requiredTradingDays} Days
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${progress.rules.minimumTradingDays.completed ? 'bg-green-600' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(100, parseFloat(progress.rules.minimumTradingDays.progressPercentage))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Account Performance History Chart */}
          {equityHistory.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Account Performance History</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setHistoryRange('7d')}
                    className={`px-3 py-1 text-sm rounded ${historyRange === '7d' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    7D
                  </button>
                  <button
                    onClick={() => setHistoryRange('30d')}
                    className={`px-3 py-1 text-sm rounded ${historyRange === '30d' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    30D
                  </button>
                  <button
                    onClick={() => setHistoryRange('all')}
                    className={`px-3 py-1 text-sm rounded ${historyRange === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    All
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Data based on simulated/demo trading engine
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={equityHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value) => {
                      if (value != null) {
                        return new Date(value as string | number).toLocaleString();
                      }
                      return '';
                    }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="#3B82F6"
                    name="Balance"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#10B981"
                    name="Equity"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trading Statistics */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Trading Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Total Trades</div>
                <div className="text-2xl font-bold text-gray-900">{analytics.trades.totalTrades}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Winning Trades</div>
                <div className="text-2xl font-bold text-green-600">{analytics.trades.winningTrades}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Losing Trades</div>
                <div className="text-2xl font-bold text-red-600">{analytics.trades.losingTrades}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Win Rate</div>
                <div className="text-2xl font-bold text-gray-900">{analytics.trades.winRate}%</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Average Win</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(analytics.pnl.averageWin)}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Average Loss</div>
                <div className="text-lg font-bold text-red-600">{formatCurrency(analytics.pnl.averageLoss)}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Largest Win</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(analytics.pnl.largestWin)}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Largest Loss</div>
                <div className="text-lg font-bold text-red-600">{formatCurrency(analytics.pnl.largestLoss)}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Realized PnL</div>
                <div className={`text-lg font-bold ${parseFloat(analytics.pnl.realized) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analytics.pnl.realized)}
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Unrealized PnL</div>
                <div className={`text-lg font-bold ${parseFloat(analytics.pnl.unrealized) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(analytics.pnl.unrealized)}
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Profit Factor</div>
                <div className="text-lg font-bold text-gray-900">{analytics.pnl.profitFactor}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Open Positions</div>
                <div className="text-2xl font-bold text-blue-600">{analytics.trades.openTrades}</div>
              </div>
            </div>
          </div>

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
                  ⚠️ Price Source: Simulated/Demo
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current (Simulated)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unrealized PnL</th>
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
                            {formatCurrency(position.unrealizedPnl)}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Realized PnL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
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
                            {formatCurrency(trade.realizedPnl)}
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
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(trade.openedAt).toLocaleDateString()}
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
        </div>
      </div>
    </ProtectedRoute>
  );
}
