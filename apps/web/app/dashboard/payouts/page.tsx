'use client';

import { useState, useEffect } from 'react';
import { UserLayout } from '@/components/layout/user-layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/lib/auth-context';
import { payoutApi, type Payout, type PayoutEligibility } from '@/lib/payout-api';
import { tradingAccountsApi, type TradingAccount } from '@/lib/trading-accounts-api';

export default function PayoutsPage() {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [eligibility, setEligibility] = useState<PayoutEligibility | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);

  const [formData, setFormData] = useState({
    amount: '',
    method: 'BANK_TRANSFER',
    destination: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [accessToken]);

  useEffect(() => {
    if (selectedAccount && accessToken) {
      checkEligibility(selectedAccount);
    }
  }, [selectedAccount, accessToken]);

  const loadData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const [payoutsData, accountsData] = await Promise.all([
        payoutApi.getPayouts(accessToken, 1, 50),
        tradingAccountsApi.getUserAccounts(accessToken),
      ]);

      setPayouts(payoutsData.data);
      
      // Filter to show only PASSED and FUNDED accounts
      const eligibleAccounts = accountsData.filter(
        (acc: TradingAccount) => acc.status === 'PASSED' || acc.status === 'ACTIVE'
      );
      setAccounts(eligibleAccounts);

      if (eligibleAccounts.length > 0 && !selectedAccount) {
        setSelectedAccount(eligibleAccounts[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkEligibility = async (accountId: string) => {
    if (!accessToken) return;

    try {
      const data = await payoutApi.checkEligibility(accessToken, accountId);
      setEligibility(data);
    } catch (err: any) {
      console.error('Failed to check eligibility:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAccount(e.target.value);
    setEligibility(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !selectedAccount) return;

    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const requestData = {
        tradingAccountId: selectedAccount,
        amount: parseFloat(formData.amount),
        method: formData.method,
        destination: formData.destination,
        notes: formData.notes || undefined,
      };

      await payoutApi.requestPayout(accessToken, requestData);
      setSuccess('Payout request submitted successfully! It will be reviewed by our team.');
      
      // Reset form
      setFormData({
        amount: '',
        method: 'BANK_TRANSFER',
        destination: '',
        notes: '',
      });
      setShowRequestForm(false);

      // Reload payouts
      await loadData();

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err.message || 'Failed to request payout');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string }> = {
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      APPROVED: { bg: 'bg-blue-100', text: 'text-blue-800' },
      PROCESSING: { bg: 'bg-purple-100', text: 'text-purple-800' },
      COMPLETED: { bg: 'bg-green-100', text: 'text-green-800' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-800' },
      FAILED: { bg: 'bg-gray-100', text: 'text-gray-800' },
    };

    const badge = badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <UserLayout>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading payout information...</p>
            </div>
          </div>
        </UserLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <UserLayout>
        <div className="max-w-6xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
              <p className="text-gray-600 mt-1">Request and manage your profit withdrawals</p>
            </div>
            {accounts.length > 0 && !showRequestForm && (
              <button
                onClick={() => setShowRequestForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Request Payout
              </button>
            )}
          </div>

          {/* Alert Messages */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">{success}</p>
            </div>
          )}

          {/* No Accounts Notice */}
          {accounts.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <p className="text-yellow-800 font-medium">No Eligible Accounts</p>
              <p className="text-yellow-700 text-sm mt-2">
                You need to have a PASSED trading account to request payouts.
              </p>
            </div>
          )}

          {/* Request Payout Form */}
          {showRequestForm && accounts.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Request Payout</h2>
                <button
                  onClick={() => setShowRequestForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Account Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Trading Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedAccount}
                    onChange={handleAccountChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountNumber} - {account.challengePlan?.name} - Balance: ${parseFloat(account.currentBalance).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Eligibility Status */}
                {eligibility && (
                  <div className={`p-4 rounded-lg border ${eligibility.eligible ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`font-medium ${eligibility.eligible ? 'text-green-800' : 'text-red-800'}`}>
                      {eligibility.eligible ? '✓ Eligible for Payout' : '✗ Not Eligible for Payout'}
                    </p>
                    {!eligibility.eligible && (
                      <ul className="mt-2 text-sm text-red-700 space-y-1">
                        {!eligibility.reasons.statusEligible && (
                          <li>• Account status must be PASSED or FUNDED (Current: {eligibility.accountStatus})</li>
                        )}
                        {!eligibility.reasons.hasProfit && (
                          <li>• Account must have profit available</li>
                        )}
                        {eligibility.reasons.hasPendingPayout && (
                          <li>• Account has a pending payout request</li>
                        )}
                        {!eligibility.reasons.minTradingDaysMet && (
                          <li>• Minimum trading days requirement not met</li>
                        )}
                      </ul>
                    )}
                    {eligibility.eligible && (
                      <div className="mt-2 text-sm text-green-700">
                        <p>Available Profit: ${parseFloat(eligibility.availableProfit).toLocaleString()}</p>
                        <p>Current Balance: ${parseFloat(eligibility.balance).toLocaleString()}</p>
                        <p>Equity: ${parseFloat(eligibility.equity).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                )}

                {eligibility?.eligible && (
                  <>
                    {/* Amount */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Amount (USD) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="amount"
                        value={formData.amount}
                        onChange={handleInputChange}
                        required
                        min="0"
                        max={parseFloat(eligibility.availableProfit)}
                        step="0.01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Maximum: ${parseFloat(eligibility.availableProfit).toLocaleString()}
                      </p>
                    </div>

                    {/* Payment Method */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Method <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="method"
                        value={formData.method}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="CRYPTO">Cryptocurrency</option>
                        <option value="PAYPAL">PayPal</option>
                        <option value="WISE">Wise</option>
                      </select>
                    </div>

                    {/* Destination */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Destination <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        name="destination"
                        value={formData.destination}
                        onChange={handleInputChange}
                        required
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Bank account details, crypto wallet address, email, etc."
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Provide complete details for your chosen payment method
                      </p>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notes (Optional)
                      </label>
                      <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Any additional information..."
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => setShowRequestForm(false)}
                        className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !eligibility.eligible}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                      >
                        {submitting ? 'Submitting...' : 'Submit Request'}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          )}

          {/* Payout History */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Payout History</h2>
            </div>

            {payouts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>No payout requests yet</p>
                {accounts.length > 0 && (
                  <p className="text-sm mt-2">Click "Request Payout" to create your first request</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Processed</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payouts.map((payout) => (
                      <tr key={payout.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {payout.tradingAccountId.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          ${parseFloat(payout.amount).toLocaleString()} {payout.currency}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {payout.method || '-'}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(payout.status)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(payout.requestedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {payout.processedAt ? new Date(payout.processedAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {payout.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
