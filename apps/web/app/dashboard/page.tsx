'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { dashboardApi, type UserDashboard } from '@/lib/dashboard-api';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, accessToken } = useAuth();
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user]);

  const loadDashboard = async () => {
    if (!accessToken) return;
    try {
      setDashboardLoading(true);
      setError(null);
      const data = await dashboardApi.getUserDashboard(accessToken);
      setDashboard(data);
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setDashboardLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const formatPnl = (value: string) => {
    const num = parseFloat(value);
    const formatted = formatCurrency(value);
    const color = num >= 0 ? 'text-green-600' : 'text-red-600';
    const sign = num > 0 ? '+' : '';
    return <span className={color}>{sign}{formatted}</span>;
  };

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div>
          {/* Welcome Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome back, {user.firstName}!
            </h2>
            <p className="text-gray-600">
              {user.isActive ? (
                <span className="text-green-600">✓ Your account is active</span>
              ) : (
                <span className="text-red-600">⚠ Your account is inactive</span>
              )}
            </p>
            {!user.isEmailVerified && (
              <p className="text-yellow-600 mt-1">⚠ Please verify your email address</p>
            )}
          </div>

          {dashboardLoading ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-600">Loading dashboard...</div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-700">{error}</p>
              <button
                onClick={loadDashboard}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : dashboard ? (
            <>
              {/* Account Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-600">Total Accounts</h3>
                    <span className="text-2xl">💼</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{dashboard.accounts.total}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {dashboard.accounts.total === 0 ? 'No accounts yet' : 'Trading accounts'}
                  </p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-600">Active Accounts</h3>
                    <span className="text-2xl">🎯</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600">{dashboard.accounts.active}</p>
                  <p className="text-sm text-gray-500 mt-1">Currently trading</p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-600">Passed Accounts</h3>
                    <span className="text-2xl">✅</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-600">{dashboard.accounts.passed}</p>
                  <p className="text-sm text-gray-500 mt-1">Challenge completed</p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-600">Breached Accounts</h3>
                    <span className="text-2xl">❌</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600">{dashboard.accounts.breached}</p>
                  <p className="text-sm text-gray-500 mt-1">Rules violated</p>
                </div>
              </div>

              {/* Financial Overview */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Financial Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Initial Balance</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(dashboard.financial.totalInitialBalance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Current Balance</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(dashboard.financial.totalCurrentBalance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Equity</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(dashboard.financial.totalEquity)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total PnL</p>
                    <p className="text-2xl font-bold">
                      {formatPnl(dashboard.financial.totalPnl)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Recent Trades */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Recent Trades</h3>
                    <Link
                      href="/dashboard/accounts"
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      View All
                    </Link>
                  </div>
                  {dashboard.recentTrades.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No trades yet</p>
                  ) : (
                    <div className="space-y-3">
                      {dashboard.recentTrades.map((trade) => (
                        <div
                          key={trade.id}
                          className="border border-gray-200 rounded p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-900">{trade.symbol}</span>
                            <span
                              className={`px-2 py-1 text-xs rounded ${
                                trade.side === 'BUY'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {trade.side}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
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
                  )}
                </div>

                {/* Recent Orders */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Recent Orders</h3>
                    <Link
                      href="/dashboard/orders"
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      View All
                    </Link>
                  </div>
                  {dashboard.recentOrders.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No orders yet</p>
                  ) : (
                    <div className="space-y-3">
                      {dashboard.recentOrders.map((order) => (
                        <div
                          key={order.id}
                          className="border border-gray-200 rounded p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-900">
                              {order.challengeName}
                            </span>
                            <span
                              className={`px-2 py-1 text-xs rounded ${
                                order.status === 'PAID'
                                  ? 'bg-green-100 text-green-700'
                                  : order.status === 'PENDING'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">
                              {formatCurrency(order.amount)} {order.currency}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              {dashboard.accounts.total === 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">Getting Started</h3>
                  <p className="text-blue-700 mb-4">
                    Start your trading journey by purchasing a challenge plan.
                  </p>
                  <Link
                    href="/dashboard/challenges"
                    className="inline-block px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Browse Challenges
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
