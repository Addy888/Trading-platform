'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { tradingApi, type TradingAccount, type Trade } from '@/lib/trading-api';

export default function TradesHistoryPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  
  // Accounts
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  
  // Trades
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sideFilter, setSideFilter] = useState<string>('');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Load accounts on mount
  useEffect(() => {
    if (accessToken) {
      loadAccounts();
    }
  }, [accessToken]);

  // Load trades when account changes
  useEffect(() => {
    if (selectedAccount) {
      loadTrades();
    }
  }, [selectedAccount, page, statusFilter]);

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

  const loadTrades = async () => {
    if (!accessToken || !selectedAccount) return;
    try {
      setTradesLoading(true);
      setTradesError(null);
      const data = await tradingApi.getTradeHistory(accessToken, selectedAccount, {
        page,
        limit,
        status: statusFilter || undefined,
      });
      setTrades(data.trades || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err: any) {
      console.error('Failed to load trades:', err);
      setTradesError(err.message || 'Failed to load trades');
      setTrades([]);
    } finally {
      setTradesLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadTrades();
  };

  const filteredTrades = trades.filter((trade) => {
    if (sideFilter && trade.side !== sideFilter) return false;
    if (symbolFilter && !trade.symbol.toLowerCase().includes(symbolFilter.toLowerCase()))
      return false;
    return true;
  });

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatPrice = (value: string | number, decimals: number = 5) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num.toFixed(decimals);
  };

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trade History</h1>
            <p className="text-gray-600 mt-1">View all your trading activity</p>
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
                  Purchase a challenge
                </a>
              </div>
            ) : (
              <select
                value={selectedAccount || ''}
                onChange={(e) => {
                  setSelectedAccount(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountNumber} - {account.challengePlan.name} -{' '}
                    {formatCurrency(account.currentBalance)} - {account.status}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedAccount && (
            <>
              {/* Filters */}
              <div className="bg-white rounded-lg shadow p-4">
                <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={symbolFilter}
                      onChange={(e) => setSymbolFilter(e.target.value)}
                      placeholder="e.g., EURUSD"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Side
                    </label>
                    <select
                      value={sideFilter}
                      onChange={(e) => setSideFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Sides</option>
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Status</option>
                      <option value="OPEN">OPEN</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Filter
                    </button>
                  </div>
                </form>
              </div>

              {tradesError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800">{tradesError}</p>
                </div>
              )}

              {/* Results Summary */}
              <div className="text-sm text-gray-600">
                Showing {filteredTrades.length} of {total} trades
              </div>

              {/* Trades Table */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                {tradesLoading ? (
                  <div className="text-center py-12 text-gray-600">Loading trades...</div>
                ) : filteredTrades.length === 0 ? (
                  <div className="text-center py-12 text-gray-600">No trades found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Symbol
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Side
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Volume
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Entry Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Exit Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Realized PnL
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Opened At
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Closed At
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTrades.map((trade) => (
                          <tr key={trade.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                              {trade.symbol}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 text-xs rounded ${
                                  trade.side === 'BUY'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {trade.side}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {trade.volume}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                              {formatPrice(trade.entryPrice)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                              {trade.exitPrice ? formatPrice(trade.exitPrice) : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`text-sm font-semibold ${
                                  parseFloat(trade.realizedPnl) >= 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {formatCurrency(trade.realizedPnl)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 text-xs rounded ${
                                  trade.status === 'OPEN'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {trade.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(trade.openedAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {trade.closedAt
                                ? new Date(trade.closedAt).toLocaleString()
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
