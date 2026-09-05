'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { analyticsApi } from '@/lib/analytics-api';

export default function AnalyticsPage() {
  const { accessToken } = useAuth();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    fetchAnalytics();
  }, [accessToken, timeRange]);

  const fetchAnalytics = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError('');
      const data = await analyticsApi.getAdminAnalytics(accessToken, timeRange);
      setAnalytics(data);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
              <p className="text-gray-600 mt-1">Platform performance and insights</p>
            </div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="1d">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="1y">Last Year</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={fetchAnalytics}
                className="mt-2 text-red-700 underline text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-600">Loading analytics...</div>
          ) : analytics ? (
            <>
              {/* User Metrics */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">User Metrics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Users</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {analytics.users?.total || 0}
                    </div>
                    {analytics.users?.growth !== undefined && (
                      <div
                        className={`text-xs mt-1 ${analytics.users.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {analytics.users.growth >= 0 ? '↑' : '↓'}{' '}
                        {Math.abs(analytics.users.growth)} from previous period
                      </div>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Active Users</div>
                    <div className="text-2xl font-bold text-green-600">
                      {analytics.users?.active || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">New Registrations</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {analytics.users?.newRegistrations || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">User Retention</div>
                    <div className="text-2xl font-bold text-purple-600">
                      {analytics.users?.retention ? formatPercentage(analytics.users.retention) : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue Metrics */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue Metrics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-green-700 font-medium mb-1">Total Revenue</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(analytics.revenue?.total || 0)}
                    </div>
                    {analytics.revenue?.growth !== undefined && (
                      <div
                        className={`text-xs mt-1 ${analytics.revenue.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {analytics.revenue.growth >= 0 ? '↑' : '↓'}{' '}
                        {formatPercentage(Math.abs(analytics.revenue.growth))}
                      </div>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Average Order Value</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(analytics.revenue?.averageOrderValue || 0)}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Paid Orders</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {analytics.revenue?.paidOrders || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Pending Revenue</div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {formatCurrency(analytics.revenue?.pending || 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Trading Account Metrics */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Trading Account Metrics</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Accounts</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {analytics.accounts?.total || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Active</div>
                    <div className="text-2xl font-bold text-green-600">
                      {analytics.accounts?.active || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Passed</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {analytics.accounts?.passed || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Breached</div>
                    <div className="text-2xl font-bold text-red-600">
                      {analytics.accounts?.breached || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Pass Rate</div>
                    <div className="text-2xl font-bold text-purple-600">
                      {analytics.accounts?.passRate ? formatPercentage(analytics.accounts.passRate) : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Trading Activity */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Trading Activity</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Trades</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {analytics.trading?.totalTrades || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Open Positions</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {analytics.trading?.openPositions || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Closed Trades</div>
                    <div className="text-2xl font-bold text-gray-600">
                      {analytics.trading?.closedTrades || 0}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Winning Rate</div>
                    <div className="text-2xl font-bold text-green-600">
                      {analytics.trading?.winRate ? formatPercentage(analytics.trading.winRate) : 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-green-700 font-medium mb-1">Realized P&L</div>
                    <div
                      className={`text-2xl font-bold ${parseFloat(analytics.trading?.realizedPnl || '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {formatCurrency(analytics.trading?.realizedPnl || 0)}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm text-blue-700 font-medium mb-1">Unrealized P&L</div>
                    <div
                      className={`text-2xl font-bold ${parseFloat(analytics.trading?.unrealizedPnl || '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {formatCurrency(analytics.trading?.unrealizedPnl || 0)}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total P&L</div>
                    <div
                      className={`text-2xl font-bold ${parseFloat(analytics.trading?.totalPnl || '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {formatCurrency(analytics.trading?.totalPnl || 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payout Metrics */}
              {analytics.payouts && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Payout Metrics</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Total Payouts</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {analytics.payouts.total || 0}
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Pending</div>
                      <div className="text-2xl font-bold text-yellow-600">
                        {analytics.payouts.pending || 0}
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Completed</div>
                      <div className="text-2xl font-bold text-green-600">
                        {analytics.payouts.completed || 0}
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Total Amount</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatCurrency(analytics.payouts.totalAmount || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Popular Challenge Plans */}
              {analytics.popularPlans && analytics.popularPlans.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Popular Challenge Plans</h2>
                  <div className="space-y-3">
                    {analytics.popularPlans.map((plan: any, index: number) => (
                      <div key={plan.id || index} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                        <div>
                          <div className="font-semibold text-gray-900">{plan.name}</div>
                          <div className="text-sm text-gray-600">
                            {formatCurrency(plan.startingBalance)} Starting Balance
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{plan.orderCount || 0}</div>
                          <div className="text-xs text-gray-500">Orders</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-600">
              <p>No analytics data available</p>
            </div>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
