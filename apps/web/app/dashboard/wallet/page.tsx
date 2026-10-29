'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { useAuth } from '@/lib/auth-context';
import { paymentsApi, Wallet, WalletLedger, Payment } from '@/lib/payments-api';
import { tradingAccountsApi, TradingAccount } from '@/lib/trading-accounts-api';

function WalletContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledgers, setLedgers] = useState<WalletLedger[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'deposits'>('transactions');

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState('100.00');
  const [depositCurrency, setDepositCurrency] = useState('USD');
  const [depositProvider, setDepositProvider] = useState('SIMULATION');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [stripeConfigured, setStripeConfigured] = useState(false);

  // Transfer Form State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferType, setTransferType] = useState<'TO_TRADING' | 'FROM_TRADING'>('TO_TRADING');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('50.00');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');

  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Preset amounts
  const presetAmounts = ['25.00', '50.00', '100.00', '250.00', '500.00', '1000.00'];

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setNotification({
        type: 'success',
        message: 'Payment completed! Your wallet balance has been updated.',
      });
    } else if (status === 'cancelled') {
      setNotification({
        type: 'error',
        message: 'Deposit checkout was cancelled. No funds were debited.',
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (accessToken) {
      loadWalletData();
    }
  }, [accessToken]);

  const loadWalletData = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const [walletData, ledgerData, paymentsData, userAccounts] = await Promise.all([
        paymentsApi.getWallet(accessToken),
        paymentsApi.getWalletHistory(accessToken, { limit: 20 }),
        paymentsApi.getMyPayments(accessToken, { limit: 20 }),
        tradingAccountsApi.getUserAccounts(accessToken),
      ]);

      setWallet(walletData);
      setLedgers(ledgerData.data || []);
      setPayments(paymentsData.data || []);
      setAccounts(userAccounts || []);
      if (userAccounts && userAccounts.length > 0) {
        setSelectedAccountId(userAccounts[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load wallet data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    // Validate amount
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError('Please enter a valid deposit amount');
      return;
    }

    if (amount < 5) {
      setDepositError('Minimum deposit amount is $5.00');
      return;
    }

    if (amount > 50000) {
      setDepositError('Maximum deposit amount is $50,000.00');
      return;
    }

    // Check if Stripe is selected but not configured
    if (depositProvider === 'STRIPE' && !stripeConfigured) {
      setDepositError('Stripe payment gateway is not configured on the server. Please use Test Simulation mode or contact support.');
      return;
    }

    try {
      setDepositLoading(true);
      setDepositError('');

      const result = await paymentsApi.initiateDeposit(accessToken, {
        amount: amount.toFixed(2),
        currency: depositCurrency,
        provider: depositProvider,
      });

      if (result.checkoutUrl) {
        // Redirect to Stripe checkout
        router.push(result.checkoutUrl);
      } else {
        // Simulation mode - reload data
        await loadWalletData();
        setNotification({
          type: 'success',
          message: `Deposit of $${amount.toFixed(2)} ${depositCurrency} initiated! Reference: ${result.reference}`,
        });
        setDepositAmount('100.00');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to initiate deposit';
      setDepositError(errorMessage);
      
      // Check if it's a Stripe configuration error
      if (errorMessage.includes('not configured')) {
        setStripeConfigured(false);
        setDepositProvider('SIMULATION');
        setNotification({
          type: 'warning',
          message: 'Stripe is not configured. Switched to test simulation mode.',
        });
      }
    } finally {
      setDepositLoading(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !selectedAccountId) return;

    try {
      setTransferLoading(true);
      setTransferError('');
      setTransferSuccess('');

      if (transferType === 'TO_TRADING') {
        const res = await paymentsApi.transferToTrading(accessToken, {
          tradingAccountId: selectedAccountId,
          amount: transferAmount,
        });
        setTransferSuccess(
          `Transferred $${transferAmount} to account ${res.accountNumber}. New wallet balance: $${res.walletBalance}`,
        );
      } else {
        const res = await paymentsApi.transferFromTrading(accessToken, {
          tradingAccountId: selectedAccountId,
          amount: transferAmount,
        });
        setTransferSuccess(
          `Transferred $${transferAmount} from trading account to wallet. New wallet balance: $${res.walletBalance}`,
        );
      }

      await loadWalletData();
      setTimeout(() => {
        setShowTransferModal(false);
        setTransferSuccess('');
      }, 2000);
    } catch (err: any) {
      setTransferError(err.message || 'Transfer failed');
    } finally {
      setTransferLoading(false);
    }
  };

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(isNaN(num) ? 0 : num);
  };

  const getLedgerBadge = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Deposit</span>;
      case 'TRANSFER_TO_TRADING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Transfer to Trading</span>;
      case 'TRANSFER_FROM_TRADING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">Transfer from Trading</span>;
      case 'ADMIN_ADJUSTMENT':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Admin Adjustment</span>;
      case 'ORDER_PURCHASE':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Plan Purchase</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{type}</span>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
      case 'COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Success</span>;
      case 'PENDING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>;
      case 'FAILED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Failed</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Cancelled</span>;
      case 'REFUNDED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Refunded</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <ProtectedRoute>
      <UserLayout>
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Platform Wallet</h1>
              <p className="text-gray-500 mt-1">Manage deposits, wallet balance, and trading account funding</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setTransferType('TO_TRADING');
                  setShowTransferModal(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm font-medium transition-colors flex items-center gap-2"
              >
                <span>⚡</span> Fund Trading Account
              </button>
            </div>
          </div>

          {/* Notification Alert */}
          {notification && (
            <div
              className={`p-4 rounded-xl flex items-center justify-between shadow-lg border-2 ${
                notification.type === 'success'
                  ? 'bg-emerald-900/30 text-emerald-200 border-emerald-700/50'
                  : notification.type === 'warning'
                  ? 'bg-yellow-900/30 text-yellow-200 border-yellow-700/50'
                  : 'bg-red-900/30 text-red-200 border-red-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {notification.type === 'success' ? '✓' : notification.type === 'warning' ? '⚠️' : '❌'}
                </span>
                <span className="font-medium text-sm">{notification.message}</span>
              </div>
              <button 
                onClick={() => setNotification(null)} 
                className="text-sm font-bold opacity-60 hover:opacity-100 transition-opacity px-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Top Wallet Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Primary Balance Card */}
            <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl transform translate-x-8 -translate-y-8" />
              <div className="relative z-10">
                <div className="flex justify-between items-center text-blue-200 text-sm font-medium">
                  <span>Available Wallet Balance</span>
                  <span className="px-2 py-0.5 rounded bg-blue-800/60 text-xs text-blue-200 font-mono">
                    {wallet?.currency || 'USD'}
                  </span>
                </div>
                <div className="text-4xl font-black mt-3 tracking-tight">
                  {loading ? '...' : formatCurrency(wallet?.balance || '0.00')}
                </div>
                <p className="text-blue-300 text-xs mt-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Verified Platform Balance
                </p>
              </div>
            </div>

            {/* Trading Accounts Summary */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-gray-400">Linked Trading Accounts</span>
                <div className="text-3xl font-extrabold text-gray-900 mt-2">
                  {accounts.filter((a) => a.status === 'ACTIVE').length}{' '}
                  <span className="text-sm font-normal text-gray-500">Active</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Total Platform Equity: {formatCurrency(accounts.reduce((acc, a) => acc + parseFloat(a.equity || '0'), 0))}
                </p>
              </div>
              <button
                onClick={() => {
                  setTransferType('TO_TRADING');
                  setShowTransferModal(true);
                }}
                className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 flex items-center gap-1 mt-4"
              >
                Transfer funds to account &rarr;
              </button>
            </div>

            {/* Security & Isolation Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-gray-400">Fund Isolation & Safety</span>
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  Platform deposits are held in your isolated user wallet. Deposits fund trading accounts explicitly through
                  authorized atomic transfers to protect challenge risk parameters and trading isolation.
                </p>
              </div>
              <div className="text-xs text-emerald-600 font-medium flex items-center gap-1.5 mt-2">
                <span>🛡️</span> Decimal-Safe Atomic Ledger Enforced
              </div>
            </div>
          </div>

          {/* Deposit Funds Section */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl shadow-xl border border-slate-800 p-6 sm:p-8">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Deposit Funds to Wallet</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Choose an amount to deposit. Funds are credited instantly to your platform wallet after payment confirmation.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Current Balance</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    {loading ? '...' : formatCurrency(wallet?.balance || '0.00')}
                  </div>
                </div>
              </div>

              {depositError && (
                <div className="mb-6 p-4 bg-red-900/30 border border-red-700/50 text-red-300 text-sm rounded-xl flex items-start gap-3">
                  <span className="text-lg">⚠️</span>
                  <div className="flex-1">
                    <div className="font-semibold mb-1">Deposit Error</div>
                    <div>{depositError}</div>
                  </div>
                  <button 
                    onClick={() => setDepositError('')}
                    className="text-red-400 hover:text-red-200 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              <form onSubmit={handleDeposit} className="space-y-6">
                {/* Preset Amount Buttons */}
                <div>
                  <label className="block text-sm font-bold text-slate-200 mb-3">
                    Select Amount (USD)
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {presetAmounts.map((amt) => (
                      <button
                        type="button"
                        key={amt}
                        onClick={() => setDepositAmount(amt)}
                        disabled={depositLoading}
                        className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all ${
                          depositAmount === amt
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/30 scale-105'
                            : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:bg-slate-700/50 hover:border-indigo-500/50'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        ${parseInt(amt)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Amount Input */}
                <div>
                  <label className="block text-sm font-bold text-slate-200 mb-2">
                    Custom Amount
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-slate-400 font-bold text-lg">$</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="5"
                      max="50000"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={depositLoading}
                      className="pl-10 pr-4 block w-full rounded-xl border-2 border-slate-700 bg-slate-800/50 text-white text-xl font-bold py-3.5 placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Min: $5.00 · Max: $50,000.00
                  </p>
                </div>

                {/* Currency and Provider Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-200 mb-2">
                      Currency
                    </label>
                    <select
                      value={depositCurrency}
                      onChange={(e) => setDepositCurrency(e.target.value)}
                      disabled={depositLoading}
                      className="block w-full rounded-xl border-2 border-slate-700 bg-slate-800/50 text-white py-3 px-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="USD">🇺🇸 USD - US Dollar</option>
                      <option value="EUR">🇪🇺 EUR - Euro</option>
                      <option value="GBP">🇬🇧 GBP - British Pound</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-200 mb-2">
                      Payment Method
                    </label>
                    <select
                      value={depositProvider}
                      onChange={(e) => setDepositProvider(e.target.value)}
                      disabled={depositLoading}
                      className="block w-full rounded-xl border-2 border-slate-700 bg-slate-800/50 text-white py-3 px-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="SIMULATION">💳 Test Simulation (Instant)</option>
                      <option value="STRIPE">💎 Stripe (Credit/Debit Card)</option>
                    </select>
                  </div>
                </div>

                {/* Provider Information */}
                {depositProvider === 'SIMULATION' && (
                  <div className="p-4 bg-blue-900/20 border border-blue-700/30 rounded-xl">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">ℹ️</span>
                      <div className="text-sm text-blue-200">
                        <div className="font-semibold mb-1">Test Simulation Mode</div>
                        <div className="text-blue-300">
                          Instant deposit for testing. Funds are added immediately with HMAC-verified simulation transactions.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {depositProvider === 'STRIPE' && !stripeConfigured && (
                  <div className="p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-xl">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">⚠️</span>
                      <div className="text-sm text-yellow-200">
                        <div className="font-semibold mb-1">Stripe Not Configured</div>
                        <div className="text-yellow-300">
                          Stripe payment gateway is not configured on the server. Please use Test Simulation mode or contact your administrator to configure Stripe API keys.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-4 border-t border-slate-800">
                  <button
                    type="submit"
                    disabled={depositLoading || (depositProvider === 'STRIPE' && !stripeConfigured)}
                    className="w-full sm:w-auto min-w-[280px] px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg group"
                  >
                    {depositLoading ? (
                      <>
                        <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>💰</span>
                        <span>Deposit ${depositAmount} {depositCurrency}</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </>
                    )}
                  </button>
                  <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                    <span>🔒</span>
                    <span>Secure 256-bit encrypted transactions. Funds credited after webhook confirmation.</span>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Ledger History & Transactions */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="border-b border-gray-100 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('transactions')}
                  className={`pb-2 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === 'transactions'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Ledger History ({ledgers.length})
                </button>
                <button
                  onClick={() => setActiveTab('deposits')}
                  className={`pb-2 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === 'deposits'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Deposit Orders ({payments.length})
                </button>
              </div>
              <button
                onClick={loadWalletData}
                className="text-xs text-gray-500 hover:text-gray-900 font-medium flex items-center gap-1"
              >
                <span>🔄</span> Refresh
              </button>
            </div>

            {activeTab === 'transactions' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider text-xs">
                    <tr>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Amount</th>
                      <th className="px-6 py-3">Balance Before & After</th>
                      <th className="px-6 py-3">Reference</th>
                      <th className="px-6 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledgers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                          No transactions recorded yet. Make a deposit to fund your platform wallet.
                        </td>
                      </tr>
                    ) : (
                      ledgers.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                            {new Date(entry.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{getLedgerBadge(entry.type)}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold">
                            <span className={entry.direction === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'}>
                              {entry.direction === 'CREDIT' ? '+' : '-'}${entry.amount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 font-mono">
                            ${entry.balanceBefore} &rarr; ${entry.balanceAfter}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                            {entry.providerReference || entry.referenceId || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
                            {entry.description || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider text-xs">
                    <tr>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Reference</th>
                      <th className="px-6 py-3">Provider</th>
                      <th className="px-6 py-3">Amount</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                          No deposit orders initiated yet.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                            {new Date(p.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-800">
                            {p.reference || p.providerReference || p.id.substring(0, 8)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-gray-700">
                            {p.provider}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">
                            ${p.amount} {p.currency}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{getPaymentStatusBadge(p.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Transfer Modal */}
          {showTransferModal && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold"
                >
                  ✕
                </button>
                <h3 className="text-lg font-bold text-gray-900">Transfer Funds</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Authorize atomic transfer between your user platform wallet and trading account.
                </p>

                {transferError && (
                  <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                    {transferError}
                  </div>
                )}
                {transferSuccess && (
                  <div className="mt-4 p-3 bg-green-50 text-green-700 text-xs rounded-lg border border-green-200">
                    {transferSuccess}
                  </div>
                )}

                <form onSubmit={handleTransfer} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase">Transfer Direction</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setTransferType('TO_TRADING')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold border ${
                          transferType === 'TO_TRADING'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        Wallet &rarr; Trading Account
                      </button>
                      <button
                        type="button"
                        onClick={() => setTransferType('FROM_TRADING')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold border ${
                          transferType === 'FROM_TRADING'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        Trading Account &rarr; Wallet
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase">Target Trading Account</label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="mt-1 block w-full rounded-lg border-gray-300 py-2 px-3 text-sm border focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    >
                      {accounts.length === 0 ? (
                        <option value="">No trading accounts available</option>
                      ) : (
                        accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.accountNumber} ({acc.status}) - Balance: ${acc.currentBalance}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-bold text-gray-700 uppercase">Amount ($)</label>
                      <span className="text-gray-500">
                        {transferType === 'TO_TRADING'
                          ? `Available Wallet: $${wallet?.balance || '0.00'}`
                          : `Selected Account: $${
                              accounts.find((a) => a.id === selectedAccountId)?.currentBalance || '0.00'
                            }`}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 block w-full rounded-lg border-gray-300 py-2 px-3 text-base font-bold border focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={transferLoading || !selectedAccountId}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 text-sm"
                    >
                      {transferLoading ? 'Processing Transfer...' : 'Confirm Transfer'}
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

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading wallet...</div>}>
      <WalletContent />
    </Suspense>
  );
}
