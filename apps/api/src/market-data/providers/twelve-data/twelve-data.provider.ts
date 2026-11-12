import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';

export type TwelveDataErrorCategory =
  | 'NOT_CONFIGURED'
  | 'INVALID_CREDENTIALS'
  | 'SUBSCRIPTION_RESTRICTED'
  | 'INSTRUMENT_UNAVAILABLE'
  | 'UNSUPPORTED_INTERVAL'
  | 'RATE_LIMITED'
  | 'EMPTY_CANDLES'
  | 'NETWORK'
  | 'PROVIDER';

export class TwelveDataApiError extends Error {
  constructor(
    readonly category: TwelveDataErrorCategory,
    message: string,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = 'TwelveDataApiError';
  }
}

export interface TwelveDataCandle {
  timestamp: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume?: number;
}

export type TwelveDataAssetType = 'FOREX' | 'CRYPTO' | 'COMMODITY' | 'STOCK' | 'OTHER';

export interface TwelveDataInstrument {
  symbol: string;
  name: string;
  assetType: TwelveDataAssetType;
  exchange: string | null;
  exchangeCode: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  source: 'TWELVE_DATA';
}

export interface TwelveDataExchange {
  name: string;
  displayName: string;
  code: string | null;
  marketType: 'STOCK' | 'CRYPTO';
  country: string | null;
  timezone: string | null;
  source: 'TWELVE_DATA';
}

type ProviderResponse = Record<string, unknown>;

