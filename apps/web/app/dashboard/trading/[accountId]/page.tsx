'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { ProtectedRoute } from '@/components/protected-route';
import { tradingApi, type OpenPosition, type Trade } from '@/lib/trading-api';
import { tradingV2Api, type MarketQuote, type MarginInfo } from '@/lib/trading-v2-api';
import { tradingAccountsApi, type TradingAccount } from '@/lib/trading-accounts-api';
import { marketApi } from '@/lib/market-api';
import { MarketWatch } from '@/components/trading/market-watch';
import { OrderPanel } from '@/components/trading/order-panel';
import { CandlestickChart } from '@/components/trading/candlestick-chart';
import { PositionsTable } from '@/components/trading/positions-table';
import { TradesTable } from '@/components/trading/trades-table';
import { ChallengeProgress } from '@/components/trading/challenge-progress';
import { ExecutionModeIndicator } from '@/components/trading/execution-mode-indicator';
import { useTwelveDataQuotes } from '@/hooks/useTwelveDataQuotes';
import { quotaManager } from '@/lib/quota-manager';

type TabType = 'positions' | 'trades';

export default function TradingTerminalPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { socket, connected: socketConnected } = useSocket();

  const accountId = params.accountId as string;
  const reconnectAttemptedRef = useRef(false);

  // Core State
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { bid: string; ask: string; spread: string }>>({});
  const [marginInfo, setMarginInfo] = useState<MarginInfo | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<any>(null);
  
  // Execution mode state
  const [executionMode, setExecutionMode] = useState<'SIMULATED' | 'PAPER' | 'BROKER_SANDBOX' | 'LIVE'>('SIMULATED');
  const [useTwelveData, setUseTwelveData] = useState(true);
  
  // Chart State
  const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1H');
  const [candles, setCandles] = useState<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'STALE'>('DISCONNECTED');
  const [symbols, setSymbols] = useState<string[]>([]);

  // Twelve Data integration
  // Only fetch quotes for major FX pairs to respect rate limits and provider support
  // Twelve Data free tier has limited symbol support - focus on major pairs
  const twelveDataSymbols = useTwelveData && symbols.length > 0 
    ? symbols.filter(s => ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'].includes(s))
    : ['EURUSD', 'GBPUSD', 'USDJPY'];
    
  const {
    quotes: twelveDataQuotes,
    loading: quotesLoading,
    error: quotesError,
    providerStatus,
    quotaExhausted,
  } = useTwelveDataQuotes(
    twelveDataSymbols,
    20000, // 20 seconds polling interval
    useTwelveData && !!accessToken
  );

  // Load initial data
  useEffect(() => {
    if (accessToken && accountId) {
      loadAllData();
    }
  }, [accessToken, accountId]);

  // Sync Twelve Data quotes to local state
  useEffect(() => {
    if (useTwelveData && Object.keys(twelveDataQuotes).length > 0) {
      const convertedQuotes: Record<string, { bid: string; ask: string; spread: string }> = {};
      
      Object.entries(twelveDataQuotes).forEach(([symbol, quoteData]) => {
        // Extract bid/ask from close price (simulate spread)
        const closePrice = parseFloat(quoteData.close || quoteData.price || '0');
        if (closePrice > 0) {
          const spread = closePrice * 0.0001; // 1 pip spread estimate
          convertedQuotes[symbol] = {
            bid: (closePrice - spread / 2).toFixed(5),
            ask: (closePrice + spread / 2).toFixed(5),
            spread: spread.toFixed(5),
          };
        }
      });
      
      setQuotes(convertedQuotes);
      
      // Update market status based on quota/provider status
      if (quotaExhausted) {
        setMarketStatus('DISCONNECTED');
      } else if (Object.keys(convertedQuotes).length > 0) {
        setMarketStatus('CONNECTED');
      } else if (quotesError) {
        setMarketStatus('DISCONNECTED');
      }
    }
  }, [twelveDataQuotes, useTwelveData]);

  const loadAllData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError(null);

      // Load account details
      const accountData = await tradingAccountsApi.getUserAccount(accessToken, accountId);
      setAccount(accountData);

      // Load positions
      const positionsData = await tradingApi.getOpenPositions(accessToken, accountId);
      setPositions(positionsData);

      // Load trades
      const tradesData = await tradingApi.getTradeHistory(accessToken, accountId, { limit: 50 });
      setTrades(tradesData.trades);

      // Load instruments and quotes
      const instrumentsData = await tradingV2Api.getInstruments(accessToken, accountId);
      const symbolsList = instrumentsData.instruments.map(i => i.symbol);
      setSymbols(symbolsList);

      // Load quotes
      const quotesData = await tradingV2Api.getMarketQuotes(accessToken, accountId);
      const quotesMap: Record<string, { bid: string; ask: string; spread: string }> = {};
      quotesData.quotes.forEach((q: MarketQuote) => {
        quotesMap[q.symbol] = { bid: q.bid, ask: q.ask, spread: q.spread };
      });
      setQuotes(quotesMap);
      setMarketStatus(quotesData.status as any);

      // Load margin info
      const marginData = await tradingV2Api.getMarginInfo(accessToken, accountId);
      setMarginInfo(marginData);

      // Load challenge progress
      const progressData = await tradingApi.getChallengeProgress(accessToken, accountId);
      setChallengeProgress(progressData);

      // Load candles for selected symbol
      await loadCandles(selectedSymbol, selectedTimeframe);

    } catch (err: any) {
      console.error('Failed to load trading data:', err);
      setError(err.message || 'Failed to load trading data');
    } finally {
      setLoading(false);
    }
  };

  const loadCandles = async (symbol: string, timeframe: string) => {
    if (!accessToken) return;

    try {
      if (useTwelveData) {
        // Check quota state first
        if (quotaManager.isQuotaExhausted()) {
          console.warn('[loadCandles] Quota exhausted, showing empty state');
          setCandles([]);
          setError('Market data quota exhausted. Please wait for quota reset or switch to Simulated mode.');
          return;
        }

        // Use Twelve Data candles - map timeframes to Twelve Data intervals
        const intervalMap: Record<string, string> = {
          '1m': '1min',
          '5m': '5min',
          '10m': '10min',
          '15m': '15min',
          '30m': '30min',
          '1H': '1h',
          '4H': '4h',
          '1D': '1day',
        };
        
        const interval = intervalMap[timeframe] || '1h';
        
        // Convert symbol format: EURUSD -> EUR/USD for Twelve Data
        const twelveDataSymbol = symbol.includes('/') ? symbol : 
          symbol.length === 6 ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol;
        
        console.log(`[loadCandles] Fetching ${interval} candles for ${twelveDataSymbol}`);
        
        try {
          const candleData = await marketApi.getTwelveDataCandles(
            accessToken, 
            twelveDataSymbol, 
            interval, 
            100,
            'LIVE'
          );
          
          if (candleData.success && candleData.candles && candleData.candles.length > 0) {
            const formattedCandles = candleData.candles.map((c: any) => ({
              time: Math.floor(new Date(c.timestamp).getTime() / 1000),
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
            }));
            setCandles(formattedCandles);
            setError(null);
            console.log(`[loadCandles] ✅ Loaded ${formattedCandles.length} LIVE ${interval} candles for ${twelveDataSymbol} from TWELVE_DATA`);
          } else if (candleData.error) {
            // Check for quota exhaustion
            if (candleData.error.includes('quota') || 
                candleData.error.includes('Circuit breaker') ||
                candleData.error.includes('run out of API credits')) {
              console.error('[loadCandles] Quota exhausted:', candleData.error);
              setError(`Market data unavailable: ${candleData.error}`);
              quotaManager.setExhausted('Twelve Data', null, candleData.error);
            } else {
              console.warn(`[loadCandles] Error: ${candleData.error}`);
              setError(`Failed to load chart data: ${candleData.error}`);
            }
            setCandles([]);
          } else {
            console.warn(`[loadCandles] No candle data available for ${twelveDataSymbol}`);
            setError(`No chart data available for ${symbol}`);
            setCandles([]);
          }
        } catch (err: any) {
          console.error('[loadCandles] Failed to load Twelve Data candles:', err);
          setError(`Failed to fetch chart data: ${err.message}`);
          setCandles([]);
        }
      } else {
        // Use simulated candles
        setError(null);
        await loadSimulatedCandles(symbol, timeframe);
      }
    } catch (err: any) {
      console.error('[loadCandles] Error:', err);
      setError(`Chart error: ${err.message}`);
      setCandles([]);
    }
  };

  const loadSimulatedCandles = async (symbol: string, timeframe: string) => {
    if (!accessToken) return;
    
    try {
      const candleData = await marketApi.getCandles(accessToken, symbol, timeframe, 100);
      const formattedCandles = candleData.candles.map((c: any) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      setCandles(formattedCandles);
    } catch (err) {
      console.error('Failed to load simulated candles:', err);
    }
  };

  // WebSocket subscription
  useEffect(() => {
    if (socket && socketConnected && accountId) {
      // Subscribe to account updates
      socket.emit('subscribe:account', { accountId });

      // Listen for market price updates
      socket.on('market:price', (data: any) => {
        if (data.prices) {
          setQuotes((prev) => {
            const updated = { ...prev };
            data.prices.forEach((p: any) => {
              // Assuming market:price event has bid/ask or we calculate from price
              const price = parseFloat(p.price);
              const spread = 0.0001; // Default spread
              updated[p.symbol] = {
                bid: (price - spread / 2).toFixed(5),
                ask: (price + spread / 2).toFixed(5),
                spread: spread.toFixed(5),
              };
            });
            return updated;
          });
        }
      });

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
        socket.off('market:price');
        socket.off('position:update');
        socket.off('trade:opened');
        socket.off('trade:closed');
        socket.off('account:update');
        socket.off('challenge:update');
      };
    }
  }, [socket, socketConnected, accountId]);

  // Handle reconnection
  useEffect(() => {
    if (socket && socketConnected && accountId && !reconnectAttemptedRef.current) {
      reconnectAttemptedRef.current = true;
      // Refetch data after reconnection
      setTimeout(() => {
        refreshPositions();
        refreshAccount();
        loadCandles(selectedSymbol, selectedTimeframe);
      }, 1000);
    }
    if (!socketConnected) {
      reconnectAttemptedRef.current = false;
    }
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
    } catch (err) {
      console.error('Failed to refresh margin:', err);
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
    loadCandles(symbol, selectedTimeframe);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
    loadCandles(selectedSymbol, timeframe);
  };

  // Reload candles when data source changes
  useEffect(() => {
    if (selectedSymbol && selectedTimeframe && accessToken) {
      loadCandles(selectedSymbol, selectedTimeframe);
    }
  }, [useTwelveData]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const selectedQuote = quotes[selectedSymbol] || { bid: '0', ask: '0', spread: '0' };

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
              {marginInfo && (
                <>
                  <div>
                    <div className="text-xs text-gray-400">Free Margin</div>
                    <div className="font-semibold text-green-400">${parseFloat(marginInfo.freeMargin).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Used Margin</div>
                    <div className="font-semibold text-yellow-400">${parseFloat(marginInfo.usedMargin).toFixed(2)}</div>
                  </div>
                </>
              )}
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
              dataSource={useTwelveData ? 'TWELVEDATA' : 'SIMULATED'}
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
                  disabled={!useTwelveData && !['1H', '4H', '1D'].includes(tf)}
                  title={!useTwelveData && !['1H', '4H', '1D'].includes(tf) ? 'Only available with LIVE data' : ''}
                >
                  {tf}
                </button>
              ))}
              {error && (
                <div className="ml-auto text-xs text-red-400 max-w-md truncate" title={error}>
                  ⚠️ {error}
                </div>
              )}
            </div>

            {/* Chart */}
            <div className="flex-1 bg-gray-950 p-4 overflow-hidden relative">
              {quotaExhausted && (
                <div className="absolute top-4 right-4 z-10 bg-red-900 bg-opacity-90 border border-red-700 rounded px-3 py-2 max-w-sm">
                  <div className="text-red-200 text-sm font-semibold mb-1">Market Data Quota Exhausted</div>
                  <div className="text-red-300 text-xs">
                    {quotaManager.getStatusMessage() || 'Daily API limit reached. Switch to Simulated mode or wait for quota reset.'}
                  </div>
                </div>
              )}
              <CandlestickChart
                data={candles}
                symbol={selectedSymbol}
                timeframe={selectedTimeframe}
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
              
              {/* Data Source Toggle */}
              <div className="mt-3 bg-gray-800 rounded p-3">
                <div className="text-xs text-gray-400 mb-2 font-semibold">Market Data Source</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUseTwelveData(true)}
                    className={`flex-1 px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      useTwelveData
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🌐 LIVE
                  </button>
                  <button
                    onClick={() => setUseTwelveData(false)}
                    className={`flex-1 px-3 py-2 rounded text-xs font-semibold transition-colors ${
                      !useTwelveData
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🎮 Simulated
                  </button>
                </div>
                {providerStatus && useTwelveData && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Provider:</span>
                      <span className="text-white font-mono">{providerStatus.primaryProvider}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Quotes Cached:</span>
                      <span className="text-white font-mono">{providerStatus.quoteCacheSize}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Candles Cached:</span>
                      <span className="text-white font-mono">{providerStatus.candleCacheSize || 0}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Status:</span>
                      <span className={`font-semibold ${providerStatus.pollingActive ? 'text-green-400' : 'text-yellow-400'}`}>
                        {providerStatus.pollingActive ? '🔄 Active' : '⏸️  Paused'}
                      </span>
                    </div>
                  </div>
                )}
                {quotesError && useTwelveData && (
                  <div className="mt-2 p-2 bg-red-900 bg-opacity-30 border border-red-700 rounded">
                    <div className="text-xs text-red-300">{quotesError}</div>
                  </div>
                )}
                {!useTwelveData && (
                  <div className="mt-2 text-xs text-gray-500 italic">
                    Using simulated market data. Switch to LIVE for real quotes.
                  </div>
                )}
              </div>
            </div>
            
            <OrderPanel
              symbol={selectedSymbol}
              bid={selectedQuote.bid}
              ask={selectedQuote.ask}
              spread={selectedQuote.spread}
              balance={account.currentBalance}
              equity={account.equity}
              freeMargin={marginInfo?.freeMargin}
              usedMargin={marginInfo?.usedMargin}
              onTrade={handleTrade}
              disabled={!canTrade}
              disabledReason={!canTrade ? disabledReason : undefined}
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
