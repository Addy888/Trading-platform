'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { tradingApi, type TradingAccount } from '@/lib/trading-api';
import { OpenPositionsPanel } from '@/components/trading/open-positions-panel';

export default function PositionsPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();

  // Accounts
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load accounts on mount
  useEffect(() => {
    if (accessToken) {
      loadAccounts();
    }
  }, [accessToken]);

  const loadAccounts = async () => {
    if (!accessToken) return;
    try {
      setAccountLoading(true);
      const data = await tradingApi.getTradingAccounts(accessToken);
      setAccounts(data);

      // Auto-select first account
      if (data.length > 0) {
        setSelectedAccount(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setAccountLoading(false);
    }
  };

  const selectedAccountData = accounts.find((a) => a.id === selectedAccount);

  const handlePositionClosed = () => {
    // Trigger refresh of positions
    setRefreshKey((k) => k + 1);
    // Reload account data to update balance
    loadAccounts();
  };

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Open Positions</h1>
            <p className="text-gray-600 mt-1">Manage your active trading positions</p>
          </div>

          {/* Account Selector */}
          <div className="bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Trading Account
            </label>
            {accountLoading ? (
              <div className="text-gray-600">Loading accounts...</div>
            ) : accounts.length === 0 ? (
              <div className="text-gray-600">
                No trading accounts available.{' '}
                <a href="/dashboard/challenges" className="text-blue-600 hover:text-blue-700">
                  Create or purchase an account
                </a>
              </div>
            ) : (
              <select
                value={selectedAccount || ''}
                onChange={(e) => {
                  setSelectedAccount(e.target.value);
                  setRefreshKey(0);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountNumber} - {account.challengePlan?.name || 'Direct Funded'} -{' '}
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(parseFloat(account.currentBalance))} - {account.status}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedAccountData && (
            <>
              {/* Account Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Balance</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(parseFloat(selectedAccountData.currentBalance))}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Equity</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(parseFloat(selectedAccountData.equity))}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Account Status</p>
                  <p className="text-lg font-bold mt-1">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        selectedAccountData.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : selectedAccountData.status === 'BREACHED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {selectedAccountData.status}
                    </span>
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-600">Mode</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {selectedAccountData.executionMode || 'SIMULATED'}
                  </p>
                </div>
              </div>

              {/* Open Positions Panel */}
              <div key={refreshKey}>
                <OpenPositionsPanel
                  account={selectedAccountData}
                  onPositionClosed={handlePositionClosed}
                />
              </div>
            </>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
