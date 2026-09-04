'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { tradingApi, type TradingAccount, type OpenPosition } from '@/lib/trading-api';
import { useSocket } from '@/lib/socket-context';

interface MarketPrice {
  symbol: string;
  price: string;
  timestamp: Date;
  source: string;
}

export default function TradingTerminalPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { socket, connected } = useSocket();
  
  // Accounts
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  
  // Market Data
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrice>>({});
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  
  // Order Form
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderVolume, setOrderVolume] = useState<string>('1');
  const [orderProcessing, setOrderProcessing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  
  // Positions
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  
  // Performance
  const [performance, setPerformance] = useState<any>(null);
  
  const symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];

  // Load accounts on mount
  useEffect(() => {
    if (accessToken) {
      loadAccounts();
    }
  }, [accessToken]);

  // Subscribe to account when selected
  useEffect(() => {
    if (selectedAccount && socket && connected) {
      socket.emit('subscribe:account', { accountId: selectedAccount });
      loadPositions(selectedAccount);
      loadPerformance(selectedAccount);
      
      return () => {
        socket.emit('unsubscribe:account', { accountId: selectedAccount });
      };
    }
  }, [selectedAccount, socket, connected]);

  // Listen to market prices
  useEffect(() => {
    if (!socket || !connected) return;

    const handleMarketPrice = (data: any) => {
      if (data.prices) {
        const pricesMap: Record<string, MarketPrice> = {};
        data.prices.forEach((p: any) => {
          pricesMap[p.symbol] = {
            symbol: p.symbol,
            price: p.price,
            timestamp: new Date(data.timestamp),
            source: data.source,
          };
        });
        setMarketPrices((prev) => ({ ...prev, ...pricesMap }));
      }
    };

    const handleTradeOpened = () => {
      if (selectedAccount) {
        loadPositions(selectedAccount);
        loadPerformance(selectedAccount);
      }
    };

    const handleTradeClosed = () => {
      if (selectedAccount) {
        loadPositions(selectedAccount);
        loadPerformance(selectedAccount);
      }
    };

    const handleAccountUpdate = () => {
      if (selectedAccount) {
        loadPerformance(selectedAccount);
      }
    };

    socket.on('market:price', handleMarketPrice);
    socket.on('trade:opened', handleTradeOpened);
    socket.on('trade:closed', handleTradeClosed);
    socket.on('account:update', handleAccountUpdate);

    return () => {
      socket.off('market:price', handleMarketPrice);
      socket.off('trade:opened', handleTradeOpened);
      socket.off('trade:closed', handleTradeClosed);
      socket.off('account:update', handleAccountUpdate);
    };
  }, [socket, connected, selectedAccount]);

  const loadAccounts = async () => {
    if (!accessToken) return;
    try {
      setAccountLoading(true);
      const data = await tradingApi.getTradingAccounts(accessToken);
      setAccounts(data);
      
      // Auto-select first active account
      const activeAccount = data.find((a) => a.status === 'ACTIVE');
      if (activeAccount) {
        setSelectedAccount(activeAccount.id);
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setAccountLoading(false);
    }
  };

  const loadPositions = async (accountId: string) => {
    if (!accessToken) return;
    try {
      setPositionsLoading(true);
      const data = await tradingApi.getOpenPositions(accessToken, accountId);
      setPositions(data);
    } catch (err) {
      console.error('Failed to load positions:', err);
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  };

  const loadPerformance = async (accountId: string) => {
    if (!accessToken) return;
    try {
      const data = await tradingApi.getAccountPerformance(accessToken, accountId);
      setPerformance(data);
    } catch (err) {
      console.error('Failed to load performance:', err);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAccount || !accessToken) return;

    const volume = parseFloat(orderVolume);
    if (isNaN(volume) || volume <= 0) {
      setOrderError('Please enter a valid volume');
      return;
    }

    try {
      setOrderProcessing(true);
      setOrderError(null);

      await tradingApi.openTrade(accessToken, selectedAccount, {
        symbol: selectedSymbol,
        side: orderSide,
        volume: volume,
      });

      // Reset form
      setOrderVolume('1');
      
      // Reload data
      await Promise.all([
        loadPositions(selectedAccount),
        loadPerformance(selectedAccount),
      ]);
    } catch (err: any) {
      console.error('Failed to place order:', err);
      setOrderError(err.message || 'Failed to place order');
    } finally {
      setOrderProcessing(false);
    }
  };

  const handleClosePosition = async (positionId: string) => {
    if (!selectedAccount || !accessToken) return;
    
    if (!confirm('Are you sure you want to close this position?')) {
      return;
    }

    try {
      setClosingPosition(positionId);
      await tradingApi.closeTrade(accessToken, selectedAccount, positionId);
      
      // Reload data
      await Promise.all([
        loadPositions(selectedAccount),
        loadPerformance(selectedAccount),
      ]);
    } catch (err: any) {
      console.error('Failed to close position:', err);
      alert(err.message || 'Failed to close position');
    } finally {
      setClosingPosition(null);
    }
  };

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

  const selectedAccountData = accounts.find((a) => a.id === selectedAccount);
  const canTrade = selectedAccountData?.status === 'ACTIVE';
  const currentPrice = marketPrices[selectedSymbol]?.price || '0';

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Trading Terminal</h1>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs font-medium">
                    ⚠ SIMULATED MARKET
                  </span>
                  <span className="ml-2">This is a demo trading environment with simulated prices</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded text-sm ${
                    connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  {connected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
            </div>
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
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountNumber} - {account.challengePlan.name} -{' '}
                    {formatCurrency(account.currentBalance)} - {account.status}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedAccount && selectedAccountData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left Column: Market Watch + Order Panel */}
              <div className="lg:col-span-1 space-y-4">
                {/* Market Watch */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Market Watch</h3>
                  <div className="space-y-2">
                    {symbols.map((symbol) => {
                      const price = marketPrices[symbol]?.price || '-.-----';
                      const isSelected = symbol === selectedSymbol;
                      return (
                        <button
                          key={symbol}
                          onClick={() => setSelectedSymbol(symbol)}
                          className={`w-full text-left p-3 rounded border transition ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-900">{symbol}</span>
                            <span className="text-lg font-mono">{formatPrice(price)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Order Panel */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Place Order</h3>
                  
                  {!canTrade && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      Trading disabled. Account status: {selectedAccountData.status}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Symbol
                      </label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded text-gray-900 font-mono">
                        {selectedSymbol}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Price
                      </label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded text-gray-900 font-mono text-lg">
                        {formatPrice(currentPrice)}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Volume (Lots)
                      </label>
                      <input
                        type="number"
                        value={orderVolume}
                        onChange={(e) => setOrderVolume(e.target.value)}
                        min="0.01"
                        step="0.01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={!canTrade || orderProcessing}
                      />
                    </div>

                    {orderError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                        {orderError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setOrderSide('BUY');
                          handlePlaceOrder();
                        }}
                        disabled={!canTrade || orderProcessing}
                        className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      >
                        {orderProcessing && orderSide === 'BUY' ? 'Processing...' : 'BUY'}
                      </button>
                      <button
                        onClick={() => {
                          setOrderSide('SELL');
                          handlePlaceOrder();
                        }}
                        disabled={!canTrade || orderProcessing}
                        className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      >
                        {orderProcessing && orderSide === 'SELL' ? 'Processing...' : 'SELL'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Account Summary + Positions */}
              <div className="lg:col-span-2 space-y-4">
                {/* Account Summary */}
                {performance && (
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">Account Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Balance</p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(performance.currentBalance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Equity</p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(performance.equity)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Unrealized PnL</p>
                        <p
                          className={`text-lg font-bold ${
                            parseFloat(performance.totalUnrealizedPnl) >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(performance.totalUnrealizedPnl)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Total PnL</p>
                        <p
                          className={`text-lg font-bold ${
                            parseFloat(performance.totalPnl) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(performance.totalPnl)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Status:</span>{' '}
                        <span
                          className={`font-semibold ${
                            performance.accountStatus === 'ACTIVE'
                              ? 'text-green-600'
                              : performance.accountStatus === 'PASSED'
                              ? 'text-blue-600'
                              : 'text-red-600'
                          }`}
                        >
                          {performance.accountStatus}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Open Trades:</span>{' '}
                        <span className="font-semibold">{performance.openTrades}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Return:</span>{' '}
                        <span
                          className={`font-semibold ${
                            parseFloat(performance.returnPercentage) >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {performance.returnPercentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Open Positions */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Open Positions</h3>
                  {positionsLoading ? (
                    <div className="text-center py-8 text-gray-600">Loading positions...</div>
                  ) : positions.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">No open positions</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Symbol
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Side
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Volume
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Entry
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Current
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              PnL
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {positions.map((position) => (
                            <tr key={position.id}>
                              <td className="px-3 py-2 text-sm font-semibold text-gray-900">
                                {position.symbol}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    position.side === 'BUY'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {position.side}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-900">{position.volume}</td>
                              <td className="px-3 py-2 text-sm font-mono text-gray-900">
                                {formatPrice(position.entryPrice)}
                              </td>
                              <td className="px-3 py-2 text-sm font-mono text-gray-900">
                                {formatPrice(position.currentPrice)}
                              </td>
                              <td
                                className={`px-3 py-2 text-sm font-semibold ${
                                  parseFloat(position.unrealizedPnl) >= 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {formatCurrency(position.unrealizedPnl)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => handleClosePosition(position.id)}
                                  disabled={closingPosition === position.id}
                                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {closingPosition === position.id ? 'Closing...' : 'Close'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
