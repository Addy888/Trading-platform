'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { paymentsApi, Payment } from '@/lib/payments-api';
import Link from 'next/link';

export default function PaymentsPage() {
  const { accessToken } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Adjustment Modal State
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('50.00');
  const [adjustDirection, setAdjustDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [adjustSuccess, setAdjustSuccess] = useState('');

  useEffect(() => {
    fetchPayments();
  }, [accessToken, page, statusFilter]);

  const fetchPayments = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError('');
      const response = await paymentsApi.getPayments(accessToken, {
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setPayments(response.data || []);
      setTotalPages(response.meta?.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load payments:', err);
      setError(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPayments();
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    if (!adjustReason || adjustReason.trim().length < 5) {
      setAdjustError('A mandatory audit reason of at least 5 characters is required');
      return;
    }

    try {
      setAdjustLoading(true);
      setAdjustError('');
      setAdjustSuccess('');

      const result = await paymentsApi.adjustBalance(accessToken, {
        userId: targetUserId.trim(),
        amount: adjustAmount.trim(),
        direction: adjustDirection,
        reason: adjustReason.trim(),
      });

      setAdjustSuccess(
        `Successfully ${adjustDirection === 'CREDIT' ? 'credited' : 'debited'} $${adjustAmount}. Ledger ID: ${result.ledgerId}`,
      );

      await fetchPayments();
      setTimeout(() => {
        setShowAdjustModal(false);
        setAdjustSuccess('');
        setAdjustReason('');
      }, 2000);
    } catch (err: any) {
      setAdjustError(err.message || 'Failed to adjust balance');
    } finally {
      setAdjustLoading(false);
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(isNaN(num) ? 0 : num);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      PROCESSING: 'bg-blue-100 text-blue-800',
      SUCCESS: 'bg-emerald-100 text-emerald-800',
      COMPLETED: 'bg-green-100 text-green-800',
      FAILED: 'bg-rose-100 text-rose-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
      REJECTED: 'bg-gray-100 text-gray-800',
      REFUNDED: 'bg-purple-100 text-purple-800',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900">Payments & Deposits</h1>
              <p className="text-gray-500 mt-1">Audit platform payment history, provider webhooks, and ledger balances</p>
            </div>
            <button
              onClick={() => setShowAdjustModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm font-semibold transition-colors flex items-center gap-2 text-sm"
            >
              <span>⚖️</span> Manual Balance Adjustment
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                placeholder="Search by payment ID, reference, user email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              >
                <option value="">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REFUNDED">Refunded</option>
              </select>
              <button
                type="submit"
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold"
              >
                Search
              </button>
            </form>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <p>{error}</p>
              <button onClick={fetchPayments} className="mt-2 text-red-700 underline font-semibold">
                Retry
              </button>
            </div>
          )}

          {/* Payments Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading payments...</div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No payments found matching criteria</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Payment Reference
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Provider & Ref
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {payments.map((payment) => {
                        const user = payment.user || payment.order?.user;
                        return (
                          <tr key={payment.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-mono font-bold text-gray-900">
                                {payment.reference || payment.id.substring(0, 8)}
                              </div>
                              <div className="text-xs text-gray-400 font-mono">ID: {payment.id}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {user ? (
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {user.firstName} {user.lastName}
                                  </div>
                                  <div className="text-xs text-gray-500 font-mono">{user.email}</div>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-extrabold text-gray-900">
                                {formatCurrency(payment.amount)}
                              </div>
                              <div className="text-xs text-gray-500">{payment.currency}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-gray-900">{payment.provider}</div>
                              <div className="text-xs font-mono text-gray-500">
                                {payment.providerReference || 'N/A'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-bold rounded-full ${getStatusBadge(
                                  payment.status,
                                )}`}
                              >
                                {payment.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                              {new Date(payment.createdAt).toLocaleDateString()}{' '}
                              {new Date(payment.createdAt).toLocaleTimeString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Link
                                href={`/admin/payments/${payment.id}`}
                                className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs"
                              >
                                View Details &rarr;
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-white px-6 py-3 flex items-center justify-between border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      Page <span className="font-bold">{page}</span> of{' '}
                      <span className="font-bold">{totalPages}</span>
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 border border-gray-300 rounded text-xs font-semibold disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1 border border-gray-300 rounded text-xs font-semibold disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Auditable Manual Balance Adjustment Modal */}
          {showAdjustModal && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold"
                >
                  ✕
                </button>
                <div className="flex items-center gap-2 text-indigo-600">
                  <span className="text-xl">⚖️</span>
                  <h3 className="text-lg font-bold text-gray-900">Auditable Balance Adjustment</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Adjust a user platform wallet balance. Administrators cannot silently modify balances: every adjustment
                  creates an immutable ledger entry and audit log.
                </p>

                {adjustError && (
                  <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                    {adjustError}
                  </div>
                )}
                {adjustSuccess && (
                  <div className="mt-4 p-3 bg-green-50 text-green-700 text-xs rounded-lg border border-green-200">
                    {adjustSuccess}
                  </div>
                )}

                <form onSubmit={handleAdjustBalance} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase">Target User ID or Email</label>
                    <input
                      type="text"
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      placeholder="e.g. 2c42bf4f-56d1-4b1a-8de0-6c99c387d18f"
                      className="mt-1 block w-full rounded-lg border-gray-300 py-2 px-3 text-sm border focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase">Adjustment Direction</label>
                      <select
                        value={adjustDirection}
                        onChange={(e) => setAdjustDirection(e.target.value as any)}
                        className="mt-1 block w-full rounded-lg border-gray-300 py-2 px-3 text-sm border focus:ring-indigo-500 focus:border-indigo-500 font-bold"
                      >
                        <option value="CREDIT">CREDIT (+ Add Balance)</option>
                        <option value="DEBIT">DEBIT (- Deduct Balance)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase">Amount (USD)</label>
                      <input
                        type="text"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        placeholder="0.00"
                        className="mt-1 block w-full rounded-lg border-gray-300 py-2 px-3 text-sm border focus:ring-indigo-500 focus:border-indigo-500 font-bold"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase">
                      Mandatory Audit Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      placeholder="State the explicit business reason (e.g. Downtime compensation ticket #1488, Manual wire deposit reconciliation)"
                      className="mt-1 block w-full rounded-lg border-gray-300 py-2 px-3 text-sm border focus:ring-indigo-500 focus:border-indigo-500"
                      rows={3}
                      required
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={adjustLoading}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 text-sm"
                    >
                      {adjustLoading ? 'Executing Adjustment...' : 'Record Auditable Adjustment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
