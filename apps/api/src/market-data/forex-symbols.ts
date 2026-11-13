export const FOREX_DISPLAY_NAMES: Record<string, string> = {
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD',
};

export const DEFAULT_FOREX_SYMBOLS = Object.keys(FOREX_DISPLAY_NAMES);

export function compactForexSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[/_]/g, '');
}

export function displayForexSymbol(symbol: string): string {
  const compact = compactForexSymbol(symbol);
  return FOREX_DISPLAY_NAMES[compact] || (compact.length === 6
    ? `${compact.slice(0, 3)}/${compact.slice(3)}`
    : symbol.trim());
}

export function providerForexSymbol(symbol: string): string {
  return displayForexSymbol(symbol);
}

export function marketRoomName(symbol: string): string {
  return `market:${compactForexSymbol(symbol)}`;
}

export const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000,
  '1min': 60_000,
  '5m': 5 * 60_000,
  '5min': 5 * 60_000,
  '15m': 15 * 60_000,
  '15min': 15 * 60_000,
  '30m': 30 * 60_000,
  '30min': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1day': 24 * 60 * 60_000,
};

export function intervalMs(interval: string): number {
  return TIMEFRAME_MS[interval.trim().toLowerCase()] || 60_000;
}

export function candleBucketUtc(timestampMs: number, intervalMilliseconds: number): number {
  return Math.floor(timestampMs / intervalMilliseconds) * intervalMilliseconds;
}
