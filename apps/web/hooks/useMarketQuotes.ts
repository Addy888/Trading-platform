'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { marketApi, MarketDataError } from '@/lib/market-api';

function invalidateFetchGeneration(generation: { current: number }): void {
  generation.current++;
}

export type MarketQuote = {
  price: string;
  change?: string;
  percentChange?: string;
  timestamp: string;
  fetchedAt: string | null;
  receivedAt: string;
};

export function useMarketQuotes(
  symbols: string[],
  intervalMs: number,
  token?: string,
  enabled = true,
  selectedSymbol?: string,
  selectedExchange?: string,
  exchangesBySymbol?: Record<string, string>,
) {
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [quotesForSymbols, setQuotesForSymbols] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorForSymbols, setErrorForSymbols] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);
  const failureCountRef = useRef(0);
  const inFlightRef = useRef(false);
  
  // ✅ FIX RATE LIMITS: Only poll the selected symbol to reduce API calls
  // Market Watch can display all symbols, but polling should only fetch the displayed one
  const symbolsToFetch = enabled && selectedSymbol && symbols.includes(selectedSymbol) ? [selectedSymbol] : [];
  const symbolKey = symbolsToFetch.join(',');

  const fetchQuotes = useCallback(async (generation: number): Promise<number | null> => {
    if (generation !== fetchGenerationRef.current) return null;
    if (!enabled) return null;
    if (inFlightRef.current) return intervalMs;
    if (!token || !symbolKey) {
      setQuotes({});
      setQuotesForSymbols(null);
      setLoading(false);
      setError(token ? null : 'Sign in to load Twelve Data market data.');
      setErrorForSymbols(symbolKey);
      return null;
    }
    inFlightRef.current = true;
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        symbolKey.split(',').map(async (symbol) => {
          const exchange = exchangesBySymbol?.[symbol] || (symbol === selectedSymbol ? selectedExchange : undefined);
          const response = await marketApi.getQuote(token, symbol, exchange);
          const { price, change, percentChange, timestamp } = response.quote;
          const serverFetchedAt = response.quote.fetchedAt ?? response.servedAt ?? response.timestamp ?? null;
          if (
            !Number.isFinite(Number(price)) ||
            Number(price) <= 0 ||
            !Number.isFinite(Date.parse(timestamp))
          ) {
            throw new MarketDataError('PROVIDER: Twelve Data returned an invalid latest price.', false, undefined, 'PROVIDER');
          }
          return [
            symbol,
            {
              price,
              change,
              percentChange,
              timestamp,
              fetchedAt: serverFetchedAt && Number.isFinite(Date.parse(serverFetchedAt)) ? serverFetchedAt : null,
              receivedAt: new Date().toISOString(),
            },
          ] as const;
        }),
      );
      const successful = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
      if (generation !== fetchGenerationRef.current) return null;

      if (successful.length > 0) {
        setQuotes((current) => ({ ...current, ...Object.fromEntries(successful) }));
        setQuotesForSymbols(symbolKey);
      }
      setError(failures[0] instanceof Error ? failures[0].message : null);
      setErrorForSymbols(symbolKey);
      if (!failures.length) {
        failureCountRef.current = 0;
        return intervalMs;
      }

      const retryable = failures.filter((failure) =>
        !(failure instanceof MarketDataError) || failure.retryable,
      );
      if (retryable.length === 0) return intervalMs;

      failureCountRef.current = Math.min(failureCountRef.current + 1, 6);
      const retryAfter = Math.max(...retryable.map((failure) =>
        failure instanceof MarketDataError ? failure.retryAfterMs || 0 : 0,
      ));
      const backoff = Math.min(intervalMs * (2 ** failureCountRef.current), 120000);
      return Math.max(intervalMs, retryAfter, backoff);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [enabled, exchangesBySymbol, intervalMs, selectedExchange, selectedSymbol, symbolKey, token]);

  const refresh = useCallback(() => {
    if (enabled) void fetchQuotes(fetchGenerationRef.current);
  }, [enabled, fetchQuotes]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const generation = ++fetchGenerationRef.current;
    if (!enabled) {
      return () => {
        cancelled = true;
        invalidateFetchGeneration(fetchGenerationRef);
      };
    }
    const poll = async () => {
      const delay = await fetchQuotes(generation);
      if (!cancelled && generation === fetchGenerationRef.current && delay !== null) {
        timer = setTimeout(poll, delay);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      invalidateFetchGeneration(fetchGenerationRef);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, fetchQuotes]);

  return {
    quotes: enabled && quotesForSymbols === symbolKey ? quotes : {},
    loading: enabled && loading,
    error: enabled && errorForSymbols === symbolKey ? error : null,
    refresh,
  };
}
