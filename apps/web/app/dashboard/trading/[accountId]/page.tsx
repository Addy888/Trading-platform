'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { ProtectedRoute } from '@/components/protected-route';
import { tradingApi, type OpenPosition, type Trade } from '@/lib/trading-api';
import { tradingV2Api, type MarginInfo } from '@/lib/trading-v2-api';
import { tradingAccountsApi, type TradingAccount } from '@/lib/trading-accounts-api';
import { marketApi, OandaMarketDataError } from '@/lib/market-api';
import { MarketWatch } from '@/components/trading/market-watch';
import { OrderPanel } from '@/components/trading/order-panel';
import { CandlestickChart } from '@/components/trading/candlestick-chart';
import { PositionsTable } from '@/components/trading/positions-table';
import { TradesTable } from '@/components/trading/trades-table';
import { ChallengeProgress } from '@/components/trading/challenge-progress';
import { ExecutionModeIndicator } from '@/components/trading/execution-mode-indicator';
import { useOandaQuotes } from '@/hooks/useOandaQuotes';

type TabType = 'positions' | 'trades';
const DEFAULT_OANDA_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
const OANDA_WATCH_SYMBOLS = new Set(DEFAULT_OANDA_SYMBOLS);

export default function TradingTerminalPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { socket, connected: socketConnected, authenticated: socketAuthenticated } = useSocket();

  const accountId = params.accountId as string;
  const reconnectAttemptedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candleRequestRef = useRef(0);
  const candleRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candleRetryAttemptRef = useRef(0);
  const marketDataEnabledRef = useRef(false);

  // Core State
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { bid: string; ask: string; spread: string; price: string; timestamp: string }>>({});
  const [marginInfo, setMarginInfo] = useState<MarginInfo | null>(null);
  const [marginError, setMarginError] = useState<string | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<any>(null);
  
  // Execution mode state
  const [executionMode, setExecutionMode] = useState<'SIMULATED' | 'PAPER' | 'BROKER_SANDBOX' | 'LIVE'>('SIMULATED');
  
  // Chart State
  const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1H');
  const [candles, setCandles] = useState<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);
  const [chartError, setChartError] = useState<string | null>(null);
  
  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'STALE'>('DISCONNECTED');
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_OANDA_SYMBOLS);
  const [marketDataEnabled, setMarketDataEnabled] = useState(false);
  const [accountSpecificPricingAvailable, setAccountSpecificPricingAvailable] = useState(false);
  const [oandaSetupMessage, setOandaSetupMessage] = useState<string | null>(null);

  const stopMarketDataAfterTerminalError = (error: unknown) => {
    if (
      error instanceof OandaMarketDataError &&
      ['NOT_CONFIGURED', 'INVALID_CREDENTIALS', 'ACCOUNT_ACCESS', 'SESSION_EXPIRED'].includes(error.category || '')
    ) {
      marketDataEnabledRef.current = false;
      setMarketDataEnabled(false);
    }
  };

  const {
    quotes: oandaQuotes,
    loading: quotesLoading,
    error: quotesError,
    refresh: refreshOandaQuotes,
  } = useOandaQuotes(
    symbols,
    20000,
    accessToken || undefined,
    marketDataEnabled && accountSpecificPricingAvailable,
  );

  // Load initial data
  useEffect(() => {
    if (accessToken && accountId) {
      loadAllData();
    }
  }, [accessToken, accountId]);

  const loadOandaMarketData = async () => {
    if (!accessToken) return;
    marketDataEnabledRef.current = false;
    setMarketDataEnabled(false);
    try {
      const status = await marketApi.getOandaStatus(accessToken);
      const provider = status.providers.OANDA;
      setAccountSpecificPricingAvailable(status.configuration.accountSpecificPricingAvailable);
      const setupMessages: string[] = [];
      if (!status.configuration.configured) {
        const missing = status.configuration.missingVariables.length
          ? status.configuration.missingVariables.join(', ')
          : 'OANDA_API_TOKEN';
        setupMessages.push(
          `Missing ${missing} in apps/api/.env. Configure it for the selected OANDA ${status.configuration.environment} environment, then restart the backend.`,
        );
      } else if (provider.errorCategory === 'INVALID_CREDENTIALS') {
        setupMessages.push(
          `OANDA rejected OANDA_API_TOKEN for the ${status.configuration.environment} environment. Configure a valid token for this environment in apps/api/.env, then restart the backend.`,
        );
      }
      if (!status.configuration.accountIdConfigured) {
        setupMessages.push(
          'OANDA_ACCOUNT_ID is not configured. Historical candles do not require it; account-specific Bid/Ask quotes, position valuation, and new orders do. Use the actual OANDA account ID for this environment, not the application trading account ID.',
        );
      }
      setOandaSetupMessage(setupMessages.length ? setupMessages.join(' ') : null);
      const blockedCategories = ['NOT_CONFIGURED', 'INVALID_CREDENTIALS', 'ACCOUNT_ACCESS'];
      if (!status.configuration.configured || blockedCategories.includes(provider.errorCategory || '')) {
        setCandles([]);
        setChartError(
          provider.lastError ||
          'OANDA candle data is unavailable. Configure a valid OANDA_API_TOKEN in apps/api/.env for the selected environment, then restart the backend.',
        );
        return;
      }

      marketDataEnabledRef.current = true;
      setMarketDataEnabled(true);
      let availableSymbols = DEFAULT_OANDA_SYMBOLS;
      if (status.configuration.accountIdConfigured) {
        const instruments = await marketApi.getOandaInstruments(accessToken);
        availableSymbols = instruments
          .map((instrument) => instrument.replace('_', ''))
          .filter((symbol) => OANDA_WATCH_SYMBOLS.has(symbol));
      }
      if (!availableSymbols.length) {
        setSymbols([]);
        setCandles([]);
        setChartError('No supported OANDA instruments are available for this account.');
        return;
      }
      setSymbols(availableSymbols);
      const symbol = availableSymbols.includes(selectedSymbol) ? selectedSymbol : availableSymbols[0];
      if (symbol !== selectedSymbol) setSelectedSymbol(symbol);
      await loadCandles(symbol, selectedTimeframe);
    } catch (instrumentError) {
      stopMarketDataAfterTerminalError(instrumentError);
      if (instrumentError instanceof Error) setChartError(instrumentError.message);
      else setChartError('OANDA market data is temporarily unavailable. Please retry later.');
    }
  };

  useEffect(() => {
    setQuotes(oandaQuotes);
    if (Object.keys(oandaQuotes).length > 0) setMarketStatus('CONNECTED');
    else if (quotesError) setMarketStatus('DISCONNECTED');
  }, [oandaQuotes, quotesError]);

  const loadAllData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError(null);

      // Load account details first - this is separate from market data
      try {
        const accountData = await tradingAccountsApi.getUserAccount(accessToken, accountId);
        setAccount(accountData);
      } catch (accountErr: any) {
        // Account loading errors are authorization issues, not market data issues
        console.error('Failed to load account:', accountErr);
        if (accountErr.message?.includes('Access denied') || accountErr.message?.includes('Forbidden')) {
          setError('Access denied: This trading account belongs to another user.');
        } else if (accountErr.message?.includes('not found')) {
          setError('Trading account not found.');
        } else {
          setError(accountErr.message || 'Failed to load trading account');
        }
        setLoading(false);
        return; // Stop here if account can't be loaded
      }

      // Now load market data and trading data (can fail independently)
      try {
        // Load positions
        const positionsData = await tradingApi.getOpenPositions(accessToken, accountId);
        setPositions(positionsData);

        // Load trades
        const tradesData = await tradingApi.getTradeHistory(accessToken, accountId, { limit: 50 });
        setTrades(tradesData.trades);

        // Margin depends on fresh market quotes; its failure must not block unrelated account data.
        try {
          const marginData = await tradingV2Api.getMarginInfo(accessToken, accountId);
          setMarginInfo(marginData);
          setMarginError(null);
        } catch (marginErr) {
          setMarginInfo(null);
          setMarginError(marginErr instanceof Error ? marginErr.message : 'Margin is unavailable until fresh OANDA quotes arrive.');
        }

        // Load challenge progress even when margin cannot be valued.
        const progressData = await tradingApi.getChallengeProgress(accessToken, accountId);
        setChallengeProgress(progressData);

      } catch (marketDataErr: any) {
        console.error('Trading data loading error (non-fatal):', marketDataErr);
      }

      await loadOandaMarketData();

    } catch (err: any) {
      // Only general errors that weren't caught above
      console.error('Failed to load trading data:', err);
      if (!account) {
        setError(err.message || 'Failed to load trading data');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCandles = async (symbol: string, timeframe: string) => {
    if (!accessToken || !marketDataEnabledRef.current) return;
    if (candleRetryTimerRef.current) clearTimeout(candleRetryTimerRef.current);
    const requestId = ++candleRequestRef.current;
    setCandles([]);
    setChartError(null);
    const intervalMap: Record<string, string> = { '1m': '1m', '5m': '5m', '10m': '10m', '15m': '15m', '30m': '30m', '1H': '1h', '4H': '4h', '1D': '1d' };
    try {
      const result = await marketApi.getOandaCandles(accessToken, symbol, intervalMap[timeframe] || '1h', 100);
      if (!result.success || !result.candles.length) throw new Error(result.error || 'OANDA returned no candles.');
      if (requestId !== candleRequestRef.current) return;
      candleRetryAttemptRef.current = 0;
      setCandles(result.candles.map((c) => ({ time: Math.floor(new Date(c.timestamp).getTime() / 1000), open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) })));
      setMarketStatus('CONNECTED');
      setChartError(null);
    } catch (err: any) {
      if (requestId !== candleRequestRef.current) return;
      stopMarketDataAfterTerminalError(err);
      setCandles([]);
      setChartError(err.message || 'OANDA market data is temporarily unavailable. Please retry later.');
      if (
        err instanceof OandaMarketDataError &&
        err.retryable &&
        candleRetryAttemptRef.current < 3
      ) {
        const attempt = ++candleRetryAttemptRef.current;
        const exponentialDelay = Math.min(2000 * (2 ** (attempt - 1)), 30000);
        const retryAfter = Math.min(err.retryAfterMs || 0, 120000);
        candleRetryTimerRef.current = setTimeout(
          () => void loadCandles(symbol, timeframe),
          Math.max(exponentialDelay, retryAfter),
        );
      }
    }
  };

  useEffect(() => () => {
    if (candleRetryTimerRef.current) clearTimeout(candleRetryTimerRef.current);
    candleRequestRef.current++;
  }, []);
  // WebSocket subscription
  useEffect(() => {
    if (socket && socketConnected && socketAuthenticated && accountId) {
      // Subscribe to account updates
      socket.emit('subscribe:account', { accountId });

      // Listen for position updates
      socket.on('position:update', () => {
        refreshPositions();
      });

      // Listen for trade events
      socket.on('trade:opened', () => {
        refreshPositions();
        refreshTrades();
        refreshMarginInfo();
      });

      socket.on('trade:closed', () => {
        refreshPositions();
        refreshTrades();
        refreshAccount();
        refreshMarginInfo();
        refreshChallengeProgress();
      });

      // Listen for account updates
      socket.on('account:update', (data: any) => {
        setAccount((prev) => prev ? { ...prev, currentBalance: data.currentBalance, equity: data.equity } : prev);
      });

      // Listen for challenge updates
      socket.on('challenge:update', () => {
        refreshChallengeProgress();
      });

      return () => {
        socket.emit('unsubscribe:account', { accountId });
        socket.off('position:update');
        socket.off('trade:opened');
        socket.off('trade:closed');
        socket.off('account:update');
        socket.off('challenge:update');
      };
    }
  }, [socket, socketConnected, socketAuthenticated, accountId]);

  // Handle reconnection
  useEffect(() => {
    if (socket && socketConnected && accountId && !reconnectAttemptedRef.current) {
      reconnectAttemptedRef.current = true;
      // Refetch data after reconnection
      reconnectTimerRef.current = setTimeout(() => {
        refreshPositions();
        refreshAccount();
        loadCandles(selectedSymbol, selectedTimeframe);
      }, 1000);
    }
    if (!socketConnected) {
      reconnectAttemptedRef.current = false;
    }
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [socketConnected, accountId, socket]);

  const refreshPositions = async () => {
    if (!accessToken) return;
    try {
      const positionsData = await tradingApi.getOpenPositions(accessToken, accountId);
      setPositions(positionsData);
    } catch (err) {
      console.error('Failed to refresh positions:', err);
    }
  };

  const refreshTrades = async () => {
    if (!accessToken) return;
    try {
      const tradesData = await tradingApi.getTradeHistory(accessToken, accountId, { limit: 50 });
      setTrades(tradesData.trades);
    } catch (err) {
      console.error('Failed to refresh trades:', err);
    }
  };

  const refreshAccount = async () => {
    if (!accessToken) return;
    try {
      const accountData = await tradingAccountsApi.getUserAccount(accessToken, accountId);
      setAccount(accountData);
    } catch (err) {
      console.error('Failed to refresh account:', err);
    }
  };

  const refreshMarginInfo = async () => {
    if (!accessToken) return;
    try {
      const marginData = await tradingV2Api.getMarginInfo(accessToken, accountId);
      setMarginInfo(marginData);
      setMarginError(null);
    } catch (err) {
      setMarginInfo(null);
      setMarginError(err instanceof Error ? err.message : 'Margin is unavailable until fresh OANDA quotes arrive.');
    }
  };

  const refreshChallengeProgress = async () => {
    if (!accessToken) return;
    try {
      const progressData = await tradingApi.getChallengeProgress(accessToken, accountId);
      setChallengeProgress(progressData);
    } catch (err) {
      console.error('Failed to refresh challenge progress:', err);
    }
  };

  const handleTrade = async (trade: {
    side: 'BUY' | 'SELL';
    volume: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => {
    if (!accessToken) return;

    try {
      await tradingV2Api.openTrade(accessToken, accountId, {
        symbol: selectedSymbol,
        ...trade,
      });
      // Positions and trades will be updated via WebSocket
      // But also refresh immediately
      setTimeout(() => {
        refreshPositions();
        refreshTrades();
        refreshAccount();
        refreshMarginInfo();
        refreshChallengeProgress();
      }, 500);
    } catch (err: any) {
      throw new Error(err.message || 'Failed to open trade');
    }
  };

  const handleClosePosition = async (positionId: string) => {
    if (!accessToken) return;

    if (!confirm('Are you sure you want to close this position?')) {
      return;
    }

    try {
      await tradingV2Api.closeTrade(accessToken, accountId, positionId);
      // Updates will come via WebSocket
      setTimeout(() => {
        refreshPositions();
        refreshTrades();
        refreshAccount();
        refreshMarginInfo();
        refreshChallengeProgress();
      }, 500);
    } catch (err: any) {
      alert(`Failed to close position: ${err.message}`);
    }
  };

  const handleModifyPosition = async (positionId: string, sl?: number, tp?: number) => {
    if (!accessToken) return;

    try {
      await tradingV2Api.updatePosition(accessToken, accountId, positionId, {
        stopLoss: sl,
        takeProfit: tp,
      });
      await refreshPositions();
    } catch (err: any) {
      alert(`Failed to modify position: ${err.message}`);
    }
  };

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
  };

  useEffect(() => {
    if (selectedSymbol && selectedTimeframe && accessToken) {
      loadCandles(selectedSymbol, selectedTimeframe);
    }
  }, [selectedSymbol, selectedTimeframe, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <ProtectedRoute requireRole="USER">
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="text-white text-lg">Loading trading terminal...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !account) {
    return (
      <ProtectedRoute requireRole="USER">
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-6 max-w-md text-center">
            <h2 className="text-red-300 text-xl font-bold mb-4">Access Denied</h2>
            <p className="text-red-300 mb-4">
              {error || 'Account not found or you do not have permission to access this account.'}
            </p>
            <p className="text-red-200 text-sm mb-6">
              Each trading account can only be accessed by its owner. Please select your own account from the list.
            </p>
            <button
              onClick={() => router.push('/dashboard/trading')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Back to Account Selection
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const canTrade = account.status === 'ACTIVE';
  const disabledReason = account.status === 'BREACHED'
    ? 'Account has been breached and cannot trade'
    : account.status === 'PASSED'
    ? 'Challenge passed - Contact support for next steps'
    : account.status === 'SUSPENDED'
    ? 'Account suspended by administrator'
    : 'Trading not available';

  const selectedQuote = quotes[selectedSymbol];
  const quoteTimestamp = selectedQuote ? Date.parse(selectedQuote.timestamp) : Number.NaN;
  const selectedQuoteIsFresh = Boolean(
    selectedQuote &&
    Number.isFinite(quoteTimestamp) &&
    Date.now() - quoteTimestamp >= 0 &&
    Date.now() - quoteTimestamp <= 45000 &&
    Number.isFinite(Number(selectedQuote.bid)) &&
    Number.isFinite(Number(selectedQuote.ask)) &&
    Number(selectedQuote.bid) > 0 &&
    Number(selectedQuote.ask) >= Number(selectedQuote.bid),
  );
  const marketDataAvailable = selectedQuoteIsFresh;
  const orderDisabledReason = canTrade
    ? marketDataAvailable
      ? undefined
      : accountSpecificPricingAvailable
        ? 'A fresh OANDA bid/ask quote is required before placing an order. Wait for a valid quote; stale quotes cannot be used.'
        : oandaSetupMessage || 'OANDA_ACCOUNT_ID is required for account-specific bid/ask pricing, position valuation, and new orders. Historical candles remain available without it.'
    : disabledReason;

  return (
    <ProtectedRoute requireRole="USER">
      <div className="h-screen flex flex-col bg-gray-950 text-white">
        {/* Top Bar */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xs text-gray-400">Account</div>
                <div className="font-semibold">{account.accountNumber}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Balance</div>
                <div className="font-semibold">${parseFloat(account.currentBalance).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Equity</div>
                <div className="font-semibold">${parseFloat(account.equity).toFixed(2)}</div>
              </div>
              <div title={marginError || undefined}>
                <div className="text-xs text-gray-400">Free Margin</div>
                <div className={`font-semibold ${marginInfo ? 'text-green-400' : 'text-amber-300'}`}>
                  {marginInfo ? `$${parseFloat(marginInfo.freeMargin).toFixed(2)}` : 'Unavailable'}
                </div>
              </div>
              <div title={marginError || undefined}>
                <div className="text-xs text-gray-400">Used Margin</div>
                <div className={`font-semibold ${marginInfo ? 'text-yellow-400' : 'text-amber-300'}`}>
                  {marginInfo ? `$${parseFloat(marginInfo.usedMargin).toFixed(2)}` : 'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Status</div>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    account.status === 'ACTIVE'
                      ? 'bg-green-600'
                      : account.status === 'PASSED'
                      ? 'bg-blue-600'
                      : 'bg-red-600'
                  }`}
                >
                  {account.status}
                </span>
              </div>
              <div>
                <div className="text-xs text-gray-400">Mode</div>
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider font-mono">
                  {account.executionMode || 'SIMULATED'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${marketStatus === 'CONNECTED' ? 'bg-green-500' : marketStatus === 'STALE' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-400">Market: {marketStatus}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-400">{socketConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <button
                onClick={() => router.push('/dashboard/trading')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Switch Account
              </button>
            </div>
          </div>
        </div>

        {marginError && (
          <div className="border-b border-amber-800 bg-amber-950/40 px-4 py-2 text-sm text-amber-200" role="status">
            Margin and unrealized P&amp;L valuation are unavailable until fresh OANDA bid/ask quotes are available. {marginError}
          </div>
        )}

        {/* Main Trading Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Market Watch */}
          <div className="w-64 border-r border-gray-800 overflow-y-auto">
            <MarketWatch
              symbols={symbols}
              quotes={quotes}
              selectedSymbol={selectedSymbol}
              onSymbolSelect={handleSymbolChange}
              loading={quotesLoading}
              dataSource={Object.keys(quotes).length > 0 ? 'OANDA' : undefined}
              unavailableMessage={quotesError || oandaSetupMessage}
            />
          </div>

          {/* Center: Chart + Positions */}
          <div className="flex-1 flex flex-col">
            {/* Timeframe Selector */}
            <div className="bg-gray-900 border-b border-gray-800 p-2 flex gap-2 items-center">
              {['1m', '5m', '10m', '15m', '30m', '1H', '4H', '1D'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    selectedTimeframe === tf
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tf}
                </button>
              ))}
              {(chartError || quotesError) && (
                <div className="ml-auto flex items-center gap-2 min-w-0">
                  <span className="text-xs text-red-400 truncate" title={chartError || quotesError || undefined}>
                    ⚠️ {chartError || quotesError}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void loadOandaMarketData();
                      if (marketDataEnabledRef.current) refreshOandaQuotes();
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Chart */}
            <div className="flex-1 bg-gray-950 p-4 overflow-hidden relative">
              <CandlestickChart
                data={candles}
                symbol={selectedSymbol}
                timeframe={selectedTimeframe}
                dataSource={candles.length > 0 ? 'OANDA' : undefined}
                error={chartError}
                onRetry={() => void loadOandaMarketData()}
              />
            </div>

            {/* Bottom Tabs */}
            <div className="bg-gray-900 border-t border-gray-800">
              <div className="flex border-b border-gray-800">
                <button
                  onClick={() => setActiveTab('positions')}
                  className={`px-6 py-3 text-sm font-semibold ${
                    activeTab === 'positions'
                      ? 'text-white border-b-2 border-blue-600'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Open Positions ({positions.length})
                </button>
                <button
                  onClick={() => setActiveTab('trades')}
                  className={`px-6 py-3 text-sm font-semibold ${
                    activeTab === 'trades'
                      ? 'text-white border-b-2 border-blue-600'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Trade History
                </button>
              </div>

              <div className="p-4 max-h-64 overflow-y-auto">
                {activeTab === 'positions' ? (
                  <PositionsTable
                    positions={positions}
                    onClose={handleClosePosition}
                    onModify={handleModifyPosition}
                  />
                ) : (
                  <TradesTable trades={trades} />
                )}
              </div>
            </div>
          </div>

          {/* Right: Order Panel + Challenge Progress */}
          <div className="w-80 border-l border-gray-800 overflow-y-auto">
            {/* Execution Mode Indicator */}
            <div className="p-4 border-b border-gray-800">
            <ExecutionModeIndicator mode={executionMode} />
              
              {Object.keys(quotes).length > 0 && <div className="mt-3 text-xs text-green-400">Market data source: OANDA</div>}
              {oandaSetupMessage && <div className="mt-2 text-xs text-amber-300">{oandaSetupMessage}</div>}
              {quotesError && <div className="mt-2 text-xs text-red-300">{quotesError}</div>}
            </div>
                        <OrderPanel
              symbol={selectedSymbol}
              bid={selectedQuote?.bid || ''}
              ask={selectedQuote?.ask || ''}
              spread={selectedQuote?.spread || ''}
              balance={account.currentBalance}
              equity={account.equity}
              freeMargin={marginInfo?.freeMargin}
              usedMargin={marginInfo?.usedMargin}
              onTrade={handleTrade}
              disabled={!canTrade || !marketDataAvailable}
              disabledReason={orderDisabledReason}
            />
            
            {challengeProgress && (
              <div className="border-t border-gray-800">
                <ChallengeProgress progress={challengeProgress} />
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