function isRecord(value: unknown): value is ProviderResponse {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configuredTimeoutMs(): number {
  const parsed = Number(process.env.TWELVE_DATA_TIMEOUT_MS || 15_000);
  return Number.isFinite(parsed) ? Math.max(1_000, Math.min(parsed, 60_000)) : 15_000;
}

@Injectable()
export class TwelveDataProvider {
  private readonly logger = new Logger(TwelveDataProvider.name);
  private readonly apiKey = (process.env.TWELVE_DATA_API_KEY || '').trim();
  private readonly baseUrl = (process.env.TWELVE_DATA_API_BASE_URL || 'https://api.twelvedata.com').replace(/\/$/, '');
  private readonly timeoutMs = configuredTimeoutMs();
  private readonly directoryCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly directoryPending = new Map<string, Promise<unknown>>();
  private readonly symbolMap: Record<string, string> = {
    EURUSD: 'EUR/USD',
    GBPUSD: 'GBP/USD',
    USDJPY: 'USD/JPY',
    AUDUSD: 'AUD/USD',
    USDCAD: 'USD/CAD',
    BTCUSD: 'BTC/USD',
    ETHUSD: 'ETH/USD',
    XAUUSD: 'XAU/USD',
    XAGUSD: 'XAG/USD',
  };
  private readonly intervals: Record<string, string> = {
    '1m': '1min',
    '1min': '1min',
    '5m': '5min',
    '5min': '5min',
    '15m': '15min',
    '15min': '15min',
    '30m': '30min',
    '30min': '30min',
    '1h': '1h',
    '4h': '4h',
    '1d': '1day',
    '1day': '1day',
  };

  constructor() {
    if (!this.apiKey) this.logger.warn('Twelve Data is disabled: missing TWELVE_DATA_API_KEY.');
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  getConfigurationStatus() {
    return {
      configured: this.isConfigured(),
      missingVariables: this.apiKey ? [] : ['TWELVE_DATA_API_KEY'],
      apiBaseUrl: this.baseUrl,
      streamingConfigured: false,
      streamingMode: 'POLLING' as const,
    };
  }

  getSupportedSymbols(): string[] {
    return Object.keys(this.symbolMap);
  }

  normalizeSymbol(symbol: string): { normalized: string; providerSymbol: string } {
    const trimmed = symbol.trim().toUpperCase();
    const compact = trimmed.replace(/[\/_]/g, '');
    const mapped = this.symbolMap[compact];
    if (mapped) return { normalized: compact, providerSymbol: mapped };
    if (!/^[A-Z0-9][A-Z0-9./^_-]{0,31}$/.test(trimmed)) {
      throw new TwelveDataApiError('INSTRUMENT_UNAVAILABLE', 'The requested symbol format is not supported.');
    }
    return { normalized: trimmed, providerSymbol: trimmed };
  }

  normalizeInterval(interval: string): string {
    const providerInterval = this.intervals[interval.trim().toLowerCase()];
    if (!providerInterval) {
      throw new TwelveDataApiError('UNSUPPORTED_INTERVAL', `Unsupported Twelve Data interval: ${interval}.`);
    }
    return providerInterval;
  }

  async validateCredentials(): Promise<void> {
    await this.getTimeSeries('EURUSD', '1h', 1);
  }

  async getQuote(symbol: string, exchange?: string) {
    const { normalized, providerSymbol } = this.normalizeSymbol(symbol);
    const response = await this.request('/quote', this.withExchange({ symbol: providerSymbol }, exchange));
    if (!isRecord(response)) {
      throw new TwelveDataApiError('PROVIDER', `Twelve Data returned an invalid quote for ${normalized}.`);
    }
    const price = this.decimal(response.close ?? response.price, `latest price for ${normalized}`);
    const timestamp = this.timestamp(response.last_quote_at ?? response.timestamp ?? response.datetime);

    return {
      symbol: normalized,
      price: price.toString(),
      close: price.toString(),
      change: this.optionalDecimal(response.change, 'price change'),
      percentChange: this.optionalDecimal(response.percent_change, 'percentage change'),
      timestamp: timestamp.toISOString(),
      fetchedAt: new Date().toISOString(),
      provider: 'TWELVE_DATA' as const,
    };
  }

  async getTimeSeries(symbol: string, interval: string, count = 100, exchange?: string): Promise<TwelveDataCandle[]> {
    const { normalized, providerSymbol } = this.normalizeSymbol(symbol);
    const providerInterval = this.normalizeInterval(interval);
    
    // ✅ Diagnostic logging - safe, no secrets
    this.logger.log(`[getTimeSeries] Request: symbol=${providerSymbol}, interval=${providerInterval}, count=${count}, exchange=${exchange || 'none'}`);
    
    const response = await this.request('/time_series', this.withExchange({
      symbol: providerSymbol,
      interval: providerInterval,
      outputsize: String(Math.max(1, Math.min(Math.floor(count) || 100, 5_000))),
      timezone: 'UTC',
      order: 'ASC',
    }, exchange));
    
    if (!isRecord(response)) {
      throw new TwelveDataApiError('PROVIDER', `Twelve Data returned an invalid candle response for ${normalized}.`);
    }
    
    // ✅ Diagnostic logging - response metadata
    this.logger.log(`[getTimeSeries] Response metadata:`, {
      hasValues: Array.isArray(response.values),
      valueCount: Array.isArray(response.values) ? response.values.length : 0,
      status: response.status || 'ok',
      meta: response.meta ? {
        symbol: (response.meta as any).symbol,
        interval: (response.meta as any).interval,
        currency: (response.meta as any).currency,
        exchange: (response.meta as any).exchange,
        type: (response.meta as any).type
      } : 'none'
    });
    
    const values = response.values;
    if (!Array.isArray(values)) {
      throw new TwelveDataApiError('PROVIDER', `Twelve Data returned an invalid candle response for ${normalized}.`);
    }

    const candles = (values as unknown[]).map((value, idx): TwelveDataCandle => {
      if (!isRecord(value)) {
        throw new TwelveDataApiError('PROVIDER', `Twelve Data returned an invalid candle for ${normalized}.`);
      }

      const open = this.decimal(value.open, 'open');
      const high = this.decimal(value.high, 'high');
      const low = this.decimal(value.low, 'low');
      const close = this.decimal(value.close, 'close');
      const timestamp = this.timestamp(value.datetime);
      
      // ✅ CRITICAL: Validate OHLC constraints - high must be >= all values, low must be <= all values
      const maxPrice = Decimal.max(open, close);
      const minPrice = Decimal.min(open, close);
      
      if (high.lt(maxPrice) || high.lt(low)) {
        this.logger.error(`[getTimeSeries] Invalid OHLC at index ${idx}: high < max(open,close) or high < low`, {
          datetime: value.datetime,
          open: open.toString(),
          high: high.toString(),
          low: low.toString(),
          close: close.toString(),
          maxPrice: maxPrice.toString(),
          minPrice: minPrice.toString()
        });
        throw new TwelveDataApiError('PROVIDER', `Twelve Data returned invalid OHLC values for ${normalized} at ${value.datetime}: high must be >= max(open, close, low).`);
      }
      
      if (low.gt(minPrice) || low.gt(high)) {
        this.logger.error(`[getTimeSeries] Invalid OHLC at index ${idx}: low > min(open,close) or low > high`, {
          datetime: value.datetime,
          open: open.toString(),
          high: high.toString(),
          low: low.toString(),
          close: close.toString(),
          maxPrice: maxPrice.toString(),
          minPrice: minPrice.toString()
        });
        throw new TwelveDataApiError('PROVIDER', `Twelve Data returned invalid OHLC values for ${normalized} at ${value.datetime}: low must be <= min(open, close).`);
      }

      const rawVolume = value.volume;
      const parsedVolume = rawVolume === undefined || rawVolume === null || rawVolume === ''
        ? undefined
        : Number(rawVolume);

      return {
        timestamp,
        open,
        high,
        low,
        close,
        volume: parsedVolume !== undefined && Number.isFinite(parsedVolume) && parsedVolume >= 0
          ? parsedVolume
          : undefined,
      };
    }).sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

    if (candles.length === 0) {
      throw new TwelveDataApiError('EMPTY_CANDLES', `Twelve Data returned no candles for ${normalized} (${providerInterval}).`);
    }
    
    // ✅ Validate chronological order and no duplicate timestamps
    if (candles.some((candle, index) =>
      index > 0 && candle.timestamp.getTime() <= candles[index - 1].timestamp.getTime(),
    )) {
      throw new TwelveDataApiError('PROVIDER', `Twelve Data returned duplicate or out-of-order candle timestamps for ${normalized}.`);
    }

    // ✅ Diagnostic logging - sanitized sample data
    this.logger.log(`[getTimeSeries] Processed ${candles.length} valid candles:`, {
      symbol: normalized,
      interval: providerInterval,
      first: candles[0] ? {
        timestamp: candles[0].timestamp.toISOString(),
        open: candles[0].open.toString(),
        high: candles[0].high.toString(),
        low: candles[0].low.toString(),
        close: candles[0].close.toString(),
        volume: candles[0].volume
      } : null,
      last: candles.length > 1 ? {
        timestamp: candles[candles.length - 1].timestamp.toISOString(),
        open: candles[candles.length - 1].open.toString(),
        high: candles[candles.length - 1].high.toString(),
        low: candles[candles.length - 1].low.toString(),
        close: candles[candles.length - 1].close.toString(),
        volume: candles[candles.length - 1].volume
      } : null
    });

    return candles;
  }

  async getExchanges(): Promise<TwelveDataExchange[]> {
    return this.cachedDirectory('exchanges', 60 * 60_000, async () => {
      const [response, cryptoResponse] = await Promise.all([
        this.request('/exchanges', {}),
        this.request('/cryptocurrency_exchanges', {}),
      ]);
      if (!isRecord(response) || !Array.isArray(response.data) ||
        !isRecord(cryptoResponse) || !Array.isArray(cryptoResponse.data)) {
        throw new TwelveDataApiError('PROVIDER', 'Twelve Data returned an invalid exchange directory.');
      }
      const stockExchanges = response.data.flatMap((entry): TwelveDataExchange[] => {
        if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.code !== 'string') return [];
        return [{
          name: entry.name,
          displayName: entry.title && typeof entry.title === 'string' ? entry.title : entry.name,
          code: entry.code,
          marketType: 'STOCK' as const,
          country: typeof entry.country === 'string' && entry.country ? entry.country : null,
          timezone: typeof entry.timezone === 'string' && entry.timezone ? entry.timezone : null,
          source: 'TWELVE_DATA',
        }];
      });
      const cryptoExchanges = cryptoResponse.data.flatMap((entry): TwelveDataExchange[] => {
        if (!isRecord(entry) || typeof entry.name !== 'string') return [];
        return [{
          name: entry.name,
          displayName: entry.name,
          code: null,
          marketType: 'CRYPTO' as const,
          country: null,
          timezone: null,
          source: 'TWELVE_DATA',
        }];
      });
      return [...stockExchanges, ...cryptoExchanges];
    });
  }

  async searchInstruments(query: string, limit = 30, exchange?: string): Promise<TwelveDataInstrument[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 80) {
      throw new TwelveDataApiError('INSTRUMENT_UNAVAILABLE', 'Search text must be between 2 and 80 characters.');
    }
    const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 30, 30));
    const cacheKey = `search:${normalizedQuery.toLowerCase()}:${exchange?.toUpperCase() || ''}:${safeLimit}`;
    return this.cachedDirectory(cacheKey, 5 * 60_000, async () => {
      const response = await this.request('/symbol_search', this.withExchange({
        symbol: normalizedQuery,
        outputsize: String(safeLimit),
      }, exchange));
      if (!isRecord(response) || !Array.isArray(response.data)) {
        throw new TwelveDataApiError('PROVIDER', 'Twelve Data returned an invalid symbol-search response.');
      }
      return response.data.flatMap((entry): TwelveDataInstrument[] => {
        if (!isRecord(entry) || typeof entry.symbol !== 'string') return [];
        const instrumentType = typeof entry.instrument_type === 'string' ? entry.instrument_type : '';
        return [{
          symbol: entry.symbol,
          name: typeof entry.instrument_name === 'string' ? entry.instrument_name : entry.symbol,
          assetType: this.assetType(instrumentType, entry),
          exchange: typeof entry.exchange === 'string' && entry.exchange ? entry.exchange : null,
          exchangeCode: typeof entry.mic_code === 'string' && entry.mic_code ? entry.mic_code : null,
          country: typeof entry.country === 'string' && entry.country ? entry.country : null,
          currency: typeof entry.currency === 'string' && entry.currency ? entry.currency : null,
          timezone: typeof entry.exchange_timezone === 'string' && entry.exchange_timezone ? entry.exchange_timezone : null,
          source: 'TWELVE_DATA',
        }];
      });
    });
  }

  async getExchangeMarketState(exchange: string) {
    const normalized = exchange.trim();
    if (normalized.length < 2 || normalized.length > 80) {
      throw new TwelveDataApiError('INSTRUMENT_UNAVAILABLE', 'Exchange must be between 2 and 80 characters.');
    }
    const cacheKey = `market-state:${normalized.toUpperCase()}`;
    return this.cachedDirectory(cacheKey, 60_000, async () => {
      const response = await this.request('/market_state', { exchange: normalized });
      if (!isRecord(response) || !Array.isArray(response.data)) {
        throw new TwelveDataApiError('PROVIDER', 'Twelve Data returned an invalid market-state response.');
      }
      return response.data.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.is_market_open !== 'boolean') return [];
        return [{
          name: entry.name,
          code: typeof entry.code === 'string' ? entry.code : null,
          country: typeof entry.country === 'string' ? entry.country : null,
          isOpen: entry.is_market_open,
          timeToOpen: typeof entry.time_to_open === 'string' ? entry.time_to_open : null,
          timeToClose: typeof entry.time_to_close === 'string' ? entry.time_to_close : null,
          timeAfterOpen: typeof entry.time_after_open === 'string' ? entry.time_after_open : null,
          source: 'TWELVE_DATA' as const,
        }];
      });
    });
  }

  async getExchangeSchedule(exchange: string) {
    const normalized = exchange.trim();
    if (normalized.length < 2 || normalized.length > 80) {
      throw new TwelveDataApiError('INSTRUMENT_UNAVAILABLE', 'Exchange must be between 2 and 80 characters.');
    }
    return this.request('/exchange_schedule', { exchange: normalized });
  }

  async getInstrumentDetails(symbol: string, exchange?: string): Promise<TwelveDataInstrument> {
    const requested = this.normalizeSymbol(symbol).providerSymbol.toUpperCase();
    const candidates = await this.searchInstruments(requested, 30, exchange);
    const match = candidates.find((candidate) =>
      candidate.symbol.trim().toUpperCase().replace(/[\/_]/g, '') === requested.replace(/[\/_]/g, '') &&
      (!exchange || candidate.exchange?.toUpperCase() === exchange.trim().toUpperCase() ||
        candidate.exchangeCode?.toUpperCase() === exchange.trim().toUpperCase()),
    );
    if (!match) {
      throw new TwelveDataApiError('INSTRUMENT_UNAVAILABLE', 'Twelve Data did not return this instrument for the requested exchange.');
    }
    return match;
  }

  private withExchange(params: Record<string, string>, exchange?: string): Record<string, string> {
    const normalizedExchange = exchange?.trim();
    if (!normalizedExchange) return params;
    if (normalizedExchange.length < 2 || normalizedExchange.length > 80) {
      throw new TwelveDataApiError('INSTRUMENT_UNAVAILABLE', 'Exchange must be between 2 and 80 characters.');
    }
    return { ...params, exchange: normalizedExchange };
  }

  private assetType(instrumentType: string, entry: ProviderResponse): TwelveDataAssetType {
    const type = instrumentType.toLowerCase();
    const symbol = typeof entry.symbol === 'string' ? entry.symbol : '';
    const exchange = typeof entry.exchange === 'string' ? entry.exchange.toLowerCase() : '';
    if (type.includes('physical currency') || type === 'currency' || type.includes('forex')) return 'FOREX';
    if (type.includes('digital currency') || type.includes('cryptocurrency')) return 'CRYPTO';
    if (type.includes('commodity') || type.includes('metal') || exchange === 'commodity') return 'COMMODITY';
    if (/stock|equity|etf|depositary receipt|fund|warrant/.test(type)) return 'STOCK';
    if (symbol.includes('/') && exchange === 'physical currency') return 'FOREX';
    return 'OTHER';
  }

  private async cachedDirectory<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.directoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const existing = this.directoryPending.get(key);
    if (existing) return existing as Promise<T>;
    const request = load()
      .then((value) => {
        if (!this.directoryCache.has(key) && this.directoryCache.size >= 300) {
          const oldestKey = this.directoryCache.keys().next().value;
          if (oldestKey) this.directoryCache.delete(oldestKey);
        }
        this.directoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => this.directoryPending.delete(key));
    this.directoryPending.set(key, request);
    return request;
  }

  private decimal(value: unknown, field: string): Decimal {
    try {
      const number = new Decimal(String(value));
      if (!number.isFinite() || number.lte(0)) throw new Error();
      return number;
    } catch {
      throw new TwelveDataApiError('PROVIDER', `Twelve Data returned an invalid ${field}.`);
    }
  }

  private optionalDecimal(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    try {
      const number = new Decimal(String(value));
      if (!number.isFinite()) throw new Error();
      return number.toString();
    } catch {
      throw new TwelveDataApiError('PROVIDER', `Twelve Data returned an invalid ${field}.`);
    }
  }

  private timestamp(value: unknown): Date {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new TwelveDataApiError('PROVIDER', 'Twelve Data returned an invalid timestamp.');
    }

    const text = String(value).trim();
    const normalized = text.replace(' ', 'T');
    const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(text);
    const timestamp = typeof value === 'number'
      ? new Date(Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value)
      : new Date(hasTimezone ? normalized : `${normalized}Z`);

    if (Number.isNaN(timestamp.getTime())) {
      throw new TwelveDataApiError('PROVIDER', 'Twelve Data returned an invalid timestamp.');
    }
    return timestamp;
  }

  private async request(path: string, query: Record<string, string>): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new TwelveDataApiError('NOT_CONFIGURED', 'TWELVE_DATA_API_KEY is required for market data.');
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl}${path}`);
      if (url.protocol !== 'https:' || url.hostname !== 'api.twelvedata.com') {
        throw new Error('Unsupported provider host.');
      }
    } catch {
      throw new TwelveDataApiError('PROVIDER', 'TWELVE_DATA_API_BASE_URL must use the official HTTPS Twelve Data API.');
    }
    Object.entries({ ...query, apikey: this.apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new TwelveDataApiError('NETWORK', timedOut ? 'Twelve Data request timed out.' : 'Unable to reach Twelve Data.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TwelveDataApiError('PROVIDER', 'Twelve Data returned an unreadable response.');
    }
    if (Array.isArray(payload)) {
      return { data: payload };
    }
    if (!isRecord(payload)) {
      throw new TwelveDataApiError('PROVIDER', 'Twelve Data returned an invalid response.');
    }

    const message = typeof payload.message === 'string'
      ? payload.message
      : typeof payload.code === 'string'
        ? payload.code
        : '';
    const code = Number(payload.code);
    if (response.status === 401 || code === 401 || /api key|credential|unauthor/i.test(message)) {
      throw new TwelveDataApiError('INVALID_CREDENTIALS', 'Twelve Data rejected the API key.');
    }
    if (response.status === 429 || code === 429 || /credit|rate limit|too many/i.test(message)) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new TwelveDataApiError(
        'RATE_LIMITED',
        'Twelve Data rate limited the request.',
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000,
      );
    }
    if (response.status === 403 || code === 403) {
      throw new TwelveDataApiError(
        'SUBSCRIPTION_RESTRICTED',
        'Twelve Data restricted this endpoint for the configured subscription.',
      );
    }
    if (/symbol|instrument|not found|not supported/i.test(message)) {
      throw new TwelveDataApiError(
        'INSTRUMENT_UNAVAILABLE',
        'Twelve Data does not provide this instrument for the configured subscription.',
      );
    }
    if (!response.ok || payload.status === 'error') {
      throw new TwelveDataApiError(
        'PROVIDER',
        'Twelve Data request failed. Check the provider status and subscription permissions.',
      );
    }

    return payload;
  }
}
