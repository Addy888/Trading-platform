import { useEffect, useState, useCallback, useRef } from 'react';
import { quotaManager } from '@/lib/quota-manager';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface TwelveDataQuote {
  symbol: string;
  close?: string;
  price?: string;
  timestamp?: number;
  cached?: boolean;
  cacheAge?: number;
  provider?: string;
}

interface ProviderStatus {
  primaryProvider: string;
  providers: {
    [key: string]: {
      status: string;
      requestCount: number;
      cacheHits: number;
      errorCount: number;
      quotaExhaustedAt: string | null;
      quotaResetTime: string | null;
      hoursUntilReset: number | null;
    };
  };
  quoteCacheSize: number;
  candleCacheSize: number;
  subscribedSymbols: string[];
  pollingActive: boolean;
}

/**
 * Custom hook to fetch Twelve Data quotes with STRICT quota protection
 * 
 * Day 4: Initial implementation
 * Day 7: Added provider status checking and quota exhaustion handling
 * Day 7 HOTFIX: Shared quota state, stops ALL polling immediately on exhaustion
 * 
 * CRITICAL: Uses shared QuotaManager to coordinate across all components
 */
export function useTwelveDataQuotes(
  symbols: string[],
  pollingInterval: number = 20000,
  enabled: boolean = true
) {
  const [quotes, setQuotes] = useState<Record<string, TwelveDataQuote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  /**
   * CRITICAL: Stop all polling immediately
   */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    
    // Abort any in-flight requests
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
      fetchAbortControllerRef.current = null;
    }
    
    isPollingRef.current = false;
  }, []);

  /**
   * Check provider status from backend
   */
  const checkProviderStatus = useCallback(async (): Promise<boolean> => {
    // CRITICAL: Check shared quota state FIRST
    if (quotaManager.isQuotaExhausted()) {
      const statusMsg = quotaManager.getStatusMessage();
      if (statusMsg) {
        setError(statusMsg);
      }
      return false; // Don't poll
    }

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return true;

      const response = await fetch(`${API_BASE_URL}/market/twelvedata/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.error('[useTwelveDataQuotes] Failed to fetch provider status:', response.status);
        return true; // Continue polling on error
      }

      const data: ProviderStatus = await response.json();
      setProviderStatus(data);

      // Check if primary provider (TWELVE_DATA) is quota exhausted
      const twelveDataStatus = data.providers?.TWELVE_DATA;
      if (twelveDataStatus && twelveDataStatus.status === 'QUOTA_EXHAUSTED') {
        // Parse reset time
        const resetTime = twelveDataStatus.quotaResetTime 
          ? new Date(twelveDataStatus.quotaResetTime).getTime()
          : null;

        // Set shared quota state
        quotaManager.setExhausted(
          'Twelve Data',
          resetTime,
          `Daily quota exhausted. ${twelveDataStatus.hoursUntilReset !== null ? `Resets in ${twelveDataStatus.hoursUntilReset}h` : 'Wait for quota reset'}`
        );

        setError(quotaManager.getStatusMessage());
        
        // CRITICAL: Stop ALL polling immediately
        stopPolling();
        
        return false;
      }

      return true; // OK to poll
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[useTwelveDataQuotes] Provider status check error:', err);
      }
      return true; // Continue polling on error
    }
  }, [stopPolling]);

  /**
   * Fetch quotes for symbols with batching
   */
  const fetchQuotes = useCallback(async () => {
    // CRITICAL: Check shared quota state before ANY request
    if (quotaManager.isQuotaExhausted()) {
      setError(quotaManager.getStatusMessage());
      stopPolling();
      setLoading(false);
      return;
    }

    if (!enabled || symbols.length === 0 || isPollingRef.current) {
      setLoading(false);
      return;
    }

    // Check provider status first
    const canPoll = await checkProviderStatus();
    if (!canPoll) {
      setLoading(false);
      return;
    }

    isPollingRef.current = true;
    setLoading(true);
    setError(null);

    // Create abort controller for this fetch
    fetchAbortControllerRef.current = new AbortController();

    try {
      const newQuotes: Record<string, TwelveDataQuote> = {};
      const batchSize = 2;
      const batchDelay = 500;

      // Process symbols in batches
      for (let i = 0; i < symbols.length; i += batchSize) {
        if (!isMountedRef.current || quotaManager.isQuotaExhausted()) break;

        const batch = symbols.slice(i, i + batchSize);

        // Fetch quotes in parallel for current batch
        const batchPromises = batch.map(async (symbol) => {
          // Check quota state before each request
          if (quotaManager.isQuotaExhausted()) {
            return;
          }

          try {
            const token = localStorage.getItem('accessToken');
            if (!token) return;

            const response = await fetch(
              `${API_BASE_URL}/market/twelvedata/quote/${symbol}?mode=LIVE`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
                signal: fetchAbortControllerRef.current?.signal,
              }
            );

            if (!response.ok) {
              if (response.status === 429) {
                // Don't log individual 429s - will be caught by status check
                return;
              }
              return;
            }

            const data: {
              success: boolean;
              symbol: string;
              mode: string;
              quote: TwelveDataQuote;
              error?: string;
            } = await response.json();

            if (data.success && data.quote) {
              newQuotes[symbol] = data.quote;
            } else if (data.error) {
              // Check for quota exhaustion in error message
              if (data.error.includes('quota exhausted') || 
                  data.error.includes('run out of API credits') ||
                  data.error.includes('Circuit breaker')) {
                
                // Extract reset time if available
                let resetTime: number | null = null;
                const match = data.error.match(/(\d+)h from now/);
                if (match) {
                  const hours = parseInt(match[1], 10);
                  resetTime = Date.now() + (hours * 3600000);
                }

                quotaManager.setExhausted('Twelve Data', resetTime, data.error);
                setError(quotaManager.getStatusMessage());
                stopPolling();
                return;
              }
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              // Request was aborted - this is expected during cleanup
              return;
            }
            // Don't log - will be caught by status check
          }
        });

        await Promise.all(batchPromises);

        // Check quota again before delay
        if (quotaManager.isQuotaExhausted()) {
          break;
        }

        // Add delay between batches
        if (i + batchSize < symbols.length && isMountedRef.current) {
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }

      if (isMountedRef.current && Object.keys(newQuotes).length > 0) {
        setQuotes(newQuotes);
        setError(null);
      } else if (isMountedRef.current && Object.keys(newQuotes).length === 0 && !quotaManager.isQuotaExhausted()) {
        setError('No quotes available');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && isMountedRef.current) {
        console.error('[useTwelveDataQuotes] Fetch error:', err);
        setError(err.message || 'Failed to fetch market data');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      isPollingRef.current = false;
      fetchAbortControllerRef.current = null;
    }
  }, [enabled, symbols, checkProviderStatus, stopPolling]);

  // Subscribe to shared quota state changes
  useEffect(() => {
    const unsubscribe = quotaManager.subscribe((state) => {
      if (state.isExhausted) {
        setError(quotaManager.getStatusMessage());
        stopPolling();
      }
    });

    return unsubscribe;
  }, [stopPolling]);

  // Setup polling (only runs once on mount or when critical deps change)
  useEffect(() => {
    isMountedRef.current = true;

    // Clear existing timer
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!enabled || symbols.length === 0) {
      setLoading(false);
      return;
    }

    // CRITICAL: Check quota state before starting
    if (quotaManager.isQuotaExhausted()) {
      setError(quotaManager.getStatusMessage());
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchQuotes();

    // Setup polling interval
    pollTimerRef.current = setInterval(() => {
      // Check quota before each poll
      if (quotaManager.isQuotaExhausted()) {
        stopPolling();
        return;
      }
      fetchQuotes();
    }, pollingInterval);

    // Cleanup
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [enabled, symbols.join(','), pollingInterval]); // Stable deps - won't cause re-polling

  return {
    quotes,
    loading,
    error,
    providerStatus,
    quotaExhausted: quotaManager.isQuotaExhausted(),
    refetch: fetchQuotes,
  };
}
