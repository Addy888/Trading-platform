'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { dashboardApi, type UserDashboard } from '@/lib/dashboard-api';
import { paymentsApi, type Wallet, type WalletLedger } from '@/lib/payments-api';
import { tradingAccountsApi, type TradingAccount } from '@/lib/trading-accounts-api';
import { tradingV2Api, type MarginInfo } from '@/lib/trading-v2-api';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, accessToken } = useAuth();

  // Core Data
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [recentLedger, setRecentLedger] = useState<WalletLedger[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [marginInfo, setMarginInfo] = useState<MarginInfo | null>(null);
  const [marginError, setMarginError] = useState<string | null>(null);

  // Loading & Error States
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State for Quick Account Creation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [initialFunding, setInitialFunding] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (accessToken) {
      loadDashboardData();
    }
  }, [accessToken]);

  // When selected account changes, fetch its real margin info
  useEffect(() => {
    if (accessToken && selectedAccountId) {
      loadAccountMargin(selectedAccountId);
    }
  }, [accessToken, selectedAccountId]);

  const loadDashboardData = async () => {
    if (!accessToken) return;
    try {
      setDataLoading(true);
      setError(null);

      const [dashData, walletData, accountsData, historyData] = await Promise.all([
        dashboardApi.getUserDashboard(accessToken).catch(() => null),
        paymentsApi.getWallet(accessToken).catch(() => null),
        tradingAccountsApi.getUserAccounts(accessToken).catch(() => []),
        paymentsApi.getWalletHistory(accessToken, { limit: 10 }).catch(() => null),
      ]);

      setDashboard(dashData);
      setWallet(walletData);
      setAccounts(accountsData || []);
      if (historyData?.data) {
        setRecentLedger(historyData.data);
      }

      // Default select the first active account if not already selected
      if (accountsData && accountsData.length > 0) {
        const active = accountsData.find((a: TradingAccount) => a.status === 'ACTIVE') || accountsData[0];
        setSelectedAccountId(active.id);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setDataLoading(false);
    }
  };

  const loadAccountMargin = async (accountId: string) => {
    if (!accessToken) return;
    try {
      setMarginError(null);
      const info = await tradingV2Api.getMarginInfo(accessToken, accountId);
      setMarginInfo(info);
    } catch (err: any) {
      setMarginInfo(null);
      setMarginError('Margin details require fresh live quotes from OANDA.');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    try {
      setCreateLoading(true);
      setCreateError(null);
      setCreateSuccess(null);

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

      const newAccount = await tradingAccountsApi.createAccount(accessToken, {
        initialFundingAmount: amountNum > 0 ? amountNum.toFixed(2) : undefined,
      });

      setCreateSuccess(`Account ${newAccount.accountNumber} created!`);
      setInitialFunding('');

      await loadDashboardData();

      setTimeout(() => {
        setShowCreateModal(false);
        setCreateSuccess(null);
      }, 1500);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create trading account');
    } finally {
      setCreateLoading(false);
    }
  };

  const formatCurrency = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '$0.00';
    const num = typeof val === 'string' ? parseFloat(val) : val;
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="space-y-6">
          {/* Welcome Banner & Action Bar */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-white tracking-tight">
                    Welcome back, {user.firstName}!
                  </h1>
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider">
                    SIMULATED
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Manage your platform wallet, funded trading accounts, and live execution.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard/wallet"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-indigo-500/50 text-slate-200 text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
                >
                  <span>💳</span>
                  <span>Deposit Funds</span>
                </Link>

                <button
                  onClick={() => {
                    setCreateError(null);
                    setCreateSuccess(null);
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

          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={loadDashboardData}
                className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {/* Section 1: Dashboard Financial Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Wallet Balance */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-medium">Platform Wallet</span>
                <span className="p-1.5 rounded-lg bg-indigo-600/10 text-indigo-400">💳</span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {dataLoading ? (
                  <div className="h-7 w-28 bg-slate-800 rounded animate-pulse" />
                ) : (
                  formatCurrency(wallet?.balance)
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                <span>Available for transfers</span>
                <Link href="/dashboard/wallet" className="text-indigo-400 hover:underline">
                  Deposit →
                </Link>
              </div>
            </div>

            {/* Card 2: Selected Account Balance */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-medium truncate">
                  {selectedAccount ? `Account ${selectedAccount.accountNumber}` : 'Trading Balance'}
                </span>
                <span className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400">💼</span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {dataLoading ? (
                  <div className="h-7 w-28 bg-slate-800 rounded animate-pulse" />
                ) : selectedAccount ? (
                  formatCurrency(selectedAccount.currentBalance)
                ) : (
                  <span className="text-slate-500 text-lg">No account</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                <span>Initial: {selectedAccount ? formatCurrency(selectedAccount.initialBalance) : '$0.00'}</span>
                {selectedAccount && (
                  <span className="font-mono text-emerald-400">{selectedAccount.status}</span>
                )}
              </div>
            </div>

            {/* Card 3: Account Equity */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-medium">Account Equity</span>
                <span className="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-400">📊</span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {dataLoading ? (
                  <div className="h-7 w-28 bg-slate-800 rounded animate-pulse" />
                ) : selectedAccount ? (
                  formatCurrency(selectedAccount.equity)
                ) : (
                  <span className="text-slate-500 text-lg">No account</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 text-[11px]">
                <span className="text-slate-400">Unrealized P&amp;L</span>
                {selectedAccount ? (
                  <span
                    className={`font-mono font-semibold ${
                      parseFloat(selectedAccount.equity) >= parseFloat(selectedAccount.initialBalance)
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(
                      parseFloat(selectedAccount.equity) - parseFloat(selectedAccount.initialBalance)
                    )}
                  </span>
                ) : (
                  <span className="text-slate-500">$0.00</span>
                )}
              </div>
            </div>

            {/* Card 4: Available Margin */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-medium">Available Margin</span>
                <span className="p-1.5 rounded-lg bg-amber-600/10 text-amber-400">⚡</span>
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {dataLoading ? (
                  <div className="h-7 w-28 bg-slate-800 rounded animate-pulse" />
                ) : marginInfo ? (
                  formatCurrency(marginInfo.freeMargin)
                ) : (
                  <span className="text-amber-400/80 text-sm font-semibold">Unavailable</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                <span>
                  {marginInfo ? `Used: ${formatCurrency(marginInfo.usedMargin)}` : 'Awaiting live quotes'}
                </span>
                <span className="text-cyan-400 font-mono text-[10px]">SIMULATED</span>
              </div>
            </div>
          </div>

          {/* Section 2: Trading Accounts Grid */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Trading Accounts</h2>
                <p className="text-xs text-slate-400">
                  Select an account to view metrics or open the execution terminal.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
                >
                  ➕ Create Account
                </button>
              </div>
            </div>

            {dataLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse space-y-3">
                    <div className="h-4 bg-slate-800 rounded w-1/3" />
                    <div className="h-6 bg-slate-800 rounded w-2/3" />
                    <div className="h-8 bg-slate-800 rounded" />
                  </div>
                ))}
              </div>
            ) : accounts.length === 0 ? (
              /* Empty State (No challenge gate!) */
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/50">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl mx-auto mb-3">
                  📈
                </div>
                <h3 className="text-base font-bold text-white mb-1">No Trading Accounts Found</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                  You do not need to purchase a challenge to start trading. Create an account directly and transfer wallet funds to begin.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md"
                  >
                    Create Trading Account
                  </button>
                  <Link
                    href="/dashboard/wallet"
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    Deposit Funds
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((account) => {
                  const isSelected = account.id === selectedAccountId;
                  const curBal = parseFloat(account.currentBalance);
                  const curEq = parseFloat(account.equity);
                  const pnl = curEq - parseFloat(account.initialBalance);

                  return (
                    <div
                      key={account.id}
                      onClick={() => setSelectedAccountId(account.id)}
                      className={`cursor-pointer rounded-xl p-4.5 border transition-all ${
                        isSelected
                          ? 'bg-slate-900/90 border-indigo-500/80 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/40'
                          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-mono font-bold text-sm text-white flex items-center gap-2">
                            <span>{account.accountNumber}</span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {account.challengePlan?.name || 'Direct Wallet-Funded'}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(
                              account.status
                            )}`}
                          >
                            {account.status}
                          </span>
                          <span className="text-[9px] font-mono uppercase px-1 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                            {account.executionMode || 'SIMULATED'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 mb-3">
                        <div>
                          <div className="text-[10px] text-slate-400">Balance</div>
                          <div className="font-mono font-bold text-xs text-white">
                            {formatCurrency(curBal)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Equity</div>
                          <div className="font-mono font-bold text-xs text-white">
                            {formatCurrency(curEq)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] mb-3">
                        <span className="text-slate-400">P&amp;L</span>
                        <span
                          className={`font-mono font-semibold ${
                            pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {formatCurrency(pnl)}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                        <Link
                          href={`/dashboard/trading/${account.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 text-center py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all hover:scale-[1.01]"
                        >
                          Open Terminal →
                        </Link>
                        <Link
                          href="/dashboard/trading"
                          onClick={(e) => e.stopPropagation()}
                          className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                          title="Manage account"
                        >
                          ⚙️
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Recent Activity (Wallet Ledger, Transfers & Trading) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Wallet & Transfer History */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Wallet &amp; Transfer History
                  </h3>
                  <p className="text-xs text-slate-400">
                    Verified deposits and wallet-to-account ledger entries
                  </p>
                </div>
                <Link
                  href="/dashboard/wallet"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  View All →
                </Link>
              </div>

              {recentLedger.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No wallet transactions recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentLedger.slice(0, 5).map((item) => {
                    const isCredit = item.direction === 'CREDIT';
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isCredit
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {isCredit ? '↓' : '↑'}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-200">
                              {item.type.replace(/_/g, ' ')}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {item.description || item.referenceType}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`font-mono font-bold ${
                              isCredit ? 'text-emerald-400' : 'text-slate-200'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {formatCurrency(item.amount)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(item.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Trading Activity */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Recent Trading Activity
                  </h3>
                  <p className="text-xs text-slate-400">
                    Latest simulated trades executed across your accounts
                  </p>
                </div>
                <Link
                  href="/dashboard/trading"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  Trade Terminal →
                </Link>
              </div>

              {!dashboard?.recentTrades || dashboard.recentTrades.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No trades executed yet. Open the Trading Terminal to place orders.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {dashboard.recentTrades.slice(0, 5).map((trade) => {
                    const pnlNum = parseFloat(trade.realizedPnl);
                    return (
                      <div
                        key={trade.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              trade.side === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {trade.side}
                          </span>
                          <div>
                            <div className="font-bold text-white">{trade.symbol}</div>
                            <div className="text-[11px] text-slate-400">
                              Vol: {trade.volume}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`font-mono font-bold ${
                              pnlNum >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pnlNum >= 0 ? '+' : ''}
                            {formatCurrency(trade.realizedPnl)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(trade.openedAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

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
                  Creates an active simulated trading account. You can optionally fund it directly from your wallet balance right now, or fund it anytime later.
                </p>

                {wallet && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Available Wallet Balance</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      {formatCurrency(wallet.balance)}
                    </span>
                  </div>
                )}

                {createError && (
                  <div className="p-3 mb-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs">
                    {createError}
                  </div>
                )}

                {createSuccess && (
                  <div className="p-3 mb-4 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs">
                    {createSuccess}
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
                      Debited directly from your platform wallet.
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
                      disabled={createLoading}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all"
                    >
                      {createLoading ? 'Creating...' : 'Create Account'}
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
