'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { tradingApi, type TradingAccount } from '@/lib/trading-api';
import { paymentsApi, type Wallet } from '@/lib/payments-api';

export default function TradingDashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuth();

  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [selectedAccountForFund, setSelectedAccountForFund] = useState<TradingAccount | null>(null);

  // Form states
  const [initialFunding, setInitialFunding] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      loadData();
    }
  }, [accessToken]);

  const loadData = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const [accountsData, walletData] = await Promise.all([
        tradingApi.getTradingAccounts(accessToken),
        paymentsApi.getWallet(accessToken).catch(() => null),
      ]);
      setAccounts(accountsData);
      setWallet(walletData);
    } catch (err: any) {
      console.error('Failed to load accounts/wallet:', err);
      setError(err.message || 'Failed to load trading accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    try {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const amountNum = initialFunding.trim() ? parseFloat(initialFunding.trim()) : 0;
      if (amountNum < 0 || isNaN(amountNum)) {
        throw new Error('Initial funding amount must be a positive number');
      }

      const availableWallet = wallet ? parseFloat(wallet.balance) : 0;
      if (amountNum > availableWallet) {
        throw new Error(
          `Insufficient wallet balance. Available: $${availableWallet.toFixed(2)}, Requested: $${amountNum.toFixed(2)}`
        );
      }

      const newAccount = await tradingApi.createTradingAccount(accessToken, {
        initialFundingAmount: amountNum > 0 ? amountNum.toFixed(2) : undefined,
      });

      setActionSuccess(`Trading account ${newAccount.accountNumber} created successfully!`);
      setInitialFunding('');
      
      // Reload accounts and wallet
      await loadData();

      // Close modal after brief delay
      setTimeout(() => {
        setShowCreateModal(false);
        setActionSuccess(null);
      }, 1500);
    } catch (err: any) {
      setActionError(err.message || 'Failed to create trading account');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFundAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !selectedAccountForFund) return;

    try {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const amountNum = parseFloat(fundAmount.trim());
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Please enter a valid positive transfer amount');
      }

      const availableWallet = wallet ? parseFloat(wallet.balance) : 0;
      if (amountNum > availableWallet) {
        throw new Error(
          `Insufficient wallet balance. Available: $${availableWallet.toFixed(2)}, Requested: $${amountNum.toFixed(2)}`
        );
      }

      await paymentsApi.transferToTrading(accessToken, {
        tradingAccountId: selectedAccountForFund.id,
        amount: amountNum.toFixed(2),
      });

      setActionSuccess(`Transferred $${amountNum.toFixed(2)} to account ${selectedAccountForFund.accountNumber}!`);
      setFundAmount('');

      // Reload accounts and wallet
      await loadData();

      setTimeout(() => {
        setShowFundModal(false);
        setSelectedAccountForFund(null);
        setActionSuccess(null);
      }, 1500);
    } catch (err: any) {
      setActionError(err.message || 'Failed to transfer funds to trading account');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'PASSED':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'BREACHED':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'SUSPENDED':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-black text-white tracking-tight">Trading Accounts</h1>
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider">
                    SIMULATED
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  Select an account to launch the Terminal, or create and fund direct trading accounts from your wallet balance.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard/wallet"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-indigo-500/50 text-slate-200 text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
                >
                  <span>💳</span>
                  <span>Deposit Funds</span>
                  {wallet && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-bold border border-indigo-800/60 text-[11px]">
                      {formatCurrency(wallet.balance)}
                    </span>
                  )}
                </Link>

                <button
                  onClick={() => {
                    setActionError(null);
                    setActionSuccess(null);
                    setShowCreateModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>➕</span>
                  <span>Create Trading Account</span>
                </button>
              </div>
            </div>
          </div>

          {/* Body Content */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-950/60 border border-slate-800/60 rounded-2xl p-6 animate-pulse space-y-4">
                  <div className="h-5 bg-slate-800 rounded w-1/2" />
                  <div className="h-8 bg-slate-800 rounded w-3/4" />
                  <div className="h-10 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-6 text-rose-200 space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-semibold">
                <span>⚠️</span>
                <span>Error loading trading accounts</span>
              </div>
              <p className="text-sm">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all"
              >
                Retry
              </button>
            </div>
          ) : accounts.length === 0 ? (
            /* Clear, Actionable Fintech Empty State */
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-8 sm:p-12 text-center shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-3xl mx-auto mb-4">
                📈
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                No Trading Accounts Yet
              </h2>
              <p className="text-sm text-slate-400 max-w-lg mx-auto mb-6">
                You can create a direct simulated trading account instantly and fund it from your wallet balance, or take an evaluation challenge.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
                <button
                  onClick={() => {
                    setActionError(null);
                    setActionSuccess(null);
                    setShowCreateModal(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02]"
                >
                  Create Trading Account
                </button>
                <Link
                  href="/dashboard/wallet"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 font-semibold text-sm transition-all"
                >
                  Deposit Funds to Wallet
                </Link>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-800/80 text-xs text-slate-500">
                Want evaluation prop rules instead?{' '}
                <Link href="/dashboard/challenges" className="text-indigo-400 hover:underline">
                  Browse Challenges →
                </Link>
              </div>
            </div>
          ) : (
            /* Accounts Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map((account) => {
                const initialBal = parseFloat(account.initialBalance);
                const currentBal = parseFloat(account.currentBalance);
                const currentEquity = parseFloat(account.equity);
                const pnl = currentEquity - initialBal;
                const pnlPercent = initialBal > 0 ? (pnl / initialBal) * 100 : 0;

                return (
                  <div
                    key={account.id}
                    className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl hover:border-slate-700 transition-all group flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div>
                          <div className="font-mono font-bold text-base text-white tracking-wide">
                            {account.accountNumber}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {account.challengePlan?.name || 'Direct Wallet-Funded'}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusColor(
                              account.status
                            )}`}
                          >
                            {account.status}
                          </span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                            {account.executionMode || 'SIMULATED'}
                          </span>
                        </div>
                      </div>

                      {/* Financial Metrics */}
                      <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80 mb-4">
                        <div>
                          <div className="text-[11px] text-slate-400 font-medium">Balance</div>
                          <div className="text-base font-bold text-white tracking-tight">
                            {formatCurrency(currentBal)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400 font-medium">Equity</div>
                          <div className="text-base font-bold text-white tracking-tight">
                            {formatCurrency(currentEquity)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs px-1 mb-5">
                        <span className="text-slate-400">Unrealized P&amp;L</span>
                        <span
                          className={`font-mono font-semibold ${
                            pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {formatCurrency(pnl)} ({pnlPercent >= 0 ? '+' : ''}
                          {pnlPercent.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      {account.status === 'ACTIVE' ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/trading/${account.id}`}
                            className="flex-1 text-center py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02]"
                          >
                            Open Trading Terminal →
                          </Link>
                          <button
                            onClick={() => {
                              setSelectedAccountForFund(account);
                              setActionError(null);
                              setActionSuccess(null);
                              setShowFundModal(true);
                            }}
                            title="Transfer funds from wallet to this trading account"
                            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-slate-800 hover:border-indigo-500/50 text-xs transition-colors"
                          >
                            💳 Fund
                          </button>
                        </div>
                      ) : account.status === 'BREACHED' ? (
                        <div className="text-center py-2 px-3 bg-rose-950/40 border border-rose-800/40 text-rose-300 rounded-xl text-xs font-medium">
                          Account Breached — Trading Locked
                        </div>
                      ) : account.status === 'PASSED' ? (
                        <div className="text-center py-2 px-3 bg-blue-950/40 border border-blue-800/40 text-blue-300 rounded-xl text-xs font-medium">
                          Evaluation Passed
                        </div>
                      ) : (
                        <div className="text-center py-2 px-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl text-xs">
                          Status: {account.status}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal: Create Trading Account */}
          {showCreateModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">➕</span>
                    <h3 className="text-lg font-bold text-white">Create Trading Account</h3>
                  </div>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-xs text-slate-400 mb-4">
                  Create a direct simulated trading account governed by standard risk rules. You can optionally fund it directly from your wallet balance right now, or fund it later.
                </p>

                {wallet && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Available Wallet Balance</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      {formatCurrency(wallet.balance)}
                    </span>
                  </div>
                )}

                {actionError && (
                  <div className="p-3 mb-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs">
                    {actionError}
                  </div>
                )}

                {actionSuccess && (
                  <div className="p-3 mb-4 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs">
                    {actionSuccess}
                  </div>
                )}

                <form onSubmit={handleCreateAccount} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Initial Funding Amount (Optional, USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-mono">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00 (leave blank for empty account)"
                        value={initialFunding}
                        onChange={(e) => setInitialFunding(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Amount will be debited from your wallet balance atomically.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all"
                    >
                      {actionLoading ? 'Creating...' : 'Create Account'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Fund Trading Account */}
          {showFundModal && selectedAccountForFund && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💳</span>
                    <h3 className="text-lg font-bold text-white">Fund Trading Account</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowFundModal(false);
                      setSelectedAccountForFund(null);
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 mb-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Target Account</span>
                    <span className="font-mono font-bold text-white">
                      {selectedAccountForFund.accountNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Current Balance</span>
                    <span className="font-mono text-white">
                      {formatCurrency(selectedAccountForFund.currentBalance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Available in Wallet</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatCurrency(wallet?.balance || '0.00')}
                    </span>
                  </div>
                </div>

                {actionError && (
                  <div className="p-3 mb-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs">
                    {actionError}
                  </div>
                )}

                {actionSuccess && (
                  <div className="p-3 mb-4 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs">
                    {actionSuccess}
                  </div>
                )}

                <form onSubmit={handleFundAccount} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Transfer Amount (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-mono">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        placeholder="100.00"
                        value={fundAmount}
                        onChange={(e) => setFundAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowFundModal(false);
                        setSelectedAccountForFund(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all"
                    >
                      {actionLoading ? 'Transferring...' : 'Transfer Funds'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
