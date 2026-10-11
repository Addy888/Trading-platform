import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwelveDataProvider } from './providers/twelvedata/twelve-data.provider';
import { AlphaVantageProvider } from './providers/alphavantage/alpha-vantage.provider';
import Decimal from 'decimal.js';

/**
 * Market Data Manager Service
 * 
 * Centralized manager for all market data providers with:
 * - Quota tracking and exhaustion handling
 * - Provider priority and fallback
 * - Shared caching layer
 * - Request deduplication
 * - Configurable TTLs
 * 
 * This prevents quota exhaustion by:
 * 1. Single scheduler for all polling (not per-component)
 * 2. Shared cache across all consumers
 * 3. In-flight request deduplication
 * 4. Provider cooldown after quota exhaustion
 * 5. Clear separation of LIVE vs SIMULATED modes
 */

export enum ProviderType {
  TWELVE_DATA = 'TWELVE_DATA',
  ALPHA_VANTAGE = 'ALPHA_VANTAGE',
  SIMULATED = 'SIMULATED',
}

export enum ProviderStatus {
  AVAILABLE = 'AVAILABLE',
  QUOTA_EXHAUSTED = 'QUOTA_EXHAUSTED',
  ERROR = 'ERROR',
  DISABLED = 'DISABLED',
}

interface CachedQuote {
  symbol: string;
  data: any;
  timestamp: number;
  provider: ProviderType;
}

interface CachedCandles {
  symbol: string;
  interval: string;
  data: any[];
  timestamp: number;
  provider: ProviderType;
}

interface ProviderState {
  type: ProviderType;
  status: ProviderStatus;
  quotaExhaustedAt?: number;
  quotaResetTime?: number;
  errorCount: number;
  lastErrorAt?: number;
  requestCount: number;
  cacheHits: number;
}

