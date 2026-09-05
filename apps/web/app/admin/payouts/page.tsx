'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { payoutsApi, Payout } from '@/lib/payouts-api';
import Link from 'next/link';

export default function PayoutsPage() {
  const { accessToken } = useAuth();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchPayouts();
  }, [accessToken, page, statusFilter]);

  const fetchPayouts = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError('');
      const response = await payoutsApi.getPayouts(accessToken, {
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setPayouts(response.data || []);
      setTotalPages(response.meta?.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load payouts:', err);
      setError(err.message || 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPayouts();
  };

  const handleAction = async (
    payoutId: string,
    action: 'approve' | 'reject' | 'mark-paid',
    data?: any,
  ) => {
    if (!accessToken) return;

    const confirmMessage =
      action === 'approve'
        ? 'Are you sure you want to approve this payout?'
        : action === 'reject'
        ? 'Are you sure you want to reject this payout? This action cannot be undone.'
        : 'Are you sure you want to mark this payout as paid? This indicates the payment has been sent.';

    if (!confirm(confirmMessage)) return;

    try {
      setActionLoading(payoutId);
      if (action === 'approve') {
        await payoutsApi.approvePayout(accessToken, payoutId, data?.notes);
      } else if (action === 'reject') {
        const reason = prompt('Provide a reason for rejection:');
        if (!reason) return;
        await payoutsApi.rejectPayout(accessToken, payoutId, reason);
      } else if (action === 'mark-paid') {
        const reference = prompt('Enter payment reference/transaction ID:');
        if (!reference) return;
        await payoutsApi.markPayoutPaid(accessToken, payoutId, reference);
      }
      await fetchPayouts();
    } catch (err: any) {
      alert(`Failed to ${action} payout: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-blue-100 text-blue-700',
      PROCESSING: 'bg-indigo-100 text-indigo-700',
      COMPLETED: 'bg-green-100 text-green-700',
      REJECTED: 'bg-red-100 text-red-700',
      FAILED: 'bg-gray-100 text-gray-700',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Payouts</h1>
              <p className="text-gray-600 mt-1">Manage trader payout requests</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6">
            <form onSubmit={handleSearch} className="flex gap-4">
              <input
                type="text"
                placeholder="Search by user email or account number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="PROCESSING">Processing</option>
                <option value="COMPLETED">Completed</option>
                <option value="REJECTED">Rejected</option>
                <option value="FAILED">Failed</option>
              </select>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Search
              </button>
            </form>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={fetchPayouts}
                className="mt-2 text-red-700 underline text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {/* Payouts Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading payouts...</div>
            ) : payouts.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <p>No payout requests found</p>
                <p className="text-sm text-gray-500 mt-2">
                  Payout requests from traders will appear here
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payout ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User / Account
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Requested
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {payouts.map((payout) => (
                        <tr key={payout.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono text-gray-900">
                              {payout.id.substring(0, 8)}...
                            </div>
                            {payout.reference && (
                              <div className="text-xs text-gray-500">
                                Ref: {payout.reference}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {payout.user ? (
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {payout.user.firstName} {payout.user.lastName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {payout.user.email}
                                </div>
                                {payout.tradingAccount && (
                                  <div className="text-xs font-mono text-gray-500">
                                    {payout.tradingAccount.accountNumber}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(payout.amount)}
                            </div>
                            <div className="text-xs text-gray-500">{payout.currency}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(payout.status)}`}
                            >
                              {payout.status}
                            </span>
                            {payout.reviewer && (
                              <div className="text-xs text-gray-500 mt-1">
                                by {payout.reviewer.firstName} {payout.reviewer.lastName}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(payout.requestedAt).toLocaleDateString()}
                            <div className="text-xs text-gray-400">
                              {new Date(payout.requestedAt).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-y-1">
                            <Link
                              href={`/admin/payouts/${payout.id}`}
                              className="block text-blue-600 hover:text-blue-900"
                            >
                              View Details
                            </Link>
                            {payout.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleAction(payout.id, 'approve')}
                                  disabled={actionLoading === payout.id}
                                  className="block text-green-600 hover:text-green-900 disabled:opacity-50"
                                >
                                  {actionLoading === payout.id ? 'Processing...' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleAction(payout.id, 'reject')}
                                  disabled={actionLoading === payout.id}
                                  className="block text-red-600 hover:text-red-900 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {payout.status === 'APPROVED' && (
                              <button
                                onClick={() => handleAction(payout.id, 'mark-paid')}
                                disabled={actionLoading === payout.id}
                                className="block text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                              >
                                {actionLoading === payout.id ? 'Processing...' : 'Mark Paid'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Page <span className="font-medium">{page}</span> of{' '}
                          <span className="font-medium">{totalPages}</span>
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                          <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Next
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
