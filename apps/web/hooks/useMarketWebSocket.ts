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
  status: 'CONNECTED' | 'DISCONNECTED' | 'HISTORICAL_ONLY';
  provider: string;
  connectedAt?: string;
  disconnectedAt?: string;
  code?: number;
  reason?: string;
  restriction?: string;
}

interface CandleUpdate {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Backend aggregated candle update from CandleAggregatorService
interface ForexCandleUpdate {
  symbol: string;
  timeframe: string;
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  providerTimestamp: string;
  serverReceivedTimestamp: string;
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
 * Subscribes to real-time aggregated candle updates from the backend.
 * The backend CandleAggregatorService converts Twelve Data ticks into OHLC candles.
 * 
 * @param socket Socket.IO connection (from useSocket hook)
 * @param symbols Array of symbols to subscribe to (e.g., ['EURUSD'])
 * @param enabled Whether to enable WebSocket subscriptions
 * @param timeframe Timeframe for candles (e.g., '1m', '5m', '1H')
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
  
  // Track current candle 
  const currentCandleRef = useRef<CandleUpdate | null>(null);

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

    console.log('[useMarketWebSocket] Subscribing to:', symbols, 'for timeframe:', timeframe);

    // Subscribe to symbols
    socket.emit('market:subscribe', { symbols }, (response: any) => {
      if (response?.success) {
        console.log('[useMarketWebSocket] ✅ Subscription successful:', {
          subscribed: response.subscribed,
          connectionState: response.connectionState,
          restriction: response.restriction,
        });
        setStatus(prev => ({
          ...prev,
          subscribed: response.subscribed || [],
          error: response.errors?.length ? response.errors.join(', ') : null,
        }));
      } else {
        console.error('[useMarketWebSocket] ❌ Subscription failed:', response);
        setStatus(prev => ({
          ...prev,
          error: response?.errors?.join(', ') || 'Subscription failed',
        }));
      }
    });

    // ✅ CRITICAL FIX: Listen for aggregated candle updates from backend
    // Backend CandleAggregatorService already converts ticks → candles
    const handleCandleUpdate = (update: ForexCandleUpdate) => {
      // Only process candles for our requested timeframe
      if (update.timeframe !== timeframe) {
        return;
      }

      console.log('[useMarketWebSocket] 📊 Candle update received:', {
        symbol: update.symbol,
        timeframe: update.timeframe,
        time: new Date(update.time * 1000).toISOString(),
        close: update.close,
        providerTimestamp: update.providerTimestamp,
      });

      const providerTimestamp = new Date(update.providerTimestamp);
      const frontendReceiveTime = new Date();

      setStatus(prev => ({
        ...prev,
        lastProviderUpdate: providerTimestamp,
        lastFrontendReceive: frontendReceiveTime,
        feedMode: 'WEBSOCKET',
        provider: 'TWELVE_DATA',
        providerConnected: true,
      }));

      // Use the backend-aggregated candle directly
      const candle: CandleUpdate = {
        time: update.time, // Already in Unix seconds
        open: update.open,
        high: update.high,
        low: update.low,
        close: update.close,
      };

      currentCandleRef.current = candle;
      setLatestCandle({ ...candle });

      console.log('[useMarketWebSocket] ✅ Candle state updated:', candle);
    };

    // Listen for connection status changes
    const handleConnectionUpdate = (update: MarketConnectionUpdate) => {
      console.log('[useMarketWebSocket] 🔌 Connection update:', update);

      setStatus(prev => ({
        ...prev,
        providerConnected: update.status === 'CONNECTED',
        provider: update.provider,
        error: update.status === 'DISCONNECTED' ? update.reason || 'Disconnected' : 
               update.status === 'HISTORICAL_ONLY' ? `WebSocket restricted: ${update.restriction}` : null,
      }));
    };

    // ✅ Listen for aggregated candles (not raw price ticks)
    socket.on('market:candle', handleCandleUpdate);
    socket.on('market:connection', handleConnectionUpdate);

    // Cleanup on unmount or when symbols change
    return () => {
      console.log('[useMarketWebSocket] Unsubscribing from:', symbols);
      socket.emit('market:unsubscribe', { symbols });
      socket.off('market:candle', handleCandleUpdate);
      socket.off('market:connection', handleConnectionUpdate);
    };
    // ✅ FIXED: Use symbolsKey instead of symbols array to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, symbolsKey, enabled, timeframe]);

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
