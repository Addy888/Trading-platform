/**
 * Symbol Normalization Utility
 * 
 * Converts between different symbol formats:
 * - Internal format: EURUSD, GBPUSD (no separator)
 * - Twelve Data format: EUR/USD, GBP/USD (slash separator)
 * - Alpha Vantage format: EUR/USD or EURUSD (both supported)
 */

export class SymbolNormalizer {
  /**
   * Common forex pairs mapping (internal -> Twelve Data format)
   */
  private static readonly FOREX_PAIRS: Record<string, string> = {
    'EURUSD': 'EUR/USD',
    'GBPUSD': 'GBP/USD',
    'USDJPY': 'USD/JPY',
    'AUDUSD': 'AUD/USD',
    'USDCAD': 'USD/CAD',
    'USDCHF': 'USD/CHF',
    'NZDUSD': 'NZD/USD',
    'EURGBP': 'EUR/GBP',
    'EURJPY': 'EUR/JPY',
    'GBPJPY': 'GBP/JPY',
    'AUDJPY': 'AUD/JPY',
    'EURAUD': 'EUR/AUD',
    'EURCHF': 'EUR/CHF',
    'AUDNZD': 'AUD/NZD',
    'NZDJPY': 'NZD/JPY',
  };

  /**
   * Convert internal symbol format to Twelve Data format
   * 
   * Examples:
   * - EURUSD -> EUR/USD
   * - EUR/USD -> EUR/USD (already correct)
   * - AAPL -> AAPL (stock symbols unchanged)
   * - BTC/USD -> BTC/USD (crypto already correct)
   */
  static toTwelveDataFormat(symbol: string): string {
    // Already has slash - return as is
    if (symbol.includes('/')) {
      return symbol;
    }

    // Check if it's a known forex pair
    const upperSymbol = symbol.toUpperCase();
    if (this.FOREX_PAIRS[upperSymbol]) {
      return this.FOREX_PAIRS[upperSymbol];
    }

    // Try to detect forex pair pattern (6 letters, all alpha)
    if (/^[A-Z]{6}$/.test(upperSymbol)) {
      // Split into two 3-letter currency codes
      const base = upperSymbol.substring(0, 3);
      const quote = upperSymbol.substring(3, 6);
      return `${base}/${quote}`;
    }

    // Not a forex pair - return as is (stocks, indices, etc)
    return symbol;
  }

  /**
   * Convert Twelve Data format back to internal format
   * 
   * Examples:
   * - EUR/USD -> EURUSD
   * - AAPL -> AAPL (unchanged)
   */
  static toInternalFormat(symbol: string): string {
    if (symbol.includes('/')) {
      return symbol.replace('/', '');
    }
    return symbol.toUpperCase();
  }

  /**
   * Normalize symbol for display (adds slash for forex)
   */
  static toDisplayFormat(symbol: string): string {
    return this.toTwelveDataFormat(symbol);
  }

  /**
   * Check if symbol is a forex pair
   */
  static isForexPair(symbol: string): boolean {
    const upperSymbol = symbol.toUpperCase();
    return this.FOREX_PAIRS.hasOwnProperty(upperSymbol) || 
           /^[A-Z]{6}$/.test(upperSymbol) ||
           (symbol.includes('/') && symbol.split('/').length === 2);
  }

  /**
   * Get all supported forex pairs
   */
  static getSupportedForexPairs(): string[] {
    return Object.keys(this.FOREX_PAIRS);
  }

  /**
   * Normalize interval for Twelve Data API
   * 
   * Twelve Data supported intervals:
   * 1min, 5min, 15min, 30min, 45min, 1h, 2h, 4h, 8h, 1day, 1week, 1month
   * 
   * Maps unsupported intervals to nearest supported:
   * - 10min -> 15min (round up for safety)
   * - 1m -> 1min
   * - 5m -> 5min
   * - 1H -> 1h
   * - 1D -> 1day
   * - 4H -> 4h
   */
  static normalizeInterval(interval: string): string {
    const normalized = interval.toLowerCase().trim();

    // Map common variations
    const intervalMap: Record<string, string> = {
      // Standard format with 'min'
      '1min': '1min',
      '5min': '5min',
      '10min': '15min', // 10min not supported, use 15min
      '15min': '15min',
      '30min': '30min',
      '45min': '45min',
      
      // Short format (m)
      '1m': '1min',
      '5m': '5min',
      '10m': '15min', // 10min not supported, use 15min
      '15m': '15min',
      '30m': '30min',
      '45m': '45min',
      
      // Hour format
      '1h': '1h',
      '2h': '2h',
      '4h': '4h',
      '8h': '8h',
      
      // Alternative hour format
      '1hour': '1h',
      '2hour': '2h',
      '4hour': '4h',
      '8hour': '8h',
      
      // Day format
      '1d': '1day',
      '1day': '1day',
      '1week': '1week',
      '1month': '1month',
    };

    return intervalMap[normalized] || normalized;
  }

  /**
   * Get interval in minutes for calculations
   */
  static getIntervalMinutes(interval: string): number {
    const normalized = this.normalizeInterval(interval);
    
    const minutesMap: Record<string, number> = {
      '1min': 1,
      '5min': 5,
      '15min': 15,
      '30min': 30,
      '45min': 45,
      '1h': 60,
      '2h': 120,
      '4h': 240,
      '8h': 480,
      '1day': 1440,
      '1week': 10080,
      '1month': 43200,
    };

    return minutesMap[normalized] || 60; // Default to 1 hour
  }
}
