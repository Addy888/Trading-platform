'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { tradingApi, type TradingAccount } from '@/lib/trading-api';

export default function TradingDashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      loadAccounts();
    }
  }, [accessToken]);

  useEffect(() => {
    // Auto-select if only one ACTIVE account
    if (accounts.length === 1 && accounts[0].status === 'ACTIVE') {
      router.push(`/dashboard/trading/${accounts[0].id}`);
    }
  }, [accounts, router]);

  const loadAccounts = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const data = await tradingApi.getTradingAccounts(accessToken);
      setAccounts(data);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parseFloat(value));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'PASSED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'BREACHED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Trading Terminal</h1>
            <p className="text-gray-600">
              Select a trading account to start trading
            </p>
          </div>

          {loading ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-600">Loading accounts...</div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-700">{error}</p>
              <button
                onClick={loadAccounts}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : accounts.length === 0 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
              <div className="text-blue-900 text-lg font-semibold mb-2">
                No Trading Accounts Available
              </div>
              <p className="text-blue-700 mb-4">
                Purchase a challenge to start trading
              </p>
              <Link
                href="/dashboard/challenges"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Browse Challenges
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {account.accountNumber}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {account.challengePlan.name}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(account.status)}`}
                      >
                        {account.status}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Balance</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {formatCurrency(account.currentBalance)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Equity</div>
                          <div className="text-sm font-semibold text-gray-900">
                            {formatCurrency(account.equity)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 mb-1">P&L</div>
                        <div
                          className={`text-lg font-bold ${
                            parseFloat(account.equity) >= parseFloat(account.initialBalance)
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(
                            (parseFloat(account.equity) - parseFloat(account.initialBalance)).toString()
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      {account.status === 'ACTIVE' ? (
                        <Link
                          href={`/dashboard/trading/${account.id}`}
                          className="block w-full text-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
                        >
                          Open Trading Terminal
                        </Link>
                      ) : account.status === 'BREACHED' ? (
                        <div className="text-center py-3 px-4 bg-red-50 text-red-700 rounded-lg text-sm">
                          Trading disabled - Account breached
                        </div>
                      ) : account.status === 'PASSED' ? (
                        <div className="text-center py-3 px-4 bg-blue-50 text-blue-700 rounded-lg text-sm">
                          Challenge passed! Contact support.
                        </div>
                      ) : (
                        <div className="text-center py-3 px-4 bg-gray-50 text-gray-700 rounded-lg text-sm">
                          Trading not available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
