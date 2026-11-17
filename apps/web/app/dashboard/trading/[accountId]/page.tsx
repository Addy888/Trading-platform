'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { ProtectedRoute } from '@/components/protected-route';
import { tradingApi, type OpenPosition, type Trade } from '@/lib/trading-api';
import { tradingV2Api, type MarginInfo } from '@/lib/trading-v2-api';
import { tradingAccountsApi, type TradingAccount } from '@/lib/trading-accounts-api';
import { marketApi, MarketDataError, type MarketInstrument } from '@/lib/market-api';
import { MarketWatch } from '@/components/trading/market-watch';
import { OrderPanel } from '@/components/trading/order-panel';
import { CandlestickChart } from '@/components/trading/candlestick-chart';
import { PositionsTable } from '@/components/trading/positions-table';
import { TradesTable } from '@/components/trading/trades-table';
import { ChallengeProgress } from '@/components/trading/challenge-progress';
import { ExecutionModeIndicator } from '@/components/trading/execution-mode-indicator';
import { useMarketQuotes } from '@/hooks/useMarketQuotes';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';

type TabType = 'positions' | 'trades';
const DEFAULT_TWELVE_DATA_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
const TWELVE_DATA_WATCH_SYMBOLS = new Set(DEFAULT_TWELVE_DATA_SYMBOLS);
const SIMULATED_SYMBOLS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'BTCUSD', 'ETHUSD', 'XAUUSD', 'XAGUSD']);

