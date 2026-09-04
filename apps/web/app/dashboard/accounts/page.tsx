'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/lib/auth-context';
import { tradingAccountsApi, TradingAccount } from '@/lib/trading-accounts-api';

export default function TradingAccountsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, [accessToken]);

  const fetchAccounts = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await tradingAccountsApi.getUserAccounts(accessToken);
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'PASSED':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'BREACHED':
      case 'SUSPENDED':
      case 'CLOSED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-3xl font-bold text-gray-900">Trading Accounts</h1>
            <p className="mt-2 text-gray-600">
              View and manage your trading accounts
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-600">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">💼</div>
              <p className="text-gray-600 text-lg mb-4">No trading accounts yet</p>
              <p className="text-gray-500 mb-6">Purchase a challenge to get started</p>
              <button
                onClick={() => router.push('/dashboard/challenges')}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
              >
                Browse Challenges
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => router.push(`/dashboard/accounts/${account.id}`)}
                >
                  <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-sm opacity-90">Account Number</div>
                        <div className="text-xl font-bold font-mono">{account.accountNumber}</div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(account.status)}`}>
                        {account.status}
                      </span>
                    </div>
                    <div className="text-3xl font-bold">
                      ${parseFloat(account.currentBalance).toLocaleString()}
                    </div>
                    <div className="text-sm opacity-90 mt-1">Current Balance</div>
                  </div>

                  <div className="p-6">
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-gray-600">Challenge</div>
                        <div className="font-semibold text-gray-900">
                          {account.challengePlan?.name || 'N/A'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-600">Initial Balance</div>
                          <div className="font-semibold text-gray-900">
                            ${parseFloat(account.initialBalance).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Equity</div>
                          <div className="font-semibold text-gray-900">
                            ${parseFloat(account.equity).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {account.startedAt && (
                        <div className="pt-3 border-t">
                          <div className="text-xs text-gray-500">
                            Started: {new Date(account.startedAt).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t">
                      <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold">
                        View Account
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
