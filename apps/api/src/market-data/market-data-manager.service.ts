import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { OandaApiError, OandaProvider } from './providers/oanda/oanda.provider';
import type { OandaErrorCategory } from './providers/oanda/oanda.provider';

export enum ProviderType {
  OANDA = 'OANDA',
}

export enum ProviderStatus {
  UNVERIFIED = 'UNVERIFIED',
  AVAILABLE = 'AVAILABLE',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_ACCESS_DENIED = 'ACCOUNT_ACCESS_DENIED',
  ACCOUNT_ID_REQUIRED = 'ACCOUNT_ID_REQUIRED',
  RATE_LIMITED = 'RATE_LIMITED',
  ERROR = 'ERROR',
  DISABLED = 'DISABLED',
}

type MarketDataCapability = 'candles' | 'quotes';

@Injectable()
export class MarketDataManagerService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataManagerService.name);
  private readonly quoteCache = new Map<string, { data: any; timestamp: number }>();
  private readonly candleCache = new Map<string, { data: any[]; timestamp: number }>();
  private readonly pendingQuotes = new Map<string, Promise<any>>();
  private readonly pendingCandles = new Map<string, Promise<any[]>>();
  private status = ProviderStatus.DISABLED;
  private lastError: string | null = null;
  private errorCategory: OandaErrorCategory | null = null;
  private quoteStatus = ProviderStatus.DISABLED;
  private quoteErrorCategory: OandaErrorCategory | null = null;
  private quoteLastError: string | null = null;
  private retryAfter = 0;
  private readonly quoteTtl = Number(process.env.MARKET_DATA_QUOTE_CACHE_TTL || 30000);
  private readonly candleTtl = Number(process.env.MARKET_DATA_CANDLE_CACHE_TTL || 300000);

  constructor(private readonly oanda: OandaProvider) {
    this.status = oanda.isConfigured() ? ProviderStatus.UNVERIFIED : ProviderStatus.DISABLED;
    if (!oanda.isConfigured()) {
      this.errorCategory = 'NOT_CONFIGURED';
      this.lastError = this.safeError(new OandaApiError('NOT_CONFIGURED', 'OANDA credentials are not configured.'));
      this.quoteErrorCategory = 'NOT_CONFIGURED';
      this.quoteLastError = this.lastError;
    } else if (!oanda.getConfigurationStatus().accountSpecificPricingAvailable) {
      this.quoteStatus = ProviderStatus.ACCOUNT_ID_REQUIRED;
      this.quoteErrorCategory = 'ACCOUNT_ID_REQUIRED';
      this.quoteLastError = this.safeError(
        new OandaApiError('ACCOUNT_ID_REQUIRED', 'Account-specific pricing requires an OANDA account ID.'),
      );
    } else {
      this.quoteStatus = ProviderStatus.UNVERIFIED;
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.oanda.isConfigured()) return;
    try {
      await this.oanda.validateCredentials();
      this.status = ProviderStatus.AVAILABLE;
      this.errorCategory = null;
      this.lastError = null;
      if (this.quoteStatus !== ProviderStatus.ACCOUNT_ID_REQUIRED) {
        this.quoteStatus = ProviderStatus.UNVERIFIED;
        this.quoteErrorCategory = null;
        this.quoteLastError = null;
      }
      this.logger.log(`OANDA ${this.oanda.getEnvironment()} credentials validated.`);
    } catch (error) {
      this.recordError(error, 'candles');
    }
  }

  async getQuote(symbol: string): Promise<any> {
    return this.getCached(
      this.quoteCache,
      this.pendingQuotes,
      symbol.toUpperCase(),
      this.quoteTtl,
      () => this.oanda.getQuote(symbol),
      'quotes',
    );
  }

  async getCandles(symbol: string, interval: string, count: number): Promise<any[]> {
    const key = `${symbol.toUpperCase()}:${interval}:${count}`;
    return this.getCached(
      this.candleCache,
      this.pendingCandles,
      key,
      this.candleTtl,
      () => this.oanda.getTimeSeries(symbol, interval, count),
      'candles',
    );
  }

  async getInstruments(): Promise<string[]> {
    this.assertProviderCanBeCalled('quotes');
    try {
      const instruments = await this.oanda.getAvailableInstruments();
      this.quoteStatus = ProviderStatus.AVAILABLE;
      this.quoteErrorCategory = null;
      this.quoteLastError = null;
      return instruments;
    } catch (error) {
      this.recordError(error, 'quotes');
      throw this.toHttpException(error);
    }
  }

  getProviderStatus() {
    const configuration = this.oanda.getConfigurationStatus();
    return {
      primaryProvider: ProviderType.OANDA,
      configuration,
      errorCategory: this.errorCategory,
      providers: {
        OANDA: {
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
          ...configuration,
        },
      },
      quoteCacheSize: this.quoteCache.size,
      candleCacheSize: this.candleCache.size,
    };
  }

  getCandleProvider(): ProviderType { return ProviderType.OANDA; }

  private async getCached<T>(
    cache: Map<string, { data: T; timestamp: number }>,
    pending: Map<string, Promise<T>>,
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    capability: MarketDataCapability,
  ): Promise<T> {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) return cached.data;
    const existing = pending.get(key);
    if (existing) return existing;
    this.assertProviderCanBeCalled(capability);
    const request = fetcher()
      .then((data) => {
        cache.set(key, { data, timestamp: Date.now() });
        this.recordSuccess(capability);
        this.retryAfter = 0;
        return data;
      })
      .catch((error: unknown) => {
        this.recordError(error, capability);
        throw this.toHttpException(error);
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  private assertProviderCanBeCalled(capability: MarketDataCapability): void {
    const status = capability === 'candles' ? this.status : this.quoteStatus;
    const category = capability === 'candles' ? this.errorCategory : this.quoteErrorCategory;
    if (status === ProviderStatus.INVALID_CREDENTIALS) {
      throw this.toHttpException(new OandaApiError('INVALID_CREDENTIALS', 'OANDA rejected the token.'));
    }
    if (status === ProviderStatus.ACCOUNT_ACCESS_DENIED) {
      throw this.toHttpException(new OandaApiError('ACCOUNT_ACCESS', 'OANDA denied access to this account.'));
    }
    if (status === ProviderStatus.ACCOUNT_ID_REQUIRED || category === 'ACCOUNT_ID_REQUIRED') {
      throw this.toHttpException(new OandaApiError(
        'ACCOUNT_ID_REQUIRED',
        'OANDA account-specific pricing requires OANDA_ACCOUNT_ID.',
      ));
    }
    if (status === ProviderStatus.DISABLED) {
      throw this.toHttpException(new OandaApiError('NOT_CONFIGURED', 'OANDA credentials are not configured.'));
    }
    if (this.retryAfter > Date.now()) {
      throw this.toHttpException(new OandaApiError('RATE_LIMITED', 'OANDA rate limited the request.', this.retryAfter - Date.now()));
    }
  }

  private recordSuccess(capability: MarketDataCapability): void {
    if (capability === 'candles') {
      this.status = ProviderStatus.AVAILABLE;
      this.errorCategory = null;
      this.lastError = null;
      return;
    }
    this.quoteStatus = ProviderStatus.AVAILABLE;
    this.quoteErrorCategory = null;
    this.quoteLastError = null;
  }

  private recordError(error: unknown, capability: MarketDataCapability): void {
    const category = error instanceof OandaApiError ? error.category : 'PROVIDER';
    const nextStatus = category === 'INVALID_CREDENTIALS'
      ? ProviderStatus.INVALID_CREDENTIALS
      : category === 'ACCOUNT_ACCESS'
        ? ProviderStatus.ACCOUNT_ACCESS_DENIED
        : category === 'ACCOUNT_ID_REQUIRED'
          ? ProviderStatus.ACCOUNT_ID_REQUIRED
          : category === 'NOT_CONFIGURED'
            ? ProviderStatus.DISABLED
            : category === 'RATE_LIMITED'
              ? ProviderStatus.RATE_LIMITED
              : ProviderStatus.ERROR;
    const message = this.safeError(error);
    if (capability === 'candles') {
      this.errorCategory = category;
      this.lastError = message;
      this.status = nextStatus;
      if (category === 'INVALID_CREDENTIALS' || category === 'NOT_CONFIGURED') {
        this.quoteErrorCategory = category;
        this.quoteLastError = message;
        this.quoteStatus = nextStatus;
      }
    } else {
      this.quoteErrorCategory = category;
      this.quoteLastError = message;
      this.quoteStatus = nextStatus;
    }
    if (category === 'RATE_LIMITED') {
      this.retryAfter = Date.now() + (error instanceof OandaApiError ? error.retryAfterMs : 60000);
    }
    this.logger.warn(`OANDA ${capability} error category=${category}: ${message}`);
  }

  private safeError(error: unknown): string {
    const category = error instanceof OandaApiError ? error.category : 'PROVIDER';
    switch (category) {
      case 'NOT_CONFIGURED':
        return 'OANDA candle data is not configured. Set OANDA_API_TOKEN in the backend environment.';
      case 'INVALID_CREDENTIALS':
        return error instanceof OandaApiError
          ? error.message
          : 'OANDA rejected the credentials. Check the token and ensure OANDA_ENVIRONMENT matches the account.';
      case 'ACCOUNT_ACCESS':
        return error instanceof OandaApiError
          ? error.message
          : 'OANDA denied access to this account. Check account ownership and environment.';
      case 'ACCOUNT_ID_REQUIRED':
        return 'OANDA candle data is available, but OANDA_ACCOUNT_ID is required for account-specific instruments and bid/ask prices.';
      case 'INSTRUMENT_UNAVAILABLE':
        return error instanceof Error ? error.message : 'The instrument is unavailable for this OANDA account.';
      case 'UNSUPPORTED_INTERVAL':
        return error instanceof Error ? error.message : 'The requested interval is unsupported by OANDA.';
      case 'RATE_LIMITED':
        return error instanceof OandaApiError
          ? error.message
          : 'OANDA market data is rate limited. Retry after the indicated delay.';
      case 'EMPTY_CANDLES':
        return error instanceof Error ? error.message : 'OANDA returned no complete candles for this request.';
      case 'NETWORK':
        return error instanceof OandaApiError && error.message.startsWith('OANDA service returned HTTP')
          ? error.message
          : 'OANDA market data is temporarily unavailable. Please retry later.';
      default:
        return error instanceof Error && error.message.startsWith('OANDA')
          ? error.message
          : 'OANDA market data is temporarily unavailable. Please retry later.';
    }
  }

  private toHttpException(error: unknown): HttpException {
    const category = error instanceof OandaApiError ? error.category : 'PROVIDER';
    const message = this.safeError(error);
    const retryAfterMs = error instanceof OandaApiError ? error.retryAfterMs : 0;
    const body = { success: false, provider: 'OANDA', category, message, retryable: ['RATE_LIMITED', 'NETWORK', 'PROVIDER'].includes(category), retryAfterMs: retryAfterMs || undefined };
    if (category === 'INVALID_CREDENTIALS') return new UnauthorizedException(body);
    if (category === 'ACCOUNT_ACCESS') return new ForbiddenException(body);
    if (category === 'ACCOUNT_ID_REQUIRED') return new ServiceUnavailableException(body);
    if (category === 'INSTRUMENT_UNAVAILABLE') return new NotFoundException(body);
    if (category === 'UNSUPPORTED_INTERVAL') return new BadRequestException(body);
    if (category === 'RATE_LIMITED') return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
    if (category === 'NETWORK' || category === 'NOT_CONFIGURED') return new ServiceUnavailableException(body);
    if (category === 'EMPTY_CANDLES' || category === 'PROVIDER') return new BadGatewayException(body);
    return new HttpException(body, 502);
  }
}
