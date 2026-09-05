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
      PROCESSING: 'bg-blue-100 text-blue-700',
      COMPLETED: 'bg-green-100 text-green-700',
      FAILED: 'bg-red-100 text-red-700',
      REJECTED: 'bg-gray-100 text-gray-700',
      REFUNDED: 'bg-purple-100 text-purple-700',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
              <p className="text-gray-600 mt-1">Manage platform payments and transactions</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6">
            <form onSubmit={handleSearch} className="flex gap-4">
              <input
                type="text"
                placeholder="Search by order ID, user email, or reference..."
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
                <option value="PROCESSING">Processing</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="REJECTED">Rejected</option>
                <option value="REFUNDED">Refunded</option>
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
                onClick={fetchPayments}
                className="mt-2 text-red-700 underline text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {/* Payments Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading payments...</div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <p>No payments found</p>
                <p className="text-sm text-gray-500 mt-2">
                  Payments will appear here once users complete orders
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payment ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Provider
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono text-gray-900">
                              {payment.id.substring(0, 8)}...
                            </div>
                            {payment.reference && (
                              <div className="text-xs text-gray-500">
                                Ref: {payment.reference}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {payment.order?.user ? (
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {payment.order.user.firstName} {payment.order.user.lastName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {payment.order.user.email}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(payment.amount)}
                            </div>
                            <div className="text-xs text-gray-500">{payment.currency}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{payment.provider}</div>
                            {payment.method && (
                              <div className="text-xs text-gray-500">{payment.method}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(payment.status)}`}
                            >
                              {payment.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(payment.createdAt).toLocaleDateString()}
                            <div className="text-xs text-gray-400">
                              {new Date(payment.createdAt).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <Link
                              href={`/admin/payments/${payment.id}`}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              View Details
                            </Link>
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