@Injectable()
export class MarketDataManagerService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataManagerService.name);

  // Configuration
  private readonly primaryProvider: ProviderType;
  private readonly quoteCacheTTL: number;
  private readonly candleCacheTTL: number;
  private readonly pollingInterval: number;
  private readonly quotaResetHour: number; // UTC hour when quota resets

  // Caches
  private quoteCache: Map<string, CachedQuote> = new Map();
  private candleCache: Map<string, CachedCandles> = new Map();

  // In-flight request tracking
  private pendingQuoteRequests: Map<string, Promise<any>> = new Map();
  private pendingCandleRequests: Map<string, Promise<any>> = new Map();

  // Provider state
  private providerStates: Map<ProviderType, ProviderState> = new Map();

  // Polling scheduler
  private pollingTimer: NodeJS.Timeout | null = null;
  private subscribedSymbols: Set<string> = new Set();

  constructor(
    private readonly configService: ConfigService,
    private readonly twelveData: TwelveDataProvider,
    private readonly alphaVantage: AlphaVantageProvider,
  ) {
    // Load configuration
    this.primaryProvider = this.parseProviderType(
      this.configService.get<string>('MARKET_DATA_PROVIDER', 'TWELVE_DATA')
    );
    this.quoteCacheTTL = parseInt(
      this.configService.get<string>('MARKET_DATA_QUOTE_CACHE_TTL', '30000'),
      10
    );
    this.candleCacheTTL = parseInt(
      this.configService.get<string>('MARKET_DATA_CANDLE_CACHE_TTL', '300000'),
      10
    );
    this.pollingInterval = parseInt(
      this.configService.get<string>('MARKET_DATA_POLLING_INTERVAL', '20000'),
      10
    );
    this.quotaResetHour = parseInt(
      this.configService.get<string>('MARKET_DATA_QUOTA_RESET_HOUR', '0'),
      10
    );

    // Initialize provider states
    this.initializeProviderStates();
  }

  async onModuleInit() {
    this.logger.log('🚀 Market Data Manager initialized');
    this.logger.log(`Primary Provider: ${this.primaryProvider}`);
    this.logger.log(`Quote Cache TTL: ${this.quoteCacheTTL}ms`);
    this.logger.log(`Candle Cache TTL: ${this.candleCacheTTL}ms`);
    this.logger.log(`Polling Interval: ${this.pollingInterval}ms`);
    this.logger.log(`Quota Reset Hour: ${this.quotaResetHour} UTC`);

    // Check for quota cooldowns from previous session
    this.checkQuotaCooldowns();

    // Start polling scheduler
    this.startPolling();
  }

  /**
   * Initialize provider states
   */
  private initializeProviderStates(): void {
    this.providerStates.set(ProviderType.TWELVE_DATA, {
      type: ProviderType.TWELVE_DATA,
      status: this.twelveData.isConfigured() ? ProviderStatus.AVAILABLE : ProviderStatus.DISABLED,
      errorCount: 0,
      requestCount: 0,
      cacheHits: 0,
    });

    this.providerStates.set(ProviderType.ALPHA_VANTAGE, {
      type: ProviderType.ALPHA_VANTAGE,
      status: this.alphaVantage.isConfigured() ? ProviderStatus.AVAILABLE : ProviderStatus.DISABLED,
      errorCount: 0,
      requestCount: 0,
      cacheHits: 0,
    });

    this.providerStates.set(ProviderType.SIMULATED, {
      type: ProviderType.SIMULATED,
      status: ProviderStatus.AVAILABLE,
      errorCount: 0,
      requestCount: 0,
      cacheHits: 0,
    });
  }

  /**
   * Check if any providers have quota cooldowns that should be reset
   */
  private checkQuotaCooldowns(): void {
    const now = Date.now();
    const providers = [ProviderType.TWELVE_DATA, ProviderType.ALPHA_VANTAGE];

    for (const providerType of providers) {
      const state = this.providerStates.get(providerType);
      if (!state) continue;

      if (state.status === ProviderStatus.QUOTA_EXHAUSTED) {
        // Check if quota reset time has passed
        if (state.quotaResetTime && now >= state.quotaResetTime) {
          this.logger.log(`✅ Quota cooldown expired for ${providerType}, resetting to AVAILABLE`);
          state.status = ProviderStatus.AVAILABLE;
          state.quotaExhaustedAt = undefined;
          state.quotaResetTime = undefined;
          state.errorCount = 0;
        } else {
          const resetTime = state.quotaResetTime
            ? new Date(state.quotaResetTime).toISOString()
            : 'unknown';
          this.logger.warn(`⚠️  ${providerType} still in quota exhaustion cooldown until ${resetTime}`);
        }
      } else if (state.status === ProviderStatus.ERROR) {
        // Automatically recover from ERROR state after 5 minutes if not quota-related
        const timeSinceError = state.lastErrorAt ? now - state.lastErrorAt : Infinity;
        if (timeSinceError > 300000) { // 5 minutes
          this.logger.log(`🔄 ${providerType} ERROR state expired, resetting to AVAILABLE`);
          state.status = ProviderStatus.AVAILABLE;
          state.errorCount = 0;
          state.lastErrorAt = undefined;
        } else {
          const minutesRemaining = Math.ceil((300000 - timeSinceError) / 60000);
          this.logger.warn(`⚠️  ${providerType} in ERROR state, auto-recovery in ${minutesRemaining}min`);
        }
      }
    }
  }

  /**
   * Get quote for symbol with caching and provider fallback
   */
  async getQuote(symbol: string, mode: 'LIVE' | 'SIMULATED' = 'LIVE'): Promise<any> {
    // SIMULATED mode always uses simulated data
    if (mode === 'SIMULATED') {
      return this.getSimulatedQuote(symbol);
    }

    // LIVE mode: Check cache first
    const cached = this.quoteCache.get(symbol);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.quoteCacheTTL) {
      const state = this.providerStates.get(cached.provider);
      if (state) {
        state.cacheHits++;
      }
      this.logger.debug(`📦 Cache HIT for ${symbol} (age: ${Math.round((now - cached.timestamp) / 1000)}s, provider: ${cached.provider})`);
      return {
        ...cached.data,
        cached: true,
        cacheAge: now - cached.timestamp,
        provider: cached.provider,
      };
    }

    // Check for in-flight request
    const pending = this.pendingQuoteRequests.get(symbol);
    if (pending) {
      this.logger.debug(`♻️  Reusing in-flight request for ${symbol}`);
      return pending;
    }

    // Create new request with deduplication
    const requestPromise = this.fetchQuoteFromProvider(symbol);
    this.pendingQuoteRequests.set(symbol, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.pendingQuoteRequests.delete(symbol);
    }
  }

  /**
   * Fetch quote from available provider with fallback
   */
  private async fetchQuoteFromProvider(symbol: string): Promise<any> {
    const providers = [this.primaryProvider, ProviderType.ALPHA_VANTAGE];
    let lastError: Error | null = null;

    for (const providerType of providers) {
      const state = this.providerStates.get(providerType);
      
      if (!state || state.status !== ProviderStatus.AVAILABLE) {
        this.logger.debug(`Skipping ${providerType}: status=${state?.status}`);
        continue;
      }

      try {
        const data = await this.fetchQuoteFromSpecificProvider(providerType, symbol);
        state.requestCount++;

        // Cache the result
        this.quoteCache.set(symbol, {
          symbol,
          data,
          timestamp: Date.now(),
          provider: providerType,
        });

        this.logger.debug(`✅ Fetched quote for ${symbol} from ${providerType} (request #${state.requestCount})`);

        return {
          ...data,
          cached: false,
          provider: providerType,
        };
      } catch (error) {
        lastError = error as Error;
        this.handleProviderError(providerType, error);
        this.logger.warn(`${providerType} failed for ${symbol}, trying next provider...`);
        continue;
      }
    }

    // No providers succeeded
    const availableProviders = Array.from(this.providerStates.entries())
      .filter(([_, state]) => state.status !== ProviderStatus.DISABLED)
      .map(([type, state]) => `${type}:${state.status}`)
      .join(', ');

    throw new Error(
      `No market data providers available for symbol ${symbol}. ` +
      `Provider states: ${availableProviders}. ` +
      `Last error: ${lastError?.message || 'unknown'}. ` +
      `Please use SIMULATED mode or wait for provider recovery.`
    );
  }

  /**
   * Fetch quote from a specific provider
   */
  private async fetchQuoteFromSpecificProvider(providerType: ProviderType, symbol: string): Promise<any> {
    switch (providerType) {
      case ProviderType.TWELVE_DATA:
        return await this.twelveData.getQuote(symbol);
      
      case ProviderType.ALPHA_VANTAGE:
        return await this.alphaVantage.getQuote(symbol);
      
      default:
        throw new Error(`Unsupported provider: ${providerType}`);
    }
  }

  /**
   * Get candles for symbol with caching
   */
  async getCandles(
    symbol: string,
    interval: string,
    outputsize: number,
    mode: 'LIVE' | 'SIMULATED' = 'LIVE'
  ): Promise<any[]> {
    // SIMULATED mode always uses simulated data
    if (mode === 'SIMULATED') {
      return this.getSimulatedCandles(symbol, interval, outputsize);
    }

    // LIVE mode: Check cache first
    const cacheKey = `${symbol}:${interval}:${outputsize}`;
    const cached = this.candleCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.candleCacheTTL) {
      const state = this.providerStates.get(cached.provider);
      if (state) {
        state.cacheHits++;
      }
      this.logger.debug(
        `📦 Candle cache HIT for ${symbol} ${interval} (age: ${Math.round((now - cached.timestamp) / 1000)}s, provider: ${cached.provider})`
      );
      return cached.data;
    }

    // Check for in-flight request
    const pending = this.pendingCandleRequests.get(cacheKey);
    if (pending) {
      this.logger.debug(`♻️  Reusing in-flight candle request for ${symbol} ${interval}`);
      return pending;
    }

    // Create new request with deduplication
    const requestPromise = this.fetchCandlesFromProvider(symbol, interval, outputsize);
    this.pendingCandleRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.pendingCandleRequests.delete(cacheKey);
    }
  }

  /**
   * Fetch candles from available provider with fallback
   */
  private async fetchCandlesFromProvider(
    symbol: string,
    interval: string,
    outputsize: number
  ): Promise<any[]> {
    const cacheKey = `${symbol}:${interval}:${outputsize}`;
    const providers = [this.primaryProvider, ProviderType.ALPHA_VANTAGE];
    let lastError: Error | null = null;

    for (const providerType of providers) {
      const state = this.providerStates.get(providerType);
      
      if (!state || state.status !== ProviderStatus.AVAILABLE) {
        this.logger.debug(`Skipping ${providerType}: status=${state?.status}`);
        continue;
      }

      try {
        const data = await this.fetchCandlesFromSpecificProvider(providerType, symbol, interval, outputsize);
        state.requestCount++;

        // Cache the result
        this.candleCache.set(cacheKey, {
          symbol,
          interval,
          data,
          timestamp: Date.now(),
          provider: providerType,
        });

        this.logger.debug(
          `✅ Fetched ${data.length} candles for ${symbol} ${interval} from ${providerType} (request #${state.requestCount})`
        );

        return data;
      } catch (error) {
        lastError = error as Error;
        this.handleProviderError(providerType, error);
        this.logger.warn(`${providerType} failed for ${symbol} ${interval}, trying next provider...`);
        continue;
      }
    }

    // No providers succeeded
    const availableProviders = Array.from(this.providerStates.entries())
      .filter(([_, state]) => state.status !== ProviderStatus.DISABLED)
      .map(([type, state]) => `${type}:${state.status}`)
      .join(', ');

    throw new Error(
      `No market data providers available for candles ${symbol} ${interval}. ` +
      `Provider states: ${availableProviders}. ` +
      `Last error: ${lastError?.message || 'unknown'}. ` +
      `Please use SIMULATED mode or wait for provider recovery.`
    );
  }

  /**
   * Fetch candles from a specific provider
   */
  private async fetchCandlesFromSpecificProvider(
    providerType: ProviderType,
    symbol: string,
    interval: string,
    outputsize: number
  ): Promise<any[]> {
    switch (providerType) {
      case ProviderType.TWELVE_DATA:
        return await this.twelveData.getTimeSeries(symbol, interval, outputsize);
      
      case ProviderType.ALPHA_VANTAGE:
        return await this.alphaVantage.getTimeSeries(symbol, interval, outputsize);
      
      default:
        throw new Error(`Unsupported provider: ${providerType}`);
    }
  }

  /**
   * Handle provider error and update state
   */
  private handleProviderError(providerType: ProviderType, error: any): void {
    const state = this.providerStates.get(providerType);
    if (!state) return;

    state.errorCount++;
    state.lastErrorAt = Date.now();

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for quota exhaustion
    if (errorMessage.includes('run out of API credits') || 
        errorMessage.includes('quota') || 
        errorMessage.includes('429')) {
      this.logger.error(
        `🚨 ${providerType} QUOTA EXHAUSTED: ${errorMessage}`
      );

      state.status = ProviderStatus.QUOTA_EXHAUSTED;
      state.quotaExhaustedAt = Date.now();

      // Calculate next reset time (next occurrence of quotaResetHour UTC)
      const now = new Date();
      const resetTime = new Date(now);
      resetTime.setUTCHours(this.quotaResetHour, 0, 0, 0);

      // If reset time is in the past today, move to tomorrow
      if (resetTime.getTime() <= now.getTime()) {
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
      }

      state.quotaResetTime = resetTime.getTime();

      this.logger.warn(
        `⏰ ${providerType} quota will reset at ${resetTime.toISOString()} (${Math.round((state.quotaResetTime - Date.now()) / 3600000)}h from now)`
      );

      // Stop polling to prevent further quota waste
      this.stopPolling();
    } else {
      this.logger.error(`❌ ${providerType} error: ${errorMessage}`);
      state.status = ProviderStatus.ERROR;
    }
  }

  /**
   * Get simulated quote (placeholder)
   */
  private getSimulatedQuote(symbol: string): any {
    // Return placeholder indicating simulated mode
    // Actual simulated data comes from SimulatedMarketEngineService
    return {
      symbol,
      simulated: true,
      message: 'Use SimulatedMarketEngineService for simulated quotes',
    };
  }

  /**
   * Get simulated candles (placeholder)
   */
  private getSimulatedCandles(symbol: string, interval: string, outputsize: number): any[] {
    // Return placeholder indicating simulated mode
    // Actual simulated candles should come from backend candle generator
    return [];
  }

  /**
   * Subscribe symbol for polling
   */
  subscribeSymbol(symbol: string): void {
    if (!this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.add(symbol);
      this.logger.log(`📊 Subscribed to ${symbol} for polling (total: ${this.subscribedSymbols.size})`);
    }
  }

  /**
   * Unsubscribe symbol from polling
   */
  unsubscribeSymbol(symbol: string): void {
    if (this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.delete(symbol);
      this.logger.log(`📊 Unsubscribed from ${symbol} (remaining: ${this.subscribedSymbols.size})`);
    }
  }

  /**
   * Start polling scheduler
   */
  private startPolling(): void {
    if (this.pollingTimer) {
      return;
    }

    this.logger.log(`🔄 Starting market data polling (interval: ${this.pollingInterval}ms)`);

    const poll = async () => {
      if (this.subscribedSymbols.size === 0) {
        // No symbols to poll
        return;
      }

      const state = this.providerStates.get(this.primaryProvider);
      if (!state || state.status !== ProviderStatus.AVAILABLE) {
        this.logger.debug(`⏸️  Skipping poll - ${this.primaryProvider} is ${state?.status}`);
        return;
      }

      this.logger.debug(
        `🔄 Polling ${this.subscribedSymbols.size} symbols (${Array.from(this.subscribedSymbols).join(', ')})`
      );

      // Poll all subscribed symbols
      // Don't await to prevent blocking
      for (const symbol of this.subscribedSymbols) {
        this.getQuote(symbol, 'LIVE').catch((error) => {
          // Errors are already logged in handleProviderError
        });
      }
    };

    // Start polling loop
    this.pollingTimer = setInterval(poll, this.pollingInterval);

    // Do initial poll
    poll();
  }

  /**
   * Stop polling scheduler
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      this.logger.log('⏸️  Stopped market data polling due to quota exhaustion');
    }
  }

  /**
   * Get provider status
   */
  getProviderStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [providerType, state] of this.providerStates.entries()) {
      status[providerType] = {
        status: state.status,
        requestCount: state.requestCount,
        cacheHits: state.cacheHits,
        errorCount: state.errorCount,
        quotaExhaustedAt: state.quotaExhaustedAt
          ? new Date(state.quotaExhaustedAt).toISOString()
          : null,
        quotaResetTime: state.quotaResetTime
          ? new Date(state.quotaResetTime).toISOString()
          : null,
        hoursUntilReset: state.quotaResetTime
          ? Math.round((state.quotaResetTime - Date.now()) / 3600000)
          : null,
      };
    }

    return {
      primaryProvider: this.primaryProvider,
      providers: status,
      quoteCacheSize: this.quoteCache.size,
      candleCacheSize: this.candleCache.size,
      subscribedSymbols: Array.from(this.subscribedSymbols),
      pollingActive: this.pollingTimer !== null,
    };
  }

  /**
   * Parse provider type from string
   */
  private parseProviderType(value: string): ProviderType {
    const normalized = value.toUpperCase().replace(/[^A-Z_]/g, '_');
    if (normalized in ProviderType) {
      return ProviderType[normalized as keyof typeof ProviderType];
    }
    this.logger.warn(`Unknown provider type: ${value}, defaulting to TWELVE_DATA`);
    return ProviderType.TWELVE_DATA;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.quoteCache.clear();
    this.candleCache.clear();
    this.logger.log('🗑️  Cleared all caches');
  }

  /**
   * Manually reset provider status (for admin use or auto-recovery)
   */
  resetProviderStatus(providerType: ProviderType): void {
    const state = this.providerStates.get(providerType);
    if (state) {
      const oldStatus = state.status;
      state.status = ProviderStatus.AVAILABLE;
      state.quotaExhaustedAt = undefined;
      state.quotaResetTime = undefined;
      state.errorCount = 0;
      state.lastErrorAt = undefined;
      this.logger.log(`🔄 Manually reset ${providerType} status from ${oldStatus} to AVAILABLE`);

      // Restart polling if it was stopped
      if (!this.pollingTimer) {
        this.startPolling();
      }
    }
  }

  /**
   * Force check and auto-recover all providers
   */
  autoRecoverProviders(): void {
    this.logger.log('🔍 Running auto-recovery check for all providers');
    this.checkQuotaCooldowns();
    
    // Also check if provider is configured but marked as error
    const twelveDataState = this.providerStates.get(ProviderType.TWELVE_DATA);
    if (twelveDataState && twelveDataState.status === ProviderStatus.ERROR && this.twelveData.isConfigured()) {
      this.logger.log('🔄 Provider configured but in ERROR state, attempting recovery');
      this.resetProviderStatus(ProviderType.TWELVE_DATA);
    }
  }
}
