import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';

/**
 * Alpha Vantage Provider Service
 * 
 * Free tier: 25 API calls per day, 5 calls per minute
 * Documentation: https://www.alphavantage.co/documentation/
 * 
 * Supports:
 * - Forex (FX) pairs
 * - Stocks
 * - Crypto
 * - Commodities (limited)
 */

export interface AlphaVantageQuote {
  '01. symbol': string;
  '02. open': string;
  '03. high': string;
  '04. low': string;
  '05. price': string;
  '06. volume': string;
  '07. latest trading day': string;
  '08. previous close': string;
  '09. change': string;
  '10. change percent': string;
}

export interface AlphaVantageCandle {
  timestamp: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume?: number;
}

@Injectable()
export class AlphaVantageProvider {
  private readonly logger = new Logger(AlphaVantageProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://www.alphavantage.co/query';
  
  // Rate limiting
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = 12000; // 5 req/min = 12s between requests
  
  // Statistics
  private stats = {
    restRequests: 0,
    restErrors: 0,
    lastSuccessfulUpdate: null as Date | null,
    rateLimitHits: 0,
  };

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ALPHA_VANTAGE_API_KEY', '');
    
    if (!this.apiKey) {
      this.logger.warn('⚠️  ALPHA_VANTAGE_API_KEY not configured. Provider disabled.');
    } else {
      this.logger.log('✓ Alpha Vantage provider initialized');
    }
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get provider status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      stats: this.stats,
    };
  }

  /**
   * Rate limit check - ensure we don't exceed 5 req/min
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestIntervalMs) {
      const waitTime = this.minRequestIntervalMs - timeSinceLastRequest;
      this.logger.debug(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get latest quote for a symbol
   * 
   * Uses GLOBAL_QUOTE endpoint for stocks
   * Uses CURRENCY_EXCHANGE_RATE for forex pairs
   */
  async getQuote(symbol: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Alpha Vantage API key not configured');
    }

    await this.enforceRateLimit();
    this.stats.restRequests++;

    try {
      // Detect symbol type
      const isForex = symbol.includes('/') || (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol));
      
      if (isForex) {
        return await this.getForexQuote(symbol);
      } else {
        return await this.getStockQuote(symbol);
      }
    } catch (error) {
      this.stats.restErrors++;
      throw error;
    }
  }

  /**
   * Get forex quote
   */
  private async getForexQuote(symbol: string): Promise<any> {
    // Convert symbol format: EUR/USD or EURUSD -> from=EUR, to=USD
    const [fromCurrency, toCurrency] = symbol.includes('/')
      ? symbol.split('/')
      : [symbol.slice(0, 3), symbol.slice(3)];

    const url = `${this.baseUrl}?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${this.apiKey}`;
    
    this.logger.debug(`Fetching forex quote: ${fromCurrency}/${toCurrency}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    
    // Check for rate limit or error
    if (data['Note']) {
      this.stats.rateLimitHits++;
      throw new Error('Alpha Vantage rate limit exceeded');
    }
    
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }
    
    if (!data['Realtime Currency Exchange Rate']) {
      throw new Error('Invalid forex quote response');
    }

    const rate = data['Realtime Currency Exchange Rate'];
    this.stats.lastSuccessfulUpdate = new Date();
    
    return {
      symbol: `${fromCurrency}/${toCurrency}`,
      price: rate['5. Exchange Rate'],
      bid: rate['8. Bid Price'],
      ask: rate['9. Ask Price'],
      datetime: rate['6. Last Refreshed'],
      provider: 'ALPHA_VANTAGE',
    };
  }

  /**
   * Get stock quote
   */
  private async getStockQuote(symbol: string): Promise<any> {
    const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
    
    this.logger.debug(`Fetching stock quote: ${symbol}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();
    
    // Check for rate limit or error
    if (data['Note']) {
      this.stats.rateLimitHits++;
      throw new Error('Alpha Vantage rate limit exceeded');
    }
    
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }
    
    if (!data['Global Quote']) {
      throw new Error('Invalid stock quote response');
    }

    const quote = data['Global Quote'];
    this.stats.lastSuccessfulUpdate = new Date();
    
    return {
      symbol: quote['01. symbol'],
      open: quote['02. open'],
      high: quote['03. high'],
      low: quote['04. low'],
      close: quote['05. price'],
      price: quote['05. price'],
      volume: quote['06. volume'],
      datetime: quote['07. latest trading day'],
      provider: 'ALPHA_VANTAGE',
    };
  }

  /**
   * Get historical time series data
   * 
   * Alpha Vantage intervals:
   * - Intraday: 1min, 5min, 15min, 30min, 60min
   * - Daily: Daily
   * - Weekly: Weekly
   * - Monthly: Monthly
   */
  async getTimeSeries(
    symbol: string,
    interval: string,
    outputsize: number = 100,
  ): Promise<AlphaVantageCandle[]> {
    if (!this.isConfigured()) {
      throw new Error('Alpha Vantage API key not configured');
    }

    await this.enforceRateLimit();
    this.stats.restRequests++;

    try {
      // Detect symbol type
      const isForex = symbol.includes('/') || (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol));
      
      if (isForex) {
        return await this.getForexTimeSeries(symbol, interval, outputsize);
      } else {
        return await this.getStockTimeSeries(symbol, interval, outputsize);
      }
    } catch (error) {
      this.stats.restErrors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch time series for ${symbol}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get forex time series
   */
  private async getForexTimeSeries(
    symbol: string,
    interval: string,
    outputsize: number,
  ): Promise<AlphaVantageCandle[]> {
    // Convert symbol format
    const [fromCurrency, toCurrency] = symbol.includes('/')
      ? symbol.split('/')
      : [symbol.slice(0, 3), symbol.slice(3)];

    // Map interval to Alpha Vantage format
    const intervalMap: Record<string, { function: string; interval?: string }> = {
      '1min': { function: 'FX_INTRADAY', interval: '1min' },
      '5min': { function: 'FX_INTRADAY', interval: '5min' },
      '15min': { function: 'FX_INTRADAY', interval: '15min' },
      '30min': { function: 'FX_INTRADAY', interval: '30min' },
      '1h': { function: 'FX_INTRADAY', interval: '60min' },
      '1hour': { function: 'FX_INTRADAY', interval: '60min' },
      '60min': { function: 'FX_INTRADAY', interval: '60min' },
      '1day': { function: 'FX_DAILY' },
      'daily': { function: 'FX_DAILY' },
    };

    const mapping = intervalMap[interval.toLowerCase()];
    if (!mapping) {
      throw new Error(`Unsupported interval: ${interval}`);
    }

    let url = `${this.baseUrl}?function=${mapping.function}&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&apikey=${this.apiKey}&outputsize=full`;
    
    if (mapping.interval) {
      url += `&interval=${mapping.interval}`;
    }

    this.logger.log(`Fetching forex candles: ${fromCurrency}/${toCurrency} ${interval}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    
    // Check for rate limit or error
    if (data['Note']) {
      this.stats.rateLimitHits++;
      throw new Error('Alpha Vantage rate limit exceeded');
    }
    
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    // Get time series data
    const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));
    if (!timeSeriesKey || !data[timeSeriesKey]) {
      throw new Error('No time series data in response');
    }

    const timeSeries = data[timeSeriesKey];
    const candles: AlphaVantageCandle[] = [];

    for (const [datetime, values] of Object.entries(timeSeries)) {
      candles.push({
        timestamp: new Date(datetime),
        open: new Decimal(values['1. open']),
        high: new Decimal(values['2. high']),
        low: new Decimal(values['3. low']),
        close: new Decimal(values['4. close']),
      });
      
      if (candles.length >= outputsize) break;
    }

    // Sort chronologically (oldest first)
    candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    this.stats.lastSuccessfulUpdate = new Date();
    this.logger.log(`✅ Fetched ${candles.length} forex candles for ${fromCurrency}/${toCurrency}`);
    
    return candles;
  }

  /**
   * Get stock time series
   */
  private async getStockTimeSeries(
    symbol: string,
    interval: string,
    outputsize: number,
  ): Promise<AlphaVantageCandle[]> {
    // Map interval to Alpha Vantage format
    const intervalMap: Record<string, { function: string; interval?: string }> = {
      '1min': { function: 'TIME_SERIES_INTRADAY', interval: '1min' },
      '5min': { function: 'TIME_SERIES_INTRADAY', interval: '5min' },
      '15min': { function: 'TIME_SERIES_INTRADAY', interval: '15min' },
      '30min': { function: 'TIME_SERIES_INTRADAY', interval: '30min' },
      '1h': { function: 'TIME_SERIES_INTRADAY', interval: '60min' },
      '1hour': { function: 'TIME_SERIES_INTRADAY', interval: '60min' },
      '60min': { function: 'TIME_SERIES_INTRADAY', interval: '60min' },
      '1day': { function: 'TIME_SERIES_DAILY' },
      'daily': { function: 'TIME_SERIES_DAILY' },
    };

    const mapping = intervalMap[interval.toLowerCase()];
    if (!mapping) {
      throw new Error(`Unsupported interval: ${interval}`);
    }

    let url = `${this.baseUrl}?function=${mapping.function}&symbol=${symbol}&apikey=${this.apiKey}&outputsize=full`;
    
    if (mapping.interval) {
      url += `&interval=${mapping.interval}`;
    }

    this.logger.log(`Fetching stock candles: ${symbol} ${interval}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    
    // Check for rate limit or error
    if (data['Note']) {
      this.stats.rateLimitHits++;
      throw new Error('Alpha Vantage rate limit exceeded');
    }
    
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    // Get time series data
    const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));
    if (!timeSeriesKey || !data[timeSeriesKey]) {
      throw new Error('No time series data in response');
    }

    const timeSeries = data[timeSeriesKey];
    const candles: AlphaVantageCandle[] = [];

    for (const [datetime, values] of Object.entries(timeSeries)) {
      candles.push({
        timestamp: new Date(datetime),
        open: new Decimal(values['1. open']),
        high: new Decimal(values['2. high']),
        low: new Decimal(values['3. low']),
        close: new Decimal(values['4. close']),
        volume: parseInt(values['5. volume'], 10),
      });
      
      if (candles.length >= outputsize) break;
    }

    // Sort chronologically (oldest first)
    candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    this.stats.lastSuccessfulUpdate = new Date();
    this.logger.log(`✅ Fetched ${candles.length} stock candles for ${symbol}`);
    
    return candles;
  }
}
