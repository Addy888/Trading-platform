'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { adminApi, UserDetail } from '@/lib/admin-api';

export default function AdminUserDetailPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (userId && accessToken) {
      fetchUserDetail();
    }
  }, [userId, accessToken]);

  const fetchUserDetail = async () => {
    if (!accessToken) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const data = await adminApi.getUserById(accessToken, userId);
      setUserDetail(data);
    } catch (err: any) {
      console.error('Failed to load user detail:', err);
      setError(err.message || 'Failed to load user detail');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!userDetail || !accessToken) return;
    
    const newStatus = !userDetail.user.isActive;
    if (!confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this user?`)) {
      return;
    }

    try {
      setActionLoading(true);
      await adminApi.updateUserStatus(accessToken, userId, newStatus);
      await fetchUserDetail();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    } finally {
      setActionLoading(false);
    }
  };

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
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <button
                onClick={() => router.push('/admin/users')}
                className="text-blue-600 hover:text-blue-800 mb-2 text-sm"
              >
                ← Back to Users
              </button>
              <h1 className="text-3xl font-bold text-gray-900">User Details</h1>
            </div>
            {userDetail && (
              <button
                onClick={handleStatusChange}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-lg text-white transition ${
                  userDetail.user.isActive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {actionLoading
                  ? 'Processing...'
                  : userDetail.user.isActive
                  ? 'Deactivate User'
                  : 'Activate User'}
              </button>
            )}
          </div>

          {loading && (
            <div className="text-center py-12 text-gray-600">Loading user details...</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && userDetail && (
            <>
              {/* User Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">User Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Email</label>
                    <div className="font-semibold text-gray-900">{userDetail.user.email}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Full Name</label>
                    <div className="font-semibold text-gray-900">
                      {userDetail.user.firstName} {userDetail.user.lastName}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Phone</label>
                    <div className="font-semibold text-gray-900">
                      {userDetail.user.phone || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Country</label>
                    <div className="font-semibold text-gray-900">
                      {userDetail.user.country || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Role</label>
                    <div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          userDetail.user.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {userDetail.user.role}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Status</label>
                    <div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          userDetail.user.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {userDetail.user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Email Verified</label>
                    <div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          userDetail.user.isEmailVerified
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {userDetail.user.isEmailVerified ? 'Verified' : 'Not Verified'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Joined</label>
                    <div className="font-semibold text-gray-900">
                      {new Date(userDetail.user.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Order Statistics */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Order Statistics</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Orders</span>
                      <span className="text-xl font-bold text-gray-900">
                        {userDetail.statistics.orders.total}
                      </span>
                    </div>
                    {Object.entries(userDetail.statistics.orders.byStatus).map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center border-t pt-2">
                        <span className="text-gray-600">{status}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trading Account Statistics */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    Trading Account Statistics
                  </h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Accounts</span>
                      <span className="text-xl font-bold text-gray-900">
                        {userDetail.statistics.tradingAccounts.total}
                      </span>
                    </div>
                    {Object.entries(userDetail.statistics.tradingAccounts.byStatus).map(
                      ([status, count]) => (
                        <div key={status} className="flex justify-between items-center border-t pt-2">
                          <span className="text-gray-600">{status}</span>
                          <span className="font-semibold text-gray-900">{count}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Orders</h2>
                {userDetail.recentActivity.orders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Challenge
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Amount
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {userDetail.recentActivity.orders.map((order) => (
                          <tr key={order.id}>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {order.challengePlan?.name || 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatCurrency(order.amount)} {order.currency}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  order.status === 'PAID'
                                    ? 'bg-green-100 text-green-700'
                                    : order.status === 'PENDING'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No orders yet</p>
                )}
              </div>

              {/* Recent Trading Accounts */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Trading Accounts</h2>
                {userDetail.recentActivity.tradingAccounts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Account Number
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Challenge
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Balance
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Trades
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {userDetail.recentActivity.tradingAccounts.map((account) => (
                          <tr key={account.id}>
                            <td className="px-4 py-2 text-sm font-mono text-gray-900">
                              {account.accountNumber}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {account.challengePlan?.name || 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatCurrency(account.currentBalance)}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  account.status === 'ACTIVE'
                                    ? 'bg-green-100 text-green-700'
                                    : account.status === 'PASSED'
                                    ? 'bg-blue-100 text-blue-700'
                                    : account.status === 'BREACHED'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {account.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {account._count?.trades ?? 0}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {new Date(account.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No trading accounts yet</p>
                )}
              </div>

              {/* Recent Audit Logs */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Audit Logs</h2>
                {userDetail.recentActivity.auditLogs.length > 0 ? (
                  <div className="space-y-2">
                    {userDetail.recentActivity.auditLogs.map((log) => (
                      <div key={log.id} className="border border-gray-200 rounded p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-gray-900">{log.action}</div>
                            <div className="text-sm text-gray-600">
                              {log.entityType && log.entityId
                                ? `${log.entityType}: ${log.entityId}`
                                : 'N/A'}
                            </div>
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
                ) : (
                  <p className="text-gray-500 text-center py-4">No audit logs yet</p>
                )}
              </div>
            </>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
