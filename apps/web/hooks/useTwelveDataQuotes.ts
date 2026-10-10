'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { marketApi, type TwelveDataQuote } from '@/lib/market-api';

export interface QuoteData {
  symbol: string;
  bid: string;
  ask: string;
  spread: string;
  timestamp: string;
  isMarketOpen: boolean;
  status: 'LIVE' | 'DELAYED' | 'STALE' | 'UNAVAILABLE' | 'LOADING' | 'ERROR';
  source: 'TWELVEDATA' | 'SIMULATED';
}

interface UseTwelveDataQuotesOptions {
  symbols: string[];
  accessToken: string | null;
  enabled?: boolean;
  pollingInterval?: number; // milliseconds
}

export function useTwelveDataQuotes({
  symbols,
  accessToken,
  enabled = true,
  pollingInterval = 5000, // 5 seconds default
}: UseTwelveDataQuotesOptions) {
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const fetchQuote = useCallback(
    async (symbol: string): Promise<QuoteData | null> => {
      if (!accessToken) return null;

      try {
        const result = await marketApi.getTwelveDataQuote(accessToken, symbol);

        if (!result.success || !result.quote) {
          return {
            symbol,
            bid: '0',
            ask: '0',
            spread: '0',
            timestamp: new Date().toISOString(),
            isMarketOpen: false,
            status: 'UNAVAILABLE',
            source: 'TWELVEDATA',
          };
        }

        const quote = result.quote;
        const close = parseFloat(quote.close);
        
        // Calculate bid/ask spread (typical Forex spread ~0.0001)
        const spread = close * 0.0001;
        const bid = close - spread / 2;
        const ask = close + spread / 2;

        // Determine status based on market open and data age
        const dataAge = Date.now() - new Date(quote.datetime).getTime();
        let status: QuoteData['status'] = 'LIVE';
        
        if (!quote.is_market_open) {
          status = 'DELAYED';
        } else if (dataAge > 60000) {
          // Data older than 1 minute considered stale
          status = 'STALE';
        }

        return {
          symbol: quote.symbol,
          bid: bid.toFixed(5),
          ask: ask.toFixed(5),
          spread: spread.toFixed(5),
          timestamp: quote.datetime,
          isMarketOpen: quote.is_market_open,
          status,
          source: 'TWELVEDATA',
        };
      } catch (err: any) {
        console.error(`Failed to fetch quote for ${symbol}:`, err);
        return {
          symbol,
          bid: '0',
          ask: '0',
          spread: '0',
          timestamp: new Date().toISOString(),
          isMarketOpen: false,
          status: 'ERROR',
          source: 'TWELVEDATA',
        };
      }
    },
    [accessToken]
  );

  const fetchAllQuotes = useCallback(async () => {
    if (!accessToken || !enabled || symbols.length === 0) {
      return;
    }

    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      // Fetch all quotes in parallel (backend caching prevents overload)
      const quotePromises = symbols.map((symbol) => fetchQuote(symbol));
      const results = await Promise.all(quotePromises);

      if (!isMountedRef.current) return;

      const newQuotes: Record<string, QuoteData> = {};
      results.forEach((quoteData) => {
        if (quoteData) {
          newQuotes[quoteData.symbol] = quoteData;
        }
      });

      setQuotes(newQuotes);
      setLastUpdate(new Date());
    } catch (err: any) {
      if (!isMountedRef.current) return;
      if (err.name === 'AbortError') return;
      
      console.error('Failed to fetch quotes:', err);
      setError(err.message || 'Failed to fetch market data');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [accessToken, enabled, symbols, fetchQuote]);

  // Initial fetch
  useEffect(() => {
    fetchAllQuotes();
  }, [fetchAllQuotes]);

  // Polling
  useEffect(() => {
    if (!enabled || !accessToken) {
      return;
    }

    // Clear existing timer
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
    }

    // Set up polling
    const poll = () => {
      fetchAllQuotes();
      pollingTimerRef.current = setTimeout(poll, pollingInterval);
    };

    pollingTimerRef.current = setTimeout(poll, pollingInterval);

    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, [enabled, accessToken, pollingInterval, fetchAllQuotes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const refetch = useCallback(() => {
    fetchAllQuotes();
  }, [fetchAllQuotes]);

  return {
    quotes,
    loading,
    error,
    lastUpdate,
    refetch,
  };
}
