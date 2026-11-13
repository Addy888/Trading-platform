import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  TwelveDataApiError,
  TwelveDataCandle,
  TwelveDataErrorCategory,
  TwelveDataProvider,
} from './providers/twelve-data/twelve-data.provider';
import { TwelveDataWebSocketService } from './providers/twelve-data/twelve-data-websocket.service';

export enum ProviderType {
  TWELVE_DATA = 'TWELVE_DATA',
}

export enum ProviderStatus {
  UNVERIFIED = 'UNVERIFIED',
  AVAILABLE = 'AVAILABLE',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  RATE_LIMITED = 'RATE_LIMITED',
  ERROR = 'ERROR',
  DISABLED = 'DISABLED',
}

type Capability = 'candles' | 'quotes';
type CacheEntry<T> = { data: T; timestamp: number };

function readPositiveSetting(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class MarketDataManagerService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataManagerService.name);
  private readonly quotes = new Map<string, CacheEntry<Awaited<ReturnType<TwelveDataProvider['getQuote']>>>>();
  private readonly candles = new Map<string, CacheEntry<TwelveDataCandle[]>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly pollingIntervalMs = Math.max(900_000, readPositiveSetting('MARKET_DATA_POLLING_INTERVAL', 900_000));
  private readonly staleThresholdMs = Math.max(this.pollingIntervalMs, readPositiveSetting('MARKET_DATA_STALE_THRESHOLD_MS', 1_200_000));
  private readonly quoteTtl = Math.max(this.pollingIntervalMs, readPositiveSetting('MARKET_DATA_QUOTE_CACHE_TTL', 900_000));
  // ✅ FIX RATE LIMITS: Longer cache for historical candles (5 minutes default)
  // Historical data doesn't change often, safe to cache longer
  private readonly candleTtl = Math.max(10_000, readPositiveSetting('MARKET_DATA_CANDLE_CACHE_TTL', 300_000));
  // ✅ FIX RATE LIMITS: Add request throttling
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = readPositiveSetting('TWELVE_DATA_MIN_REQUEST_INTERVAL_MS', 8_000); // 8s = ~7.5 req/min (safe for free tier 8 req/min)

  private status: ProviderStatus;
  private quoteStatus: ProviderStatus;
  private errorCategory: TwelveDataErrorCategory | null = null;
  private quoteErrorCategory: TwelveDataErrorCategory | null = null;
  private lastError: string | null = null;
  private quoteLastError: string | null = null;
  private lastUpdateAt: string | null = null;
  private candleLastSuccessAt: string | null = null;
  private quoteLastSuccessAt: string | null = null;
  private directoryLastSuccessAt: string | null = null;
  private directoryLastError: string | null = null;
  private retryAfter = 0;

  constructor(
    private readonly provider: TwelveDataProvider,
    @Inject(forwardRef(() => TwelveDataWebSocketService))
    private readonly websocketService: any,
  ) {
    this.status = this.quoteStatus = provider.isConfigured() ? ProviderStatus.UNVERIFIED : ProviderStatus.DISABLED;
    if (!provider.isConfigured()) {
      this.setError(
        new TwelveDataApiError('NOT_CONFIGURED', 'TWELVE_DATA_API_KEY is not configured.'),
        'both',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.provider.isConfigured()) return;

    try {
      await this.provider.validateCredentials();
      this.setSuccess('both');
      this.logger.log('Twelve Data credentials verified by a real API request.');
    } catch (error) {
      this.setError(error, 'both');
    }
  }

  getProviderStatus() {
    const configuration = {
      ...this.provider.getConfigurationStatus(),
      pollingIntervalMs: this.pollingIntervalMs,
      staleThresholdMs: this.staleThresholdMs,
    };

    // ✅ FIX WEBSOCKET STATUS: Get actual WebSocket connection state
    let websocketState = 'DISCONNECTED';
    let websocketRestriction: string | null = null;
    let websocketLastPriceAt: string | null = null;
    
    if (this.websocketService) {
      try {
        const wsConnectionState = this.websocketService.getConnectionState();
        const wsRestriction = this.websocketService.getRestriction();
        const wsLastPriceAt = this.websocketService.getLastPriceAt();
        
        websocketState = wsConnectionState || 'DISCONNECTED';
        websocketRestriction = wsRestriction;
        websocketLastPriceAt = wsLastPriceAt ? wsLastPriceAt.toISOString() : null;
      } catch (err) {
        this.logger.debug('Could not get WebSocket status:', err);
      }
    }

    return {
      primaryProvider: ProviderType.TWELVE_DATA,
      configuration,
      errorCategory: this.errorCategory,
      lastUpdateAt: this.lastUpdateAt,
      candleLastSuccessAt: this.candleLastSuccessAt,
      quoteLastSuccessAt: this.quoteLastSuccessAt,
      // ✅ FIX WEBSOCKET STATUS: Include actual WebSocket connection state
      websocketConnectionState: websocketState,
      websocketRestriction,
      websocketLastPriceAt,
      providers: {
        TWELVE_DATA: {
          status: this.status,
          errorCategory: this.errorCategory,
          lastError: this.lastError,
          candleStatus: this.status,
          candleErrorCategory: this.errorCategory,
          candleLastError: this.lastError,
          quoteStatus: this.quoteStatus,
          quoteErrorCategory: this.quoteErrorCategory,
          quoteLastError: this.quoteLastError,
          retryAfter: this.retryAfter || null,
          lastUpdateAt: this.lastUpdateAt,
          candleLastSuccessAt: this.candleLastSuccessAt,
          quoteLastSuccessAt: this.quoteLastSuccessAt,
          directoryLastSuccessAt: this.directoryLastSuccessAt,
          directoryLastError: this.directoryLastError,
          streamingMode: websocketState === 'CONNECTED' ? 'WEBSOCKET' : 'POLLING',
          websocketConnectionState: websocketState,
          websocketRestriction,
          websocketLastPriceAt,
        },
      },
      quoteCacheSize: this.quotes.size,
      candleCacheSize: this.candles.size,
    };
  }

  getCandleProvider() {
    return ProviderType.TWELVE_DATA;
  }

  getSupportedSymbols() {
    return this.provider.getSupportedSymbols();
  }

  async getQuote(symbol: string, exchange?: string) {
    return this.cached(
      `quote:${symbol.toUpperCase()}:${exchange?.toUpperCase() || ''}`,
      this.quotes,
      this.quoteTtl,
      () => this.provider.getQuote(symbol, exchange),
      'quotes',
    );
  }

  async getCandles(symbol: string, interval: string, count: number, exchange?: string) {
    return this.cached(
      `candle:${symbol.toUpperCase()}:${exchange?.toUpperCase() || ''}:${interval}:${count}`,
      this.candles,
      this.candleTtl,
      () => this.provider.getTimeSeries(symbol, interval, count, exchange),
      'candles',
    );
  }

  async getExchanges() {
    return this.trackDirectoryRequest(() => this.provider.getExchanges());
  }

  async searchInstruments(query: string, limit: number, exchange?: string) {
    return this.trackDirectoryRequest(() => this.provider.searchInstruments(query, limit, exchange));
  }

  async getInstrumentDetails(symbol: string, exchange?: string) {
    return this.trackDirectoryRequest(() => this.provider.getInstrumentDetails(symbol, exchange));
  }

  async getExchangeMarketState(exchange: string) {
    return this.trackDirectoryRequest(() => this.provider.getExchangeMarketState(exchange));
  }

  async getExchangeSchedule(exchange: string) {
    return this.trackDirectoryRequest(() => this.provider.getExchangeSchedule(exchange));
  }

  private async trackDirectoryRequest<T>(action: () => Promise<T>): Promise<T> {
    try {
      const result = await action();
      this.directoryLastSuccessAt = new Date().toISOString();
      this.directoryLastError = null;
      return result;
    } catch (error) {
      this.directoryLastError = error instanceof TwelveDataApiError
        ? error.message
        : 'Twelve Data directory data is temporarily unavailable.';
      throw this.toHttp(error);
    }
  }

  private async cached<T>(
    key: string,
    cache: Map<string, CacheEntry<T>>,
    ttl: number,
    action: () => Promise<T>,
    capability: Capability,
  ): Promise<T> {
    if (this.status === ProviderStatus.DISABLED || this.status === ProviderStatus.INVALID_CREDENTIALS) {
      throw this.toHttp(new TwelveDataApiError(this.errorCategory || 'NOT_CONFIGURED', this.lastError || 'Twelve Data unavailable.'));
    }

    // ✅ FIX RATE LIMITS: Return cached data if available and valid
    const hit = cache.get(key);
    if (hit && Date.now() - hit.timestamp < ttl) {
      this.logger.debug(`[Cache HIT] ${key} (age: ${Math.floor((Date.now() - hit.timestamp) / 1000)}s, ttl: ${Math.floor(ttl / 1000)}s)`);
      return hit.data;
    }

    // ✅ FIX RATE LIMITS: Check global rate limit with retry-after
    if (this.retryAfter > Date.now()) {
      const waitMs = this.retryAfter - Date.now();
      this.logger.warn(`[Rate Limited] Must wait ${Math.ceil(waitMs / 1000)}s before next request`);
      
      // If we have stale cache data, return it instead of throwing
      if (hit) {
        this.logger.warn(`[Rate Limited] Returning stale cached data for ${key} (age: ${Math.floor((Date.now() - hit.timestamp) / 1000)}s)`);
        return hit.data;
      }
      
      throw this.toHttp(
        new TwelveDataApiError('RATE_LIMITED', 'Twelve Data rate limited the request.', waitMs),
      );
    }

    // ✅ FIX RATE LIMITS: Deduplicate in-flight requests
    const existing = this.pending.get(key);
    if (existing) {
      this.logger.debug(`[In-Flight] Reusing pending request for ${key}`);
      return existing as Promise<T>;
    }

    // ✅ FIX RATE LIMITS: Throttle requests to prevent exceeding provider limits
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestIntervalMs) {
      const waitMs = this.minRequestIntervalMs - timeSinceLastRequest;
      this.logger.debug(`[Throttle] Waiting ${waitMs}ms before next provider request`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    // Update last request time
    this.lastRequestTime = Date.now();

    const request = action()
      .then((data) => {
        // ✅ FIX RATE LIMITS: Store in cache with timestamp
        cache.set(key, { data, timestamp: Date.now() });
        
        // ✅ FIX RATE LIMITS: Limit cache size to prevent memory issues
        if (cache.size > 1000) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey) {
            cache.delete(oldestKey);
            this.logger.debug(`[Cache] Evicted oldest entry: ${oldestKey}`);
          }
        }
        
        this.logger.debug(`[Cache SET] ${key}`);
        this.setSuccess(capability);
        return data;
      })
      .catch((error: unknown) => {
        this.setError(error, capability);
        
        // ✅ FIX RATE LIMITS: On rate limit, check if we have stale data to return
        if (error instanceof TwelveDataApiError && error.category === 'RATE_LIMITED' && hit) {
          this.logger.warn(`[Rate Limited] Returning stale cached data for ${key} (age: ${Math.floor((Date.now() - hit.timestamp) / 1000)}s)`);
          // Don't delete from cache, return stale data
          return hit.data;
        }
        
        throw this.toHttp(error);
      })
      .finally(() => this.pending.delete(key));

    this.pending.set(key, request);
    return request;
  }

  private setSuccess(capability: Capability | 'both'): void {
    const successfulAt = new Date().toISOString();
    if (capability !== 'quotes') {
      this.status = ProviderStatus.AVAILABLE;
      this.errorCategory = null;
      this.lastError = null;
      this.candleLastSuccessAt = successfulAt;
    }
    if (capability !== 'candles') {
      this.quoteStatus = ProviderStatus.AVAILABLE;
      this.quoteErrorCategory = null;
      this.quoteLastError = null;
      this.quoteLastSuccessAt = successfulAt;
    }
    this.retryAfter = 0;
    this.lastUpdateAt = successfulAt;
  }

  private setError(error: unknown, capability: Capability | 'both'): void {
    const category: TwelveDataErrorCategory = error instanceof TwelveDataApiError ? error.category : 'PROVIDER';
    const status = category === 'NOT_CONFIGURED'
      ? ProviderStatus.DISABLED
      : category === 'INVALID_CREDENTIALS'
        ? ProviderStatus.INVALID_CREDENTIALS
        : category === 'RATE_LIMITED'
          ? ProviderStatus.RATE_LIMITED
          : ProviderStatus.ERROR;
    const message = error instanceof TwelveDataApiError
      ? error.message
      : 'Twelve Data market data is temporarily unavailable.';

    if (capability !== 'quotes') {
      this.status = status;
      this.errorCategory = category;
      this.lastError = message;
    }
    if (capability !== 'candles') {
      this.quoteStatus = status;
      this.quoteErrorCategory = category;
      this.quoteLastError = message;
    }
    if (category === 'RATE_LIMITED') {
      this.retryAfter = Date.now() + (error instanceof TwelveDataApiError ? error.retryAfterMs : 60_000);
    }
    this.logger.warn(`Twelve Data ${capability} error category=${category}: ${message}`);
  }

  private toHttp(error: unknown): HttpException {
    const category: TwelveDataErrorCategory = error instanceof TwelveDataApiError ? error.category : 'PROVIDER';
    const message = error instanceof TwelveDataApiError
      ? error.message
      : 'Twelve Data market data is temporarily unavailable.';
    const body = {
      success: false,
      provider: 'TWELVE_DATA',
      category,
      message,
      retryable: ['RATE_LIMITED', 'NETWORK', 'PROVIDER'].includes(category),
      retryAfterMs: error instanceof TwelveDataApiError && error.retryAfterMs ? error.retryAfterMs : undefined,
    };

    if (category === 'INVALID_CREDENTIALS') return new UnauthorizedException(body);
    if (category === 'SUBSCRIPTION_RESTRICTED') return new HttpException(body, HttpStatus.FORBIDDEN);
    if (category === 'INSTRUMENT_UNAVAILABLE') return new NotFoundException(body);
    if (category === 'UNSUPPORTED_INTERVAL') return new BadRequestException(body);
    if (category === 'RATE_LIMITED') return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
    if (category === 'NOT_CONFIGURED' || category === 'NETWORK') return new ServiceUnavailableException(body);
    return new BadGatewayException(body);
  }
}
