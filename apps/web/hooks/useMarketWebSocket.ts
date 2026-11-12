import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface MarketPriceUpdate {
  symbol: string;
  price: number;
  providerTimestamp: string;
  serverReceivedTimestamp: string;
  feedMode: 'WEBSOCKET' | 'POLLING';
  provider: string;
}

interface MarketConnectionUpdate {
  status: 'CONNECTED' | 'DISCONNECTED';
  provider: string;
  connectedAt?: string;
  disconnectedAt?: string;
  code?: number;
  reason?: string;
}

interface CandleUpdate {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface MarketWebSocketStatus {
  providerConnected: boolean;
  lastProviderUpdate: Date | null;
  lastFrontendReceive: Date | null;
  feedMode: 'WEBSOCKET' | 'POLLING' | 'NONE';
  provider: string | null;
  subscribed: string[];
  error: string | null;
}

/**
 * Hook to manage market data WebSocket subscriptions
 * 
 * Subscribes to real-time price updates from the Twelve Data WebSocket
 * and aggregates ticks into candlestick updates based on timeframe.
 * 
 * @param socket Socket.IO connection (from useSocket hook)
 * @param symbols Array of symbols to subscribe to (e.g., ['EURUSD'])
 * @param enabled Whether to enable WebSocket subscriptions
 * @returns Status and candle update callback
 */
export function useMarketWebSocket(
  socket: Socket | null,
  symbols: string[],
  enabled: boolean,
  timeframe: string = '1H',
): {
  status: MarketWebSocketStatus;
  latestCandle: CandleUpdate | null;
  clearLatestCandle: () => void;
} {
  const [status, setStatus] = useState<MarketWebSocketStatus>({
    providerConnected: false,
    lastProviderUpdate: null,
    lastFrontendReceive: null,
    feedMode: 'NONE',
    provider: null,
    subscribed: [],
    error: null,
  });

  const [latestCandle, setLatestCandle] = useState<CandleUpdate | null>(null);
  
  // Track current candle aggregation
  const currentCandleRef = useRef<CandleUpdate | null>(null);
  const timeframeMillisRef = useRef<number>(3600000); // Default 1H = 3600000ms

  // Parse timeframe to milliseconds
  useEffect(() => {
    const timeframeMap: Record<string, number> = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '30m': 1800000,
      '1H': 3600000,
      '4H': 14400000,
      '1D': 86400000,
    };
    timeframeMillisRef.current = timeframeMap[timeframe] || 3600000;
  }, [timeframe]);

  /**
   * Get the candle time bucket for a given timestamp
   */
  const getCandleTime = useCallback((timestamp: number): number => {
    const timeframeMs = timeframeMillisRef.current;
    return Math.floor(timestamp / timeframeMs) * timeframeMs;
  }, []); // Empty deps - uses ref which doesn't change

  /**
   * Aggregate a price tick into the current candle
   */
  const aggregateTick = useCallback((price: number, timestamp: number) => {
    const candleTime = getCandleTime(timestamp);
    const candleTimeSeconds = Math.floor(candleTime / 1000);

    if (!currentCandleRef.current || currentCandleRef.current.time !== candleTimeSeconds) {
      // Start a new candle
      currentCandleRef.current = {
        time: candleTimeSeconds,
        open: price,
        high: price,
        low: price,
        close: price,
      };
      console.log('[useMarketWebSocket] New candle started:', {
        time: new Date(candleTime).toISOString(),
        price,
      });
    } else {
      // Update existing candle
      currentCandleRef.current.high = Math.max(currentCandleRef.current.high, price);
      currentCandleRef.current.low = Math.min(currentCandleRef.current.low, price);
      currentCandleRef.current.close = price;
      console.log('[useMarketWebSocket] Candle updated:', {
        time: new Date(candleTime).toISOString(),
        price,
        candle: currentCandleRef.current,
      });
    }

    // Update the latest candle state
    setLatestCandle({ ...currentCandleRef.current });
  }, [getCandleTime]); // Now getCandleTime is stable

  /**
   * Clear the latest candle (e.g., when switching symbols)
   */
  const clearLatestCandle = useCallback(() => {
    currentCandleRef.current = null;
    setLatestCandle(null);
  }, []);

  // ✅ FIXED: Use stable symbol string to prevent infinite loop
  const symbolsKey = JSON.stringify(symbols);

  // Subscribe to market data when socket is available
  useEffect(() => {
    if (!socket || !enabled || symbols.length === 0) {
      return;
    }

    console.log('[useMarketWebSocket] Subscribing to:', symbols);

    // Subscribe to symbols
    socket.emit('market:subscribe', { symbols }, (response: any) => {
      if (response?.success) {
        console.log('[useMarketWebSocket] Subscription successful:', response.subscribed);
        setStatus(prev => ({
          ...prev,
          subscribed: response.subscribed || [],
          error: response.errors?.length ? response.errors.join(', ') : null,
        }));
      } else {
        console.error('[useMarketWebSocket] Subscription failed:', response);
        setStatus(prev => ({
          ...prev,
          error: response?.errors?.join(', ') || 'Subscription failed',
        }));
      }
    });

    // Listen for price updates
    const handlePriceUpdate = (update: MarketPriceUpdate) => {
      console.log('[useMarketWebSocket] Price update received:', update);

      const providerTimestamp = new Date(update.providerTimestamp);
      const frontendReceiveTime = new Date();

      setStatus(prev => ({
        ...prev,
        lastProviderUpdate: providerTimestamp,
        lastFrontendReceive: frontendReceiveTime,
        feedMode: update.feedMode,
        provider: update.provider,
      }));

      // Aggregate the price into a candle
      aggregateTick(update.price, providerTimestamp.getTime());
    };

    // Listen for connection status changes
    const handleConnectionUpdate = (update: MarketConnectionUpdate) => {
      console.log('[useMarketWebSocket] Connection update:', update);

      setStatus(prev => ({
        ...prev,
        providerConnected: update.status === 'CONNECTED',
        provider: update.provider,
        error: update.status === 'DISCONNECTED' ? update.reason || 'Disconnected' : null,
      }));
    };

    socket.on('market:price', handlePriceUpdate);
    socket.on('market:connection', handleConnectionUpdate);

    // Cleanup on unmount or when symbols change
    return () => {
      console.log('[useMarketWebSocket] Unsubscribing from:', symbols);
      socket.emit('market:unsubscribe', { symbols });
      socket.off('market:price', handlePriceUpdate);
      socket.off('market:connection', handleConnectionUpdate);
    };
    // ✅ FIXED: Use symbolsKey instead of symbols array to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, symbolsKey, enabled, aggregateTick]);

  // Reset candle aggregation when timeframe or symbols change
  useEffect(() => {
    currentCandleRef.current = null;
    setLatestCandle(null);
    // ✅ FIXED: Use symbolsKey instead of symbols array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, symbolsKey]);

  return {
    status,
    latestCandle,
    clearLatestCandle,
  };
}
