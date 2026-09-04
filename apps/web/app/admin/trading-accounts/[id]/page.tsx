'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { adminApi } from '@/lib/admin-api';

export default function AdminTradingAccountDetailPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const accountId = params.id as string;
  const [accountDetail, setAccountDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    if (accountId && accessToken) {
      fetchAccountDetail();
    }
  }, [accountId, accessToken]);

  const fetchAccountDetail = async () => {
    if (!accessToken) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const data = await adminApi.getTradingAccountById(accessToken, accountId);
      setAccountDetail(data);
      setNewStatus(data.account.status);
    } catch (err: any) {
      console.error('Failed to load account detail:', err);
      setError(err.message || 'Failed to load account detail');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!accountDetail || !accessToken || newStatus === accountDetail.account.status) return;

    if (
      !confirm(
        `Are you sure you want to change account status from ${accountDetail.account.status} to ${newStatus}?`
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      await adminApi.updateTradingAccountStatus(accessToken, accountId, newStatus);
      await fetchAccountDetail();
    } catch (err: any) {
      alert(err.message || 'Failed to update account status');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <button
                onClick={() => router.push('/admin/trading-accounts')}
                className="text-blue-600 hover:text-blue-800 mb-2 text-sm"
              >
                ← Back to Trading Accounts
              </button>
              <h1 className="text-3xl font-bold text-gray-900">Trading Account Details</h1>
            </div>
          </div>

          {loading && (
            <div className="text-center py-12 text-gray-600">Loading account details...</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && accountDetail && (
            <>
              {/* Account Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Account Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Account Number</label>
                    <div className="font-mono font-bold text-gray-900">
                      {accountDetail.account.accountNumber}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Status</label>
                    <div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          accountDetail.account.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : accountDetail.account.status === 'PASSED'
                            ? 'bg-blue-100 text-blue-700'
                            : accountDetail.account.status === 'BREACHED'
                            ? 'bg-red-100 text-red-700'
                            : accountDetail.account.status === 'SUSPENDED'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {accountDetail.account.status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Initial Balance</label>
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(accountDetail.account.initialBalance)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Current Balance</label>
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(accountDetail.account.currentBalance)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Equity</label>
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(accountDetail.account.equity)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Created</label>
                    <div className="font-semibold text-gray-900">
                      {new Date(accountDetail.account.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* User Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">User Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Name</label>
                    <div className="font-semibold text-gray-900">
                      {accountDetail.account.user.firstName} {accountDetail.account.user.lastName}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Email</label>
                    <div className="font-semibold text-gray-900">
                      {accountDetail.account.user.email}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Phone</label>
                    <div className="font-semibold text-gray-900">
                      {accountDetail.account.user.phone || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Country</label>
                    <div className="font-semibold text-gray-900">
                      {accountDetail.account.user.country || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Challenge Plan */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Plan</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Name</label>
                    <div className="font-semibold text-gray-900">
                      {accountDetail.account.challengePlan.name}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Description</label>
                    <div className="text-gray-900">
                      {accountDetail.account.challengePlan.description || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Update */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Update Account Status</h2>
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PASSED">PASSED</option>
                      <option value="BREACHED">BREACHED</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>
                  <button
                    onClick={handleStatusChange}
                    disabled={
                      actionLoading || newStatus === accountDetail.account.status
                    }
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? 'Updating...' : 'Update Status'}
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Note: Invalid transitions will be rejected by the system
                </p>
              </div>

              {/* Trading Statistics */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Trading Statistics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-gray-200 rounded p-3">
                    <div className="text-sm text-gray-600">Total Trades</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {accountDetail.trading.statistics.totalTrades}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded p-3">
                    <div className="text-sm text-gray-600">Open Trades</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {accountDetail.trading.openTrades.length}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded p-3">
                    <div className="text-sm text-gray-600">Closed Trades</div>
                    <div className="text-2xl font-bold text-gray-600">
                      {accountDetail.trading.closedTrades.length}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded p-3">
                    <div className="text-sm text-gray-600">Total Realized PnL</div>
                    <div
                      className={`text-xl font-bold ${
                        parseFloat(accountDetail.trading.statistics.totalRealizedPnl) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(accountDetail.trading.statistics.totalRealizedPnl)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Open Trades */}
              {accountDetail.trading.openTrades.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Open Trades</h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Symbol
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Side
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Volume
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Entry Price
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Stop Loss
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Take Profit
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Opened
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {accountDetail.trading.openTrades.map((trade: any) => (
                          <tr key={trade.id}>
                            <td className="px-4 py-2 text-sm font-semibold text-gray-900">
                              {trade.symbol}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  trade.side === 'BUY'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {trade.side}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">{trade.volume}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{trade.entryPrice}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {trade.stopLoss || 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {trade.takeProfit || 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {new Date(trade.openedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent Closed Trades */}
              {accountDetail.trading.closedTrades.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    Recent Closed Trades (Last 20)
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Symbol
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Side
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Volume
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Entry
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Exit
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            PnL
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Closed
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {accountDetail.trading.closedTrades.map((trade: any) => (
                          <tr key={trade.id}>
                            <td className="px-4 py-2 text-sm font-semibold text-gray-900">
                              {trade.symbol}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  trade.side === 'BUY'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {trade.side}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">{trade.volume}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{trade.entryPrice}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {trade.exitPrice || 'N/A'}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`font-semibold ${
                                  parseFloat(trade.realizedPnl) >= 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {formatCurrency(trade.realizedPnl)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {trade.closedAt
                                ? new Date(trade.closedAt).toLocaleString()
                                : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent Audit Logs */}
              {accountDetail.history.auditLogs.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Audit Logs</h2>
                  <div className="space-y-2">
                    {accountDetail.history.auditLogs.map((log: any) => (
                      <div key={log.id} className="border border-gray-200 rounded p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-gray-900">{log.action}</div>
                            {log.actor && (
                              <div className="text-sm text-gray-600">
                                by {log.actor.firstName} {log.actor.lastName} ({log.actor.email})
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        </div>
                        {log.metadata && (
                          <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
