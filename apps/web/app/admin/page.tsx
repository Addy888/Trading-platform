'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { dashboardApi, AdminDashboard } from '@/lib/dashboard-api';
import { adminApi } from '@/lib/admin-api';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const { accessToken } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!accessToken) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const [dashboardData, healthData] = await Promise.all([
          dashboardApi.getAdminDashboard(accessToken),
          adminApi.getHealth(accessToken).catch(() => null),
        ]);
        setDashboard(dashboardData);
        setHealth(healthData);
      } catch (err: any) {
        console.error('Failed to load admin dashboard:', err);
        setError(err.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [accessToken]);

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Platform Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor platform-wide metrics and activity</p>
          </div>

          {loading && (
            <div className="text-center py-12 text-gray-600">Loading statistics...</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && dashboard && (
            <>
              {/* Health Status */}
              {health && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">System Health</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Database</div>
                      <div
                        className={`text-lg font-bold ${
                          health.database === 'connected' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {health.database === 'connected' ? '✓ Connected' : '✗ Error'}
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">WebSocket</div>
                      <div
                        className={`text-lg font-bold ${
                          health.websocket === 'available' ? 'text-green-600' : 'text-yellow-600'
                        }`}
                      >
                        {health.websocket === 'available' ? '✓ Available' : '? Unknown'}
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Simulated Market</div>
                      <div
                        className={`text-lg font-bold ${
                          health.simulatedMarket === 'running' ? 'text-green-600' : 'text-gray-600'
                        }`}
                      >
                        {health.simulatedMarket === 'running' ? '✓ Running' : '○ Stopped'}
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Notifications</div>
                      <div
                        className={`text-lg font-bold ${
                          health.notifications === 'available' ? 'text-green-600' : 'text-yellow-600'
                        }`}
                      >
                        {health.notifications === 'available' ? '✓ Available' : '? Unknown'}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-3">
                    Last checked: {health.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}
                  </div>
                </div>
              )}

              {/* Platform Overview */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Platform Overview</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Users</div>
                    <div className="text-2xl font-bold text-gray-900">{dashboard?.platform?.totalUsers ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Active Users</div>
                    <div className="text-2xl font-bold text-green-600">{dashboard?.platform?.activeUsers ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Challenge Plans</div>
                    <div className="text-2xl font-bold text-gray-900">{dashboard?.platform?.totalChallengePlans ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Orders</div>
                    <div className="text-2xl font-bold text-gray-900">{dashboard?.platform?.totalOrders ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Pending Orders</div>
                    <div className="text-2xl font-bold text-yellow-600">{dashboard?.platform?.pendingOrders ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Paid Orders</div>
                    <div className="text-2xl font-bold text-green-600">{dashboard?.platform?.paidOrders ?? 0}</div>
                  </div>
                </div>
              </div>

              {/* Trading Accounts Overview */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Trading Accounts</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Accounts</div>
                    <div className="text-2xl font-bold text-gray-900">{dashboard?.platform?.totalTradingAccounts ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Active</div>
                    <div className="text-2xl font-bold text-green-600">{dashboard?.platform?.activeTradingAccounts ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Passed</div>
                    <div className="text-2xl font-bold text-blue-600">{dashboard?.platform?.passedAccounts ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Breached</div>
                    <div className="text-2xl font-bold text-red-600">{dashboard?.platform?.breachedAccounts ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">
                      <Link href="/admin/trading-accounts" className="text-blue-600 hover:text-blue-700">
                        View All →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Overview */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Platform Financial Overview</h2>
                <p className="text-sm text-gray-500 mb-4">Order and payment analytics (Platform Revenue)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm text-blue-600 font-medium mb-1">Total Order Value</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(dashboard?.financial?.totalOrderValue ?? '0')}
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-green-600 font-medium mb-1">Total Paid Orders</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(dashboard?.financial?.totalPaidOrderValue ?? '0')}
                    </div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-sm text-yellow-600 font-medium mb-1">Pending Payments</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(dashboard?.financial?.pendingPaymentValue ?? '0')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Trading Overview */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Platform Trading Overview</h2>
                <p className="text-sm text-gray-500 mb-4">Simulated/Demo Trading Metrics</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Trades</div>
                    <div className="text-2xl font-bold text-gray-900">{dashboard?.trading?.totalTrades ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Open Positions</div>
                    <div className="text-2xl font-bold text-blue-600">{dashboard?.trading?.openPositions ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Closed Trades</div>
                    <div className="text-2xl font-bold text-gray-600">{dashboard?.trading?.closedTrades ?? 0}</div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Aggregate Realized PnL</div>
                    <div className={`text-lg font-bold ${parseFloat(dashboard?.trading?.aggregateRealizedPnl ?? '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(dashboard?.trading?.aggregateRealizedPnl ?? '0')}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Aggregate Unrealized PnL</div>
                    <div className={`text-lg font-bold ${parseFloat(dashboard?.trading?.aggregateUnrealizedPnl ?? '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(dashboard?.trading?.aggregateUnrealizedPnl ?? '0')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Users */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Users</h3>
                  {dashboard?.recentActivity?.recentUsers && dashboard.recentActivity.recentUsers.length > 0 ? (
                    <div className="space-y-3">
                      {dashboard.recentActivity.recentUsers.map((user) => (
                        <div key={user.id} className="border border-gray-200 rounded p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold text-gray-900">{user.name}</div>
                              <div className="text-sm text-gray-600">{user.email}</div>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded ${
                              user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {user.role}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-2">
                            {new Date(user.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No recent users</p>
                  )}
                </div>

                {/* Recent Orders */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Orders</h3>
                  {dashboard?.recentActivity?.recentOrders && dashboard.recentActivity.recentOrders.length > 0 ? (
                    <div className="space-y-3">
                      {dashboard.recentActivity.recentOrders.map((order) => (
                        <div key={order.id} className="border border-gray-200 rounded p-3">
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <div className="font-semibold text-gray-900">{order.challenge}</div>
                              <div className="text-sm text-gray-600">{order.user}</div>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded ${
                              order.status === 'PAID' ? 'bg-green-100 text-green-700' :
                              order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">{formatCurrency(order.amount)}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No recent orders</p>
                  )}
                </div>

                {/* Recent Trading Accounts */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Trading Accounts</h3>
                  {dashboard?.recentActivity?.recentAccounts && dashboard.recentActivity.recentAccounts.length > 0 ? (
                    <div className="space-y-3">
                      {dashboard.recentActivity.recentAccounts.map((account) => (
                        <div key={account.id} className="border border-gray-200 rounded p-3">
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <div className="font-mono text-sm font-semibold text-gray-900">{account.accountNumber}</div>
                              <div className="text-sm text-gray-600">{account.user}</div>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded ${
                              account.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                              account.status === 'PASSED' ? 'bg-blue-100 text-blue-700' :
                              account.status === 'BREACHED' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {account.status}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">{account.challenge}</span>
                            <span className="text-gray-600">{formatCurrency(account.initialBalance)}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(account.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No recent accounts</p>
                  )}
                </div>

                {/* Recent Trades */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Trades</h3>
                  {dashboard?.recentActivity?.recentTrades && dashboard.recentActivity.recentTrades.length > 0 ? (
                    <div className="space-y-3">
                      {dashboard.recentActivity.recentTrades.slice(0, 5).map((trade) => (
                        <div key={trade.id} className="border border-gray-200 rounded p-3">
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <div className="font-semibold text-gray-900">{trade.symbol}</div>
                              <div className="text-xs text-gray-600">{trade.accountNumber}</div>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded ${
                              trade.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {trade.side}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Vol: {trade.volume}</span>
                            <span className={parseFloat(trade.realizedPnl) >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatCurrency(trade.realizedPnl)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(trade.openedAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No recent trades</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
