'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, Order } from '@/lib/orders-api';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const orderId = params.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development';

  useEffect(() => {
    if (orderId && accessToken) {
      fetchOrder();
    }
  }, [orderId, accessToken]);

  const fetchOrder = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await ordersApi.getUserOrder(accessToken, orderId);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleTestPayment = async () => {
    if (!accessToken || !order) return;

    if (!confirm('Complete test payment? This will create a trading account.')) {
      return;
    }

    try {
      setProcessing(true);
      await ordersApi.testPayment(accessToken, order.id);
      
      // Refresh order
      await fetchOrder();
      
      alert('Payment completed! Your trading account has been created.');
    } catch (err: any) {
      setError(err.message || 'Failed to process test payment');
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
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-gray-600">Loading order...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !order) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || 'Order not found'}</p>
            <button
              onClick={() => router.push('/dashboard/orders')}
              className="text-blue-600 hover:text-blue-800"
            >
              Back to Orders
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <button
              onClick={() => router.push('/dashboard/orders')}
              className="text-blue-600 hover:text-blue-800 mb-4 flex items-center"
            >
              ← Back to Orders
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
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
                </div>
              </div>

              {/* Challenge Details */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Challenge Details</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Challenge:</span>
                    <span className="font-semibold text-gray-900">{order.planSnapshot?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Account Size:</span>
                    <span className="text-gray-900">
                      {order.currency} {order.planSnapshot?.accountSize ? parseFloat(order.planSnapshot.accountSize).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price:</span>
                    <span className="font-semibold text-gray-900">
                      {order.currency} {parseFloat(order.amount).toLocaleString()}
                    </span>
                  </div>
                  {order.planSnapshot?.description && (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-gray-600">{order.planSnapshot.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Trading Rules */}
              {order.planSnapshot?.ruleSet?.rules && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Trading Rules</h2>
                  <div className="space-y-2">
                    {order.planSnapshot.ruleSet.rules.map((rule: any, index: number) => (
                      <div key={index} className="flex justify-between py-2 px-3 bg-gray-50 rounded">
                        <span className="text-gray-700">{rule.name}</span>
                        <span className="font-semibold text-gray-900">
                          {rule.value}{rule.isPercentage ? '%' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    <div className="pt-3">
                      <button
                        onClick={() => router.push(`/dashboard/accounts/${order.tradingAccount.id}`)}
                        className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                      >
                        View Trading Account
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6 sticky top-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Status</h3>
                
                <div className="mb-4">
                  <div className="text-sm text-gray-600 mb-2">Payment Status</div>
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(order.payment?.status || 'PENDING')}`}>
                    {order.payment?.status || 'PENDING'}
                  </span>
                </div>

                <div className="border-t pt-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-600">Total Amount</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    {order.currency} {parseFloat(order.amount).toLocaleString()}
                  </div>
                </div>

                {order.payment?.status === 'PENDING' && isDevelopment && !order.tradingAccount && (
                  <div className="border-t pt-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-xs text-yellow-800">
                        <strong>Development Mode:</strong> Use the test payment button below to simulate a successful payment and create your trading account.
                      </p>
                    </div>
                    <button
                      onClick={handleTestPayment}
                      disabled={processing}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing ? 'Processing...' : 'Complete Test Payment'}
                    </button>
                  </div>
                )}

                {order.payment?.status === 'PENDING' && !isDevelopment && (
                  <div className="border-t pt-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-sm text-yellow-800">
                        <strong>Payment Pending:</strong> Your order is awaiting payment verification. You will be notified once the payment is processed.
                      </p>
                    </div>
                  </div>
                )}

                {order.payment?.status === 'FAILED' && (
                  <div className="border-t pt-4">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-800 font-semibold mb-2">
                        Payment Rejected
                      </p>
                      <p className="text-sm text-red-700">
                        Your payment could not be verified. Please review the payment instructions or contact support for assistance.
                      </p>
                    </div>
                  </div>
                )}

                {order.payment?.status === 'COMPLETED' && order.tradingAccount && (
                  <div className="border-t pt-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-800">
                        <strong>Payment Completed:</strong> Your trading account is ready!
                      </p>
                    </div>
                  </div>
                )}

                {order.payment?.provider && (
                  <div className="border-t pt-4 mt-4">
                    <div className="text-xs text-gray-500">
                      <div>Provider: {order.payment.provider}</div>
                      {order.payment.providerReference && (
                        <div className="font-mono">Ref: {order.payment.providerReference}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