export default function TradingTerminalPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();
  const { socket, connected: socketConnected, authenticated: socketAuthenticated, error: socketError } = useSocket();

  const accountId = params.accountId as string;
  const reconnectAttemptedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candleRequestRef = useRef(0);
  const candleRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candleRetryAttemptRef = useRef(0);
  const candleHistoryKeyRef = useRef<string | null>(null);
  const hasCandleHistoryRef = useRef(false);
  const marketDataEnabledRef = useRef(false);
  // ✅ FIX RATE LIMITS: Track in-flight candle requests to prevent duplicates
  const candleInFlightRef = useRef(false);
  // ✅ PHASE 2: Historical pagination state
  const [isLoadingOlderCandles, setIsLoadingOlderCandles] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const paginationRequestRef = useRef(0);
  const lastPaginationTriggerRef = useRef(0);

  // Core State
  const [account, setAccount] = useState<TradingAccount | null>(null);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [marginInfo, setMarginInfo] = useState<MarginInfo | null>(null);
  const [marginError, setMarginError] = useState<string | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<any>(null);
  
  // Execution mode state
  const [executionMode, setExecutionMode] = useState<'SIMULATED' | 'PAPER' | 'BROKER_SANDBOX' | 'LIVE'>('SIMULATED');
  
  // Chart State
  const [selectedSymbol, setSelectedSymbol] = useState(searchParams.get('symbol') || 'EURUSD');
  const [selectedExchange, setSelectedExchange] = useState(searchParams.get('exchange') || undefined);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1H');
  const [candles, setCandles] = useState<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);
  const [latestCandleUpdate, setLatestCandleUpdate] = useState<{ time: number; open: number; high: number; low: number; close: number } | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartRenderError, setChartRenderError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<'LIVE' | 'DELAYED' | 'STALE' | 'DISCONNECTED'>('DISCONNECTED');
  const [dataAgeMinutes, setDataAgeMinutes] = useState<number>(0);
  const [latestProviderTimestamp, setLatestProviderTimestamp] = useState<string | null>(null);
  
  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_TWELVE_DATA_SYMBOLS);
  const [instrumentDetails, setInstrumentDetails] = useState<Record<string, MarketInstrument>>({});
  const [instrumentMetadataError, setInstrumentMetadataError] = useState<string | null>(null);
  const [simulatedTradingSymbols, setSimulatedTradingSymbols] = useState<string[]>(Array.from(SIMULATED_SYMBOLS));
  const [marketDataEnabled, setMarketDataEnabled] = useState(false);
  const [marketDataPollingInterval, setMarketDataPollingInterval] = useState(900000);
  const [staleThresholdMs, setStaleThresholdMs] = useState(1200000);
  const [providerSetupMessage, setProviderSetupMessage] = useState<string | null>(null);
  const [marketDataProviderLabel, setMarketDataProviderLabel] = useState('Twelve Data');
  const [providerQuoteStatus, setProviderQuoteStatus] = useState('UNVERIFIED');
  const [providerQuoteError, setProviderQuoteError] = useState<string | null>(null);
  const [providerQuoteLastSuccessAt, setProviderQuoteLastSuccessAt] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const handleChartRenderError = useCallback((message: string | null) => {
    setChartRenderError(message);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const stopMarketDataAfterTerminalError = (error: unknown) => {
    if (
      error instanceof MarketDataError &&
      ['NOT_CONFIGURED', 'INVALID_CREDENTIALS', 'ACCOUNT_ACCESS', 'SESSION_EXPIRED'].includes(error.category || '')
    ) {
      marketDataEnabledRef.current = false;
      setMarketDataEnabled(false);
    }
  };

  const {
    quotes,
    loading: quotesLoading,
    error: quotesError,
    refresh: refreshMarketQuotes,
  } = useMarketQuotes(
    symbols,
    marketDataPollingInterval,
    accessToken || undefined,
    marketDataEnabled,
    selectedSymbol,
    selectedExchange,
  );

  // ✅ FIXED: Memoize symbols array to prevent infinite loop in useMarketWebSocket
  const wsSymbols = useMemo(() => 
    marketDataEnabled && selectedSymbol ? [selectedSymbol] : [],
    [marketDataEnabled, selectedSymbol]
  );

  // WebSocket market data integration
  const {
    status: wsMarketStatus,
    latestCandle: wsLatestCandle,
    clearLatestCandle: clearWsLatestCandle,
  } = useMarketWebSocket(
    socket,
    wsSymbols,
    marketDataEnabled && socketConnected && socketAuthenticated,
    selectedTimeframe,
  );

  // Load initial data
  useEffect(() => {
    if (accessToken && accountId) {
      loadAllData();
    }
  }, [accessToken, accountId]);

  const loadTwelveDataMarketData = async () => {
    if (!accessToken) return;
    marketDataEnabledRef.current = false;
    setMarketDataEnabled(false);
    try {
      const status = await marketApi.getStatus(accessToken);
      const provider = status.providers.TWELVE_DATA;
      setMarketDataProviderLabel(status.primaryProvider === 'TWELVE_DATA' ? 'Twelve Data' : status.primaryProvider);
      setProviderQuoteStatus(provider.quoteStatus);
      setProviderQuoteError(provider.quoteLastError);
      setProviderQuoteLastSuccessAt(provider.quoteLastSuccessAt);
      setMarketDataPollingInterval(status.configuration.pollingIntervalMs);
      setStaleThresholdMs(status.configuration.staleThresholdMs);
      // The order path separately validates fresh provider timestamps before simulated fills.
      const setupMessages: string[] = [];
      if (!status.configuration.configured) {
        const missing = status.configuration.missingVariables.length
          ? status.configuration.missingVariables.join(', ')
          : 'TWELVE_DATA_API_KEY';
        setupMessages.push(
          `Missing ${missing} in apps/api/.env. Configure the server-side Twelve Data API key, then restart the backend.`,
        );
      } else if (provider.status === 'INVALID_CREDENTIALS') {
        setupMessages.push(
          'Twelve Data rejected TWELVE_DATA_API_KEY. Update apps/api/.env and restart the backend.',
        );
      }
      setupMessages.push('Twelve Data provides display prices only. They are used for simulated fills only; real execution still requires an authorized executable bid/ask feed.');
      setProviderSetupMessage(setupMessages.length ? setupMessages.join(' ') : null);
      const blockedStatuses = ['DISABLED', 'INVALID_CREDENTIALS'];
      if (!status.configuration.configured || blockedStatuses.includes(provider.status)) {
        candleHistoryKeyRef.current = null;
        hasCandleHistoryRef.current = false;
        setCandles([]);
        setLatestCandleUpdate(null);
        setCandlesLoading(false);
        setChartError(
          provider.lastError ||
          'Twelve Data is unavailable. Configure a valid TWELVE_DATA_API_KEY in apps/api/.env, then restart the backend.',
        );
        return;
      }

      marketDataEnabledRef.current = true;
      setMarketDataEnabled(true);
      const supportedSymbols = (await marketApi.getInstruments(accessToken)).filter((symbol) => TWELVE_DATA_WATCH_SYMBOLS.has(symbol));
      const discoveredSymbol = selectedSymbol.trim();
      const hasValidDiscoveredSymbol = /^[A-Za-z0-9][A-Za-z0-9./^_-]{0,31}$/.test(discoveredSymbol);
      const availableSymbols = Array.from(new Set([
        ...supportedSymbols,
        ...(hasValidDiscoveredSymbol ? [discoveredSymbol] : []),
      ]));
      if (!availableSymbols.length) {
        setSymbols([]);
        candleHistoryKeyRef.current = null;
        hasCandleHistoryRef.current = false;
        setCandles([]);
        setLatestCandleUpdate(null);
        setCandlesLoading(false);
        setChartError('No supported Twelve Data instruments are configured for this terminal.');
        return;
      }
      setSymbols(availableSymbols);
      const symbol = availableSymbols.includes(selectedSymbol) ? selectedSymbol : availableSymbols[0];
      if (symbol !== selectedSymbol) setSelectedSymbol(symbol);
      await loadCandles(symbol, selectedTimeframe, symbol === selectedSymbol ? selectedExchange : undefined);
    } catch (instrumentError) {
      stopMarketDataAfterTerminalError(instrumentError);
      setProviderQuoteError(instrumentError instanceof Error ? instrumentError.message : 'Twelve Data status request failed.');
      setProviderQuoteStatus('ERROR');
      if (instrumentError instanceof Error) setChartError(instrumentError.message);
      else setChartError('Twelve Data market data is temporarily unavailable. Please retry later.');
    }
  };

  const loadAllData = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError(null);

      // Load account details first - this is separate from market data
      try {
        const accountData = await tradingAccountsApi.getUserAccount(accessToken, accountId);
        setAccount(accountData);
        const mode = accountData.executionMode;
        setExecutionMode(mode === 'SIMULATED' || mode === 'PAPER' || mode === 'BROKER_SANDBOX' || mode === 'LIVE' ? mode : 'LIVE');
        try {
          const configured = await tradingV2Api.getInstruments(accessToken, accountId);
          setSimulatedTradingSymbols(configured.instruments.map((instrument) => instrument.symbol));
          setInstrumentDetails((current) => ({
            ...current,
            ...Object.fromEntries(configured.instruments.map((instrument) => [
              instrument.symbol,
              {
                symbol: instrument.symbol,
                name: instrument.name,
                assetType: instrument.category === 'FOREX' || instrument.category === 'CRYPTO' || instrument.category === 'COMMODITY'
                  ? instrument.category
                  : 'OTHER',
                exchange: null,
                exchangeCode: null,
                country: null,
                currency: null,
                timezone: null,
                source: 'TRADING_CONFIG' as const,
              },
            ])),
          }));
        } catch {
          setSimulatedTradingSymbols([]);
        }
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
          setMarginError(marginErr instanceof Error ? marginErr.message : 'Margin is unavailable until fresh executable quotes arrive.');
        }

        // Load challenge progress even when margin cannot be valued.
        const progressData = await tradingApi.getChallengeProgress(accessToken, accountId);
        setChallengeProgress(progressData);

      } catch (marketDataErr: any) {
        console.error('Trading data loading error (non-fatal):', marketDataErr);
      }

      await loadTwelveDataMarketData();

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

  // ✅ PHASE 2: Load older historical candles (pagination)
  const loadOlderCandles = async () => {
    if (!accessToken || !marketDataEnabledRef.current || !candles.length || !hasMoreHistory) {
      return;
    }
    
    // Debounce: prevent rapid pagination requests
    const now = Date.now();
    if (now - lastPaginationTriggerRef.current < 2000) {
      console.log('[loadOlderCandles] Debounced - too soon since last request');
      return;
    }
    
    if (isLoadingOlderCandles) {
      console.log('[loadOlderCandles] Already loading older candles');
      return;
    }
    
    const requestId = ++paginationRequestRef.current;
    const oldestCandle = candles[0];
    const oldestTime = oldestCandle.time;
    
    lastPaginationTriggerRef.current = now;
    setIsLoadingOlderCandles(true);
    
    const intervalMap: Record<string, string> = { 
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1H': '1h',
      '4H': '4h',
      '1D': '1day'
    };
    
    const mappedInterval = intervalMap[selectedTimeframe];
    if (!mappedInterval) {
      setIsLoadingOlderCandles(false);
      return;
    }
    
    try {
      console.log('[loadOlderCandles] Request:', {
        symbol: selectedSymbol,
        timeframe: selectedTimeframe,
        mappedInterval,
        oldestTime: new Date(oldestTime * 1000).toISOString(),
        batchSize: 200,
        requestId
      });
      
      // Request candles with a larger batch to go further back
      const result = await marketApi.getCandles(
        accessToken,
        selectedSymbol,
        mappedInterval,
        500, // Request 500 to get a good batch of older candles
        selectedExchange
      );
      
      if (requestId !== paginationRequestRef.current) {
        console.log('[loadOlderCandles] Stale response, discarding');
        return;
      }
      
      if (!result.success || !result.candles?.length) {
        console.log('[loadOlderCandles] No more history available');
        setHasMoreHistory(false);
        return;
      }
      
      // Normalize candles
      const normalizedCandles = result.candles.map((candle, idx) => {
        const timestamp = Date.parse(candle.timestamp);
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
          throw new Error(`Invalid timestamp at candle ${idx}: ${candle.timestamp}`);
        }
        
        const time = Math.floor(timestamp / 1000);
        const open = Number(candle.open);
        const high = Number(candle.high);
        const low = Number(candle.low);
        const close = Number(candle.close);
        
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          throw new Error(`Non-finite OHLC values at candle ${idx}`);
        }
        
        if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
          throw new Error(`Non-positive OHLC values at candle ${idx}`);
        }
        
        return { time, open, high, low, close };
      });
      
      // Find candles that are older than our current oldest candle
      const olderCandles = normalizedCandles.filter(c => c.time < oldestTime);
      
      if (olderCandles.length === 0) {
        console.log('[loadOlderCandles] No older candles in response - history exhausted');
        setHasMoreHistory(false);
        return;
      }
      
      // Sort in ascending order and remove duplicates
      const uniqueOlderCandles = olderCandles
        .sort((a, b) => a.time - b.time)
        .filter((candle, idx, arr) => idx === 0 || candle.time !== arr[idx - 1].time);
      
      console.log('[loadOlderCandles] Success:', {
        symbol: selectedSymbol,
        timeframe: selectedTimeframe,
        olderCandlesFound: uniqueOlderCandles.length,
        oldestNewCandle: new Date(uniqueOlderCandles[0].time * 1000).toISOString(),
        previousOldest: new Date(oldestTime * 1000).toISOString(),
        totalCandles: uniqueOlderCandles.length + candles.length
      });
      
      // Prepend older candles to existing history
      setCandles(prev => [...uniqueOlderCandles, ...prev]);
      
      // Check if we've exhausted history (got fewer candles than we already had in that direction)
      if (uniqueOlderCandles.length < 100) {
        console.log('[loadOlderCandles] Received fewer than 100 older candles - likely near history limit');
        setHasMoreHistory(false);
      }
      
    } catch (err: any) {
      if (requestId !== paginationRequestRef.current) return;
      
      console.error('[loadOlderCandles] Error:', err.message || err);
      
      // Don't mark hasMoreHistory as false on error - allow retry
      if (err.message?.includes('No candles') || err.message?.includes('exhausted')) {
        setHasMoreHistory(false);
      }
    } finally {
      if (requestId === paginationRequestRef.current) {
        setIsLoadingOlderCandles(false);
      }
    }
  };

  const loadCandles = async (symbol: string, timeframe: string, exchange?: string) => {
    if (!accessToken || !marketDataEnabledRef.current) return;
    if (candleRetryTimerRef.current) clearTimeout(candleRetryTimerRef.current);
    
    const requestId = ++candleRequestRef.current;
    const historyKey = `${symbol}:${exchange || ''}:${timeframe}`;
    
    // ✅ FIX RATE LIMITS: Prevent duplicate simultaneous requests for same symbol/timeframe/exchange
    if (candleInFlightRef.current && candleHistoryKeyRef.current === historyKey) {
      console.log('[loadCandles] Request already in-flight for same symbol/timeframe/exchange, skipping');
      return;
    }
    
    if (candleHistoryKeyRef.current !== historyKey) {
      candleHistoryKeyRef.current = historyKey;
      hasCandleHistoryRef.current = false;
      setCandles([]);
      setLatestCandleUpdate(null);
      clearWsLatestCandle();
      setHasMoreHistory(true);
      setIsLoadingOlderCandles(false);
      paginationRequestRef.current++;
    }
    setCandlesLoading(!hasCandleHistoryRef.current);
    setChartError(null);
    
    const intervalMap: Record<string, string> = { 
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1H': '1h',
      '4H': '4h',
      '1D': '1day'
    };
    
    const mappedInterval = intervalMap[timeframe];
    if (!mappedInterval) {
      setChartError(`Unsupported timeframe: ${timeframe}`);
      setCandlesLoading(false);
      return;
    }
    
    // ✅ FIX RATE LIMITS: Mark as in-flight before making request
    candleInFlightRef.current = true;
    
    try {
      // ✅ PHASE 1: Load 500 candles initially for better historical context
      // Use 100 for polling updates to avoid rate limits, 500 for initial/refresh loads
      const outputsize = hasCandleHistoryRef.current ? 100 : 500;
      
      console.log('[loadCandles] Request:', {
        symbol,
        requestedTimeframe: timeframe,
        mappedInterval,
        exchange: exchange || 'none',
        outputsize,
        isInitialLoad: !hasCandleHistoryRef.current,
        requestId
      });
      
      const result = await marketApi.getCandles(accessToken, symbol, mappedInterval, outputsize, exchange);
      
      if (requestId !== candleRequestRef.current) {
        console.log('[loadCandles] Stale response, discarding (request superseded)');
        return;
      }
      
      console.log('[loadCandles] Response:', {
        success: result.success,
        provider: result.provider,
        symbol: result.symbol,
        interval: result.interval,
        candleCount: result.candles?.length || 0,
        dataStatus: result.metadata?.dataStatus || 'UNKNOWN',
        ageMinutes: result.metadata?.ageMinutes || 0,
        firstCandle: result.candles?.[0] ? {
          timestamp: result.candles[0].timestamp,
          open: result.candles[0].open,
          high: result.candles[0].high,
          low: result.candles[0].low,
          close: result.candles[0].close
        } : null,
        lastCandle: result.candles?.length ? {
          timestamp: result.candles[result.candles.length - 1].timestamp,
          open: result.candles[result.candles.length - 1].open,
          high: result.candles[result.candles.length - 1].high,
          low: result.candles[result.candles.length - 1].low,
          close: result.candles[result.candles.length - 1].close
        } : null
      });
      
      // ✅ Update freshness state from metadata
      if (result.metadata) {
        setDataStatus(result.metadata.dataStatus);
        setDataAgeMinutes(result.metadata.ageMinutes);
        setLatestProviderTimestamp(result.metadata.latestCandleTimestamp);
      }
      
      if (!result.success || !result.candles?.length) {
        throw new Error('Twelve Data returned no candles for the requested symbol/interval.');
      }
      
      candleRetryAttemptRef.current = 0;
      
      // ✅ CRITICAL: Validate and normalize candles
      const normalizedCandles = result.candles.map((candle, idx) => {
        const timestamp = Date.parse(candle.timestamp);
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
          throw new Error(`Invalid timestamp at candle ${idx}: ${candle.timestamp}`);
        }
        
        // ✅ Lightweight Charts expects Unix timestamp in SECONDS
        const time = Math.floor(timestamp / 1000);
        
        // ✅ FIX: Verify candle is aligned to timeframe boundary
        const intervalMap: Record<string, number> = {
          '1m': 60,
          '5m': 300,
          '15m': 900,
          '30m': 1800,
          '1H': 3600,
          '4H': 14400,
          '1D': 86400,
        };
        const intervalSeconds = intervalMap[timeframe] || 3600;
        const alignedTime = Math.floor(time / intervalSeconds) * intervalSeconds;
        
        if (time !== alignedTime) {
          console.warn(`[loadCandles] Candle ${idx} timestamp not aligned to ${timeframe} boundary:`, {
            timestamp: candle.timestamp,
            rawTime: time,
            rawIso: new Date(time * 1000).toISOString(),
            alignedTime,
            alignedIso: new Date(alignedTime * 1000).toISOString(),
            offsetSeconds: time - alignedTime,
          });
        }
        
        // ✅ Use aligned time for consistency with WebSocket
        const finalTime = alignedTime;
        
        const open = Number(candle.open);
        const high = Number(candle.high);
        const low = Number(candle.low);
        const close = Number(candle.close);
        
        // ✅ CRITICAL: Validate OHLC constraints
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          throw new Error(`Non-finite OHLC values at candle ${idx}: ${JSON.stringify(candle)}`);
        }
        
        if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
          throw new Error(`Non-positive OHLC values at candle ${idx}: ${JSON.stringify(candle)}`);
        }
        
        const maxPrice = Math.max(open, close);
        const minPrice = Math.min(open, close);
        
        if (high < maxPrice || high < low) {
          console.error(`[loadCandles] OHLC violation at candle ${idx}:`, {
            timestamp: candle.timestamp,
            open, high, low, close,
            violation: 'high < max(open,close,low)'
          });
          throw new Error(`Invalid OHLC: high (${high}) must be >= max(open, close, low) at candle ${idx}`);
        }
        
        if (low > minPrice || low > high) {
          console.error(`[loadCandles] OHLC violation at candle ${idx}:`, {
            timestamp: candle.timestamp,
            open, high, low, close,
            violation: 'low > min(open,close) or low > high'
          });
          throw new Error(`Invalid OHLC: low (${low}) must be <= min(open, close) at candle ${idx}`);
        }
        
        return { time: finalTime, open, high, low, close };
      });
      
      // ✅ Validate chronological order and no duplicates
      for (let i = 1; i < normalizedCandles.length; i++) {
        if (normalizedCandles[i].time <= normalizedCandles[i - 1].time) {
          throw new Error(`Candles not in chronological order or duplicate timestamp at index ${i}`);
        }
      }
      
      const fetchTimestamp = Date.now();
      const latestCandleTime = normalizedCandles[normalizedCandles.length - 1].time;
      
      console.log('[loadCandles] Success:', {
        symbol,
        timeframe,
        mappedInterval,
        candleCount: normalizedCandles.length,
        latestCandleTime: new Date(latestCandleTime * 1000).toISOString(),
        fetchedAt: new Date(fetchTimestamp).toISOString(),
        isInitialLoad: !hasCandleHistoryRef.current,
        priceRange: {
          min: Math.min(...normalizedCandles.map(c => c.low)).toFixed(5),
          max: Math.max(...normalizedCandles.map(c => c.high)).toFixed(5)
        }
      });
      
      // ✅ FIXED: Proper update logic - initial load vs incremental update
      if (!hasCandleHistoryRef.current) {
        // Initial load: replace all candles
        setCandles(normalizedCandles);
        setLatestCandleUpdate(null);
        hasCandleHistoryRef.current = true;
        console.log('[loadCandles] Initial history loaded');
      } else {
        // ✅ Polling update: check if we should update existing candle or append new one
        const lastHistoryCandle = candles[candles.length - 1];
        const latestCandle = normalizedCandles[normalizedCandles.length - 1];
        
        if (lastHistoryCandle && latestCandle.time === lastHistoryCandle.time) {
          // Same timestamp: update the current candle
          setLatestCandleUpdate(latestCandle);
          console.log('[loadCandles] Updated current candle:', {
            time: new Date(latestCandle.time * 1000).toISOString(),
            open: latestCandle.open,
            high: latestCandle.high,
            low: latestCandle.low,
            close: latestCandle.close
          });
        } else if (!lastHistoryCandle || latestCandle.time > lastHistoryCandle.time) {
          // New timestamp: append new candle(s)
          const newCandles = normalizedCandles.filter(c => !lastHistoryCandle || c.time > lastHistoryCandle.time);
          if (newCandles.length > 0) {
            setCandles(prev => [...prev, ...newCandles]);
            setLatestCandleUpdate(null);
            console.log('[loadCandles] Appended new candles:', newCandles.length);
          }
        } else {
          // Older data received - this shouldn't happen but handle gracefully
          console.warn('[loadCandles] Received older data than current history, ignoring update');
        }
      }
      setChartError(null);
    } catch (err: any) {
      if (requestId !== candleRequestRef.current) return;
      stopMarketDataAfterTerminalError(err);
      if (!hasCandleHistoryRef.current) setCandles([]);
      
      const errorMessage = err.message || 'Twelve Data market data is temporarily unavailable. Please retry later.';
      
      // ✅ FIX RATE LIMITS: Better handling of rate-limited responses
      // Don't clear existing candles on rate limit - show them as stale
      if (err instanceof MarketDataError && err.category === 'RATE_LIMITED') {
        console.warn('[loadCandles] Rate limited - preserving existing candles:', {
          hasCandleHistory: hasCandleHistoryRef.current,
          existingCandleCount: candles.length,
          retryAfterMs: err.retryAfterMs,
        });
        // Keep existing candles visible and just show a transient message
        setChartError('Twelve Data request limit reached. Your existing chart data is preserved. Please wait before trying again.');
      } else {
        setChartError(errorMessage);
        console.error('[loadCandles] Error:', errorMessage);
      }
      
      if (
        err instanceof MarketDataError &&
        err.retryable &&
        candleRetryAttemptRef.current < 3
      ) {
        const attempt = ++candleRetryAttemptRef.current;
        const exponentialDelay = Math.min(2000 * (2 ** (attempt - 1)), 30000);
        const retryAfter = Math.min(err.retryAfterMs || 0, 120000);
        const totalWait = Math.max(exponentialDelay, retryAfter);
        
        console.log('[loadCandles] Scheduling retry:', {
          attempt,
          exponentialDelay,
          retryAfter,
          totalWait,
        });
        
        candleRetryTimerRef.current = setTimeout(
          () => void loadCandles(symbol, timeframe, exchange),
          totalWait,
        );
      }
    } finally {
      candleInFlightRef.current = false;
      if (requestId === candleRequestRef.current) setCandlesLoading(false);
    }
  };

  // ✅ FIX RATE LIMITS: Stable polling that doesn't retrigger on every dependency change
  // Use refs to capture current values without recreating the effect
  const selectedSymbolRef = useRef(selectedSymbol);
  const selectedTimeframeRef = useRef(selectedTimeframe);
  const selectedExchangeRef = useRef(selectedExchange);
  const marketDataPollingIntervalRef = useRef(marketDataPollingInterval);
  
  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);
  
  useEffect(() => {
    selectedTimeframeRef.current = selectedTimeframe;
  }, [selectedTimeframe]);
  
  useEffect(() => {
    selectedExchangeRef.current = selectedExchange;
  }, [selectedExchange]);
  
  useEffect(() => {
    marketDataPollingIntervalRef.current = marketDataPollingInterval;
  }, [marketDataPollingInterval]);

  useEffect(() => {
    if (!marketDataEnabled || !accessToken) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const pollCandles = async () => {
      // Use refs to get current values without dependency array issues
      await loadCandles(
        selectedSymbolRef.current,
        selectedTimeframeRef.current,
        selectedExchangeRef.current
      );
      if (!cancelled) timer = setTimeout(pollCandles, marketDataPollingIntervalRef.current);
    };

    // ✅ FIX RATE LIMITS: Initial load after small delay to avoid thundering herd
    timer = setTimeout(pollCandles, Math.min(1000, marketDataPollingIntervalRef.current));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, marketDataEnabled]); // ✅ REDUCED dependencies to only essential ones

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
        loadCandles(selectedSymbol, selectedTimeframe, selectedExchange);
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
  }, [socketConnected, accountId, selectedExchange, selectedSymbol, selectedTimeframe, socket]);

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
      setMarginError(err instanceof Error ? err.message : 'Margin is unavailable until fresh executable quotes arrive.');
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
        symbol: simulatedTradingSymbols.includes(selectedSymbol.replace(/[\/_]/g, '').toUpperCase())
          ? selectedSymbol.replace(/[\/_]/g, '').toUpperCase()
          : selectedSymbol,
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
    if (symbol !== selectedSymbol) setSelectedExchange(undefined);
    setSelectedSymbol(symbol);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
  };

  useEffect(() => {
    if (selectedSymbol && selectedTimeframe && accessToken) {
      clearWsLatestCandle(); // Clear WebSocket candle when changing symbol/timeframe
      loadCandles(selectedSymbol, selectedTimeframe, selectedExchange);
    }
  }, [selectedSymbol, selectedTimeframe, selectedExchange, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use WebSocket candle updates when available, otherwise use polling updates
  // ✅ FIX: Calculate timeframe interval in seconds for alignment verification
  const timeframeIntervalSeconds = useMemo(() => {
    const intervals: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1H': 3600,
      '4H': 14400,
      '1D': 86400,
    };
    return intervals[selectedTimeframe] || 3600;
  }, [selectedTimeframe]);

  // ✅ FIX: Verify if a timestamp is properly aligned to the timeframe boundary
  const isAlignedToTimeframe = useCallback((unixSeconds: number, intervalSeconds: number): boolean => {
    return (unixSeconds % intervalSeconds) === 0;
  }, []);

  // ✅ FIX: Get the aligned candle start time for a given timestamp
  const getAlignedCandleTime = useCallback((unixSeconds: number, intervalSeconds: number): number => {
    return Math.floor(unixSeconds / intervalSeconds) * intervalSeconds;
  }, []);

  useEffect(() => {
    if (wsLatestCandle && wsMarketStatus.feedMode === 'WEBSOCKET') {
      // ✅ CRITICAL FIX: Validate WebSocket candle timestamp with alignment check
      const lastHistoryCandle = candles.at(-1);
      
      // Align the WebSocket candle to the expected boundary
      const wsAlignedTime = getAlignedCandleTime(wsLatestCandle.time, timeframeIntervalSeconds);
      
      // Log diagnostic information
      const wsIso = new Date(wsLatestCandle.time * 1000).toISOString();
      const wsAlignedIso = new Date(wsAlignedTime * 1000).toISOString();
      const lastHistoryIso = lastHistoryCandle ? new Date(lastHistoryCandle.time * 1000).toISOString() : 'N/A';
      
      console.log('[Trading Page] WebSocket candle received:', {
        rawTime: wsLatestCandle.time,
        rawIso: wsIso,
        alignedTime: wsAlignedTime,
        alignedIso: wsAlignedIso,
        isAligned: isAlignedToTimeframe(wsLatestCandle.time, timeframeIntervalSeconds),
        interval: `${timeframeIntervalSeconds}s`,
        lastHistoryTime: lastHistoryCandle?.time || null,
        lastHistoryIso,
      });
      
      // ✅ FIX: Use aligned time for comparison, allow updates to current candle
      if (lastHistoryCandle) {
        const lastHistoryAligned = getAlignedCandleTime(lastHistoryCandle.time, timeframeIntervalSeconds);
        
        if (wsAlignedTime < lastHistoryAligned) {
          console.warn('[Trading Page] Ignoring outdated WebSocket candle:', {
            wsAlignedTime,
            wsAlignedIso,
            lastHistoryAligned,
            lastHistoryIso,
            diffSeconds: lastHistoryAligned - wsAlignedTime,
          });
          return;
        }
        
        if (wsAlignedTime === lastHistoryAligned) {
          // ✅ FIX: Same candle period - update the current candle
          console.log('[Trading Page] Updating current candle (same timeframe period):', {
            alignedTime: wsAlignedTime,
            alignedIso: wsAlignedIso,
          });
          setLatestCandleUpdate(wsLatestCandle);
          return;
        }
        
        if (wsAlignedTime > lastHistoryAligned) {
          // ✅ FIX: New candle period - add to history
          console.log('[Trading Page] New candle period detected:', {
            wsAlignedTime,
            wsAlignedIso,
            lastHistoryAligned,
            lastHistoryIso,
          });
          // The chart component will handle merging this with existing candles
          setLatestCandleUpdate(wsLatestCandle);
          return;
        }
      } else {
        // No history yet, accept the WebSocket candle
        setLatestCandleUpdate(wsLatestCandle);
      }
    }
  }, [wsLatestCandle, wsMarketStatus.feedMode, candles, timeframeIntervalSeconds, getAlignedCandleTime, isAlignedToTimeframe]);

  useEffect(() => {
    let active = true;
    if (!accessToken || !selectedSymbol || instrumentDetails[selectedSymbol]?.source === 'TWELVE_DATA') {
      return () => { active = false; };
    }

    void marketApi.getInstrumentDetails(accessToken, selectedSymbol, selectedExchange)
      .then(({ instrument }) => {
        if (active) {
          setInstrumentDetails((current) => ({ ...current, [selectedSymbol]: instrument }));
          setInstrumentMetadataError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setInstrumentMetadataError(
            error instanceof Error ? error.message : 'Provider instrument metadata is unavailable.',
          );
        }
      });

    return () => { active = false; };
  }, [accessToken, instrumentDetails, selectedExchange, selectedSymbol]);

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
  const quoteReceivedTimestamp = selectedQuote ? Date.parse(selectedQuote.receivedAt) : Number.NaN;
  const freshnessReferenceTime = clockNow ?? quoteReceivedTimestamp;
  const selectedQuoteIsCurrent = Boolean(
    selectedQuote &&
    Number.isFinite(quoteTimestamp) &&
    Number.isFinite(freshnessReferenceTime) &&
    freshnessReferenceTime - quoteTimestamp >= 0 &&
    freshnessReferenceTime - quoteTimestamp <= staleThresholdMs &&
    Number.isFinite(Number(selectedQuote.price)) &&
    Number(selectedQuote.price) > 0,
  );
  const marketStatus = selectedQuote
    ? quotesError ? 'ERROR' : selectedQuoteIsCurrent ? 'CONNECTED' : 'STALE'
    : quotesLoading ? 'CONNECTING' : quotesError || providerQuoteError || ['ERROR', 'RATE_LIMITED', 'INVALID_CREDENTIALS', 'DISABLED'].includes(providerQuoteStatus) ? 'ERROR' : 'DISCONNECTED';
  const latestCandleTime = latestCandleUpdate?.time ?? candles.at(-1)?.time ?? null;
  const latestCandleDate = latestCandleTime === null ? null : new Date(latestCandleTime * 1000);
  const activeQuoteError = quotesError || (!selectedQuote ? providerQuoteError : null);
  const marketStatusDetail = activeQuoteError || (marketStatus === 'DISCONNECTED' ? 'No successful latest-price response is available for this symbol.' : null);
  const isSimulatedMode = executionMode === 'SIMULATED';
  const marketDataAvailable = Boolean(
    isSimulatedMode &&
    simulatedTradingSymbols.includes(selectedSymbol.replace(/[\/_]/g, '').toUpperCase()) &&
    selectedQuoteIsCurrent,
  );
  const orderDisabledReason = !canTrade
    ? disabledReason
    : !isSimulatedMode
      ? 'Real execution is disabled. An authorized broker integration with validated executable bid/ask quotes is not configured.'
      : !simulatedTradingSymbols.includes(selectedSymbol.replace(/[\/_]/g, '').toUpperCase())
        ? `Simulated execution is not configured for ${selectedSymbol}.`
        : !selectedQuoteIsCurrent
          ? activeQuoteError || 'A fresh Twelve Data price is required for the simulated fill policy.'
          : undefined;

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
                <div className="text-xs text-gray-400">Balance{isSimulatedMode ? ' · simulated' : ''}</div>
                <div className="font-semibold">${parseFloat(account.currentBalance).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Equity{isSimulatedMode ? ' · simulated' : ''}</div>
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
              <div className="flex flex-col items-start" title={marketStatusDetail || undefined}>
                <span className={`text-xs ${marketStatus === 'CONNECTED' ? 'text-green-400' : marketStatus === 'STALE' ? 'text-yellow-300' : marketStatus === 'CONNECTING' ? 'text-blue-300' : 'text-red-300'}`}>
                  {marketDataProviderLabel} quote: {marketStatus === 'CONNECTED' ? 'Available · polling' : marketStatus === 'STALE' ? 'Stale provider timestamp' : marketStatus === 'CONNECTING' ? 'Requesting' : marketStatus === 'ERROR' ? 'Unavailable · error' : 'No quote'}
                </span>
                <span className="text-[10px] text-gray-500">
                  {selectedQuote
                    ? `Server fetch ${selectedQuote.fetchedAt ? new Date(selectedQuote.fetchedAt).toLocaleTimeString() : 'time unavailable'} · app received ${Number.isFinite(quoteReceivedTimestamp) ? new Date(quoteReceivedTimestamp).toLocaleTimeString() : 'time unavailable'}`
                    : providerQuoteLastSuccessAt
                      ? `Server request last success ${new Date(providerQuoteLastSuccessAt).toLocaleTimeString()}`
                      : `Provider ${providerQuoteStatus.toLowerCase()}`}
                </span>
              </div>
              <div className="flex flex-col items-start" title={chartError || undefined}>
                <span className={`text-xs ${candles.length > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                  History: {candles.length > 0 ? 'Loaded' : candlesLoading ? 'Loading' : 'Unavailable'}
                </span>
                {latestCandleDate && Number.isFinite(latestCandleDate.getTime()) && (
                  <span className="text-[10px] text-gray-500">
                    Last candle {latestCandleDate.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-start" title={socketError || 'Application account-update WebSocket only; not Twelve Data market connectivity.'}>
                <span className={`text-xs ${socketConnected ? 'text-green-400' : 'text-red-300'}`}>
                  Account updates: {socketConnected ? socketAuthenticated ? 'Authenticated socket connected' : 'Socket authenticating' : 'Socket disconnected'}
                </span>
                <span className={`text-[10px] ${wsMarketStatus.providerConnected ? 'text-green-400' : wsMarketStatus.feedMode === 'WEBSOCKET' ? 'text-amber-300' : 'text-gray-500'}`}>
                  Market feed: {wsMarketStatus.feedMode === 'WEBSOCKET' ? wsMarketStatus.providerConnected ? 'WEBSOCKET LIVE' : 'WEBSOCKET (reconnecting)' : 'POLLING'}
                  {wsMarketStatus.lastFrontendReceive && ` · last ${wsMarketStatus.lastFrontendReceive.toLocaleTimeString()}`}
                </span>
                {!socketConnected && socketError && <span className="text-[10px] text-red-300">{socketError}</span>}
                {wsMarketStatus.error && <span className="text-[10px] text-red-300">{wsMarketStatus.error}</span>}
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
            {isSimulatedMode
              ? `Real bid/ask margin and P&L valuation remain unavailable; simulated orders use the documented last-price policy. ${marginError}`
              : `Margin and unrealized P&L valuation are unavailable until fresh executable bid/ask quotes are available. ${marginError}`}
          </div>
        )}

        {/* Main Trading Area */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-auto lg:overflow-hidden">
          {/* Left: Market Watch */}
          <div className="w-full lg:w-64 max-h-40 lg:max-h-none border-b lg:border-b-0 lg:border-r border-gray-800 overflow-y-auto shrink-0">
            <MarketWatch
              symbols={symbols}
              quotes={quotes}
              selectedSymbol={selectedSymbol}
              instruments={instrumentDetails}
              onSymbolSelect={handleSymbolChange}
              loading={quotesLoading}
              staleThresholdMs={staleThresholdMs}
              currentTimeMs={clockNow}
              dataSource={Object.keys(quotes).length > 0 ? 'TWELVE_DATA' : undefined}
              unavailableMessage={quotesError || (!selectedQuote ? providerQuoteError : null) || providerSetupMessage}
            />
          </div>

          {/* Center: Chart + Positions */}
          <div className="flex-1 min-w-0 flex flex-col min-h-[700px] lg:min-h-0">
            {/* Timeframe Selector */}
            <div className="bg-gray-900 border-b border-gray-800 p-2 flex flex-wrap gap-2 items-center">
              {['1m', '5m', '15m', '30m', '1H', '4H', '1D'].map((tf) => (
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
              {(chartRenderError || chartError || quotesError) && (
                <div className="ml-auto flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs text-red-400 truncate"
                    title={chartRenderError || chartError || quotesError || undefined}
                  >
                    ⚠️ {chartRenderError || chartError || quotesError}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void loadTwelveDataMarketData();
                      if (marketDataEnabledRef.current) refreshMarketQuotes();
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Chart */}
            <div className="flex-1 min-h-[320px] bg-gray-950 p-4 overflow-hidden relative">
              <CandlestickChart
                data={candles}
                latestCandleUpdate={latestCandleUpdate}
                symbol={selectedSymbol}
                timeframe={selectedTimeframe}
                dataSource={candles.length > 0 ? 'TWELVE_DATA' : undefined}
                connectionState={marketStatus}
                latestPrice={Number(selectedQuote?.price)}
                lastUpdatedAt={selectedQuote?.timestamp || null}
                serverFetchedAt={selectedQuote?.fetchedAt || null}
                quoteReceivedAt={selectedQuote?.receivedAt || null}
                error={chartError}
                renderError={chartRenderError}
                onChartError={handleChartRenderError}
                loading={candlesLoading}
                onRetry={() => void loadTwelveDataMarketData()}
                onLoadOlderCandles={loadOlderCandles}
                isLoadingHistory={isLoadingOlderCandles}
                hasMoreHistory={hasMoreHistory}
                onGoToLatest={() => {
                  // Scroll to latest candle
                  if (candles.length > 0) {
                    setLatestCandleUpdate(candles[candles.length - 1]);
                  }
                }}
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
                    simulated={isSimulatedMode}
                    onClose={handleClosePosition}
                    onModify={handleModifyPosition}
                  />
                ) : (
                  <TradesTable trades={trades} simulated={isSimulatedMode} />
                )}
              </div>
            </div>
          </div>

          {/* Right: Order Panel + Challenge Progress */}
          <div className="w-full lg:w-80 lg:border-l border-t lg:border-t-0 border-gray-800 overflow-y-auto shrink-0">
            {/* Execution Mode Indicator */}
            <div className="p-4 border-b border-gray-800">
            <ExecutionModeIndicator mode={executionMode} marketDataProvider={marketDataProviderLabel} />
              
              <div className={`mt-3 text-xs ${selectedQuoteIsCurrent ? 'text-green-400' : 'text-amber-300'}`}>
                Market data: Twelve Data {wsMarketStatus.feedMode === 'WEBSOCKET' ? 'WebSocket' : 'polling'} · {selectedQuoteIsCurrent ? 'current display price' : marketStatus.toLowerCase()} · display-only
                {wsMarketStatus.feedMode === 'WEBSOCKET' && (
                  <span className="ml-2 font-bold text-green-400">● LIVE</span>
                )}
              </div>
              {providerSetupMessage && <div className="mt-2 text-xs text-amber-300">{providerSetupMessage}</div>}
              {quotesError && <div className="mt-2 text-xs text-red-300">{quotesError}</div>}
              {wsMarketStatus.error && <div className="mt-2 text-xs text-red-300">WebSocket: {wsMarketStatus.error}</div>}
              {instrumentMetadataError && <div className="mt-2 text-xs text-amber-300">{instrumentMetadataError}</div>}
            </div>
                        <OrderPanel
              symbol={selectedSymbol}
                          instrumentName={instrumentDetails[selectedSymbol]?.name}
                          bid=""
                          ask=""
                          spread=""
              balance={account.currentBalance}
              equity={account.equity}
              freeMargin={marginInfo?.freeMargin}
              usedMargin={marginInfo?.usedMargin}
              executionMode={executionMode}
              simulatedPrice={isSimulatedMode && selectedQuoteIsCurrent ? selectedQuote?.price : undefined}
              simulatedPriceTimestamp={selectedQuote?.timestamp}
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
