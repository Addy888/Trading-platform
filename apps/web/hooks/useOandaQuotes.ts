'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { marketApi, OandaMarketDataError } from '@/lib/market-api';

export type OandaQuote = {
  bid: string;
  ask: string;
  spread: string;
  price: string;
  timestamp: string;
};

export function useOandaQuotes(symbols: string[], intervalMs: number, token?: string, enabled = true) {
  const [quotes, setQuotes] = useState<Record<string, OandaQuote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);
  const failureCountRef = useRef(0);
  const symbolKey = symbols.join(',');

  const fetchQuotes = useCallback(async (generation: number): Promise<number | null> => {
    if (generation !== fetchGenerationRef.current) return null;
    if (!enabled) return null;
    if (!token || !symbolKey) {
      setQuotes({});
      setError(token ? null : 'Sign in to load OANDA market data.');
      return null;
    }
    setLoading(true);
    const results = await Promise.allSettled(
      symbolKey.split(',').map(async (symbol) => {
        const response = await marketApi.getOandaQuote(token, symbol);
        const { bid, ask, spread, price, timestamp } = response.quote;
        return [symbol, {
          bid,
          ask,
          spread,
          price,
          timestamp,
        }] as const;
      }),
    );
    const successful = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (generation !== fetchGenerationRef.current) return null;
    if (successful.length) {
      setQuotes(Object.fromEntries(successful));
      if (!failures.length) failureCountRef.current = 0;
    } else {
      setQuotes({});
    }
    const firstError = failures[0];
    setError(firstError instanceof Error ? firstError.message : null);
    setLoading(false);

    if (!failures.length) return intervalMs;
    const retryable = failures.filter((failure) =>
      !(failure instanceof OandaMarketDataError) || failure.retryable,
    );
    if (successful.length && retryable.length === 0) return intervalMs;
    if (retryable.length === 0) return null;
    failureCountRef.current = Math.min(failureCountRef.current + 1, 6);
    const retryAfter = Math.max(...retryable.map((failure) =>
      failure instanceof OandaMarketDataError ? failure.retryAfterMs || 0 : 0,
    ));
    const backoff = Math.min(intervalMs * (2 ** failureCountRef.current), 120000);
    return Math.max(intervalMs, retryAfter, backoff);
  }, [enabled, intervalMs, symbolKey, token]);

  const refresh = useCallback(() => {
    if (enabled) void fetchQuotes(fetchGenerationRef.current);
  }, [enabled, fetchQuotes]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const generation = ++fetchGenerationRef.current;
    if (!enabled) {
      setQuotes({});
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
        if (generation === fetchGenerationRef.current) fetchGenerationRef.current++;
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
      if (generation === fetchGenerationRef.current) fetchGenerationRef.current++;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, fetchQuotes]);

  return { quotes, loading, error, refresh };
}
