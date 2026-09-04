'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, Order } from '@/lib/orders-api';

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const orderId = params.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (orderId && accessToken) {
      fetchOrder();
    }
  }, [orderId, accessToken]);

  const fetchOrder = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await ordersApi.getOrderById(accessToken, orderId);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePayment = async () => {
    if (!accessToken || !order) return;

    if (!confirm('Approve this payment? This will create a trading account for the user.')) {
      return;
    }

    try {
      setProcessing(true);
      await ordersApi.approvePayment(accessToken, order.id);
      await fetchOrder();
      alert('Payment approved successfully! Trading account created.');
    } catch (err: any) {
      setError(err.message || 'Failed to approve payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectPayment = async () => {
    if (!accessToken || !order) return;

    try {
      setProcessing(true);
      await ordersApi.rejectPayment(accessToken, order.id, rejectionReason || undefined);
      setShowRejectModal(false);
      setRejectionReason('');
      await fetchOrder();
      alert('Payment rejected successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to reject payment');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
      case 'SUCCESS':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED':
      case 'FAILED':
      case 'REFUNDED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (value: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(parseFloat(value));
  };

  if (loading) {
    return (
      <ProtectedRoute requireRole="ADMIN">
        <AdminLayout>
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-600">Loading order...</div>
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  if (error || !order) {
    return (
      <ProtectedRoute requireRole="ADMIN">
        <AdminLayout>
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error || 'Order not found'}</p>
            <button
              onClick={() => router.push('/admin/orders')}
              className="text-blue-600 hover:text-blue-800"
            >
              Back to Orders
            </button>
          </div>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <button
              onClick={() => router.push('/admin/orders')}
              className="text-blue-600 hover:text-blue-800 mb-4 flex items-center"
            >
              ← Back to Orders
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
            <p className="text-gray-600 mt-1">Review and manage order</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* User Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">User Information</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Name:</span>
                    <span className="font-medium text-gray-900">
                      {order.user?.firstName} {order.user?.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email:</span>
                    <span className="text-gray-900">{order.user?.email}</span>
                  </div>
                  {order.user?.phone && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Phone:</span>
                      <span className="text-gray-900">{order.user.phone}</span>
                    </div>
                  )}
                  {order.user?.country && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Country:</span>
                      <span className="text-gray-900">{order.user.country}</span>
                    </div>
                  )}
                  <div className="pt-3 border-t">
                    <button
                      onClick={() => router.push(`/admin/users/${order.userId}`)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View User Profile →
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Order Information</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order ID:</span>
                    <span className="font-mono text-gray-900">{order.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created:</span>
                    <span className="text-gray-900">{new Date(order.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Updated:</span>
                    <span className="text-gray-900">{new Date(order.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Challenge Details */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Details</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Challenge:</span>
                    <span className="font-semibold text-gray-900">{order.planSnapshot?.name || order.challengePlan?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Account Size:</span>
                    <span className="text-gray-900">
                      {order.currency} {order.planSnapshot?.accountSize ? parseFloat(order.planSnapshot.accountSize).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price:</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(order.amount)}</span>
                  </div>
                  {order.planSnapshot?.description && (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-gray-600">{order.planSnapshot.description}</p>
                    </div>
                  )}
                </div>

                {/* Trading Rules */}
                {order.planSnapshot?.ruleSet?.rules && order.planSnapshot.ruleSet.rules.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h3 className="font-semibold text-gray-900 mb-3">Trading Rules</h3>
                    <div className="space-y-2">
                      {order.planSnapshot.ruleSet.rules.map((rule: any, index: number) => (
                        <div key={index} className="flex justify-between py-2 px-3 bg-gray-50 rounded">
                          <span className="text-sm text-gray-700">{rule.name}</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {rule.value}{rule.isPercentage ? '%' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Information */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Payment Information</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment Status:</span>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.payment?.status || 'PENDING')}`}>
                      {order.payment?.status || 'PENDING'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(order.amount)}</span>
                  </div>
                  {order.payment?.provider && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Provider:</span>
                      <span className="text-gray-900">{order.payment.provider}</span>
                    </div>
                  )}
                  {order.payment?.providerReference && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Reference:</span>
                      <span className="font-mono text-sm text-gray-900">{order.payment.providerReference}</span>
                    </div>
                  )}
                  {order.payment?.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Payment Created:</span>
                      <span className="text-gray-900">{new Date(order.payment.createdAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trading Account */}
              {order.tradingAccount && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h2 className="text-xl font-bold text-green-900 mb-4">✓ Trading Account Created</h2>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-green-700">Account Number:</span>
                      <span className="font-mono font-semibold text-green-900">
                        {order.tradingAccount.accountNumber}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Status:</span>
                      <span className="font-semibold text-green-900">{order.tradingAccount.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Initial Balance:</span>
                      <span className="text-green-900">
                        {order.currency} {parseFloat(order.tradingAccount.initialBalance).toLocaleString()}
                      </span>
                    </div>
                    <div className="pt-3">
                      <button
                        onClick={() => router.push(`/admin/trading-accounts/${order.tradingAccount.id}`)}
                        className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                      >
                        View Trading Account
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar - Actions */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6 sticky top-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-900">Actions</h3>

                {order.status === 'PENDING' && order.payment?.status === 'PENDING' && (
                  <>
                    <button
                      onClick={handleApprovePayment}
                      disabled={processing}
                      className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing ? 'Processing...' : 'Approve Payment'}
                    </button>

                    <button
                      onClick={() => setShowRejectModal(true)}
                      disabled={processing}
                      className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reject Payment
                    </button>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-xs text-yellow-800">
                        <strong>Warning:</strong> Approving payment will create a trading account. This action cannot be undone.
                      </p>
                    </div>
                  </>
                )}

                {order.status === 'PAID' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800">
                      ✓ Payment has been approved and trading account has been created.
                    </p>
                  </div>
                )}

                {order.status === 'FAILED' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-800">
                      This order has been rejected. No further action available.
                    </p>
                  </div>
                )}

                {order.status === 'CANCELLED' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-800">
                      This order has been cancelled.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Reject Payment</h3>
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to reject this payment? The user will be notified.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason (Optional)
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., Payment verification failed, Invalid payment reference..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectionReason('');
                  }}
                  disabled={processing}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectPayment}
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {processing ? 'Rejecting...' : 'Reject Payment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </ProtectedRoute>
  );
}
