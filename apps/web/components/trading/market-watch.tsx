'use client';

import type { MarketInstrument } from '@/lib/market-api';

interface MarketWatchProps {
  symbols: string[];
  quotes: Record<string, { price: string; timestamp: string; fetchedAt: string | null; receivedAt: string }>;
  instruments?: Record<string, MarketInstrument>;
  selectedSymbol: string;
  onSymbolSelect: (symbol: string) => void;
  loading?: boolean;
  dataSource?: 'TWELVE_DATA';
  unavailableMessage?: string | null;
  staleThresholdMs?: number;
  currentTimeMs?: number | null;
}

export function MarketWatch({ 
  symbols, 
  quotes, 
  instruments = {},
  selectedSymbol, 
  onSymbolSelect,
  loading = false,
  dataSource,
  unavailableMessage,
  staleThresholdMs = 20 * 60_000,
  currentTimeMs = null,
}: MarketWatchProps) {
  const formatPrice = (price: string, decimals: number = 5) => {
    const num = parseFloat(price);
    return isNaN(num) ? '-.-----' : num.toFixed(decimals);
  };

  const getDecimals = (symbol: string): number => {
    if (symbol.includes('JPY')) return 3;
    if (symbol.includes('XAU') || symbol.includes('XAG') || symbol.includes('WTI')) return 2;
    if (symbol.includes('BTC') || symbol.includes('ETH')) return 2;
    return 5;
  };

  return (
    <div className="bg-gray-900 text-white p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Market Watch
        </h3>
        {loading && (
          <div className="text-xs text-blue-400 flex items-center gap-1">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Updating...</span>
          </div>
        )}
      </div>
      
      {dataSource && (
        <div className="mb-3 px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 text-center">
          Source: {dataSource} · display-only prices
        </div>
      )}
      {unavailableMessage && (
        <div className="mb-3 px-2 py-2 bg-amber-950/50 rounded text-xs text-amber-200">
          {unavailableMessage}
        </div>
      )}
      
      <div className="space-y-1">
        {symbols.map((symbol) => {
          const quote = quotes[symbol];
          const instrument = instruments[symbol];
          const isSelected = symbol === selectedSymbol;
          const decimals = getDecimals(symbol);
          const timestamp = quote ? Date.parse(quote.timestamp) : Number.NaN;
          const ageMs = currentTimeMs === null ? Number.NaN : timestamp - currentTimeMs;
          const isFresh = Number.isFinite(ageMs) && ageMs <= 0 && ageMs >= -staleThresholdMs;

          return (
            <button
              key={symbol}
              onClick={() => onSymbolSelect(symbol)}
              className={`w-full text-left p-3 rounded transition-colors border ${
                isSelected
                  ? 'bg-blue-600 hover:bg-blue-700 border-blue-500'
                  : 'bg-gray-800 hover:bg-gray-750 border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{symbol}</span>
                <span
                  className="text-[10px] text-gray-400"
                  title={quote ? `Provider quote time: ${new Date(timestamp).toISOString()}\nServer fetched: ${quote.fetchedAt || 'unavailable'}\nApp received: ${quote.receivedAt}` : undefined}
                >
                  {Number.isFinite(timestamp)
                    ? new Date(timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                    : 'No quote'}
                </span>
              </div>
              <div className="mb-1 text-[11px] text-gray-300">
                {instrument?.name || 'Instrument name unavailable'}
              </div>
              <div className="mb-2 flex flex-wrap gap-x-2 text-[10px] text-gray-500">
                <span>{instrument?.assetType || 'Category unavailable'}</span>
                {instrument?.exchange && <span>{instrument.exchange}</span>}
                {instrument?.country && <span>{instrument.country}</span>}
                {instrument?.currency && <span>Quote {instrument.currency}</span>}
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase text-gray-400">Last · display-only</span>
                <div className="font-mono text-white font-semibold text-sm">
                  {formatPrice(quote?.price || '', decimals)}
                </div>
              </div>
              <div className="mt-1 text-right text-[10px] text-gray-500">
                {Number.isFinite(timestamp)
                  ? !Number.isFinite(ageMs)
                    ? 'Checking provider timestamp'
                    : isFresh
                    ? `Provider update ${new Date(timestamp).toLocaleTimeString()}`
                    : ageMs > 0
                      ? 'Invalid future provider timestamp'
                      : 'Stale provider timestamp'
                  : 'Provider update unavailable'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
