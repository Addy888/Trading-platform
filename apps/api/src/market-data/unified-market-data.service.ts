import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import Decimal from 'decimal.js';
import {
  NormalizedTick,
  MarketDataSource,
  MarketConnectionStatus,
  MarketDataStatusDto,
  QuoteResponseDto,
  MarketDataHealthDto,
} from './dto/normalized-tick.dto';
import { TwelveDataProvider } from './providers/twelvedata/twelve-data.provider';

/**
 * Unified Market Data Service
 * 
 * Centralized service for all market data sources (SIMULATED and LIVE).
 * 
 * Architecture:
 * - Maintains in-memory cache of latest ticks per instrument
 * - Supports multiple data sources (simulated, Angel One, future providers)
 * - Provides unified API for price queries
 * - Tracks data freshness and staleness
 * - Never silently falls back between sources
 * 
 * Rules:
 * - SIMULATED mode: Uses generated forex/crypto data
 * - LIVE mode: Uses real broker data (when available)
 * - Each instrument has ONE active source
 * - Stale data is clearly marked
 * - No silent fallbacks between sources
 * 
 * Day 2: Initial implementation with SIMULATED as default
 */
@Injectable()
export class UnifiedMarketDataService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnifiedMarketDataService.name);
  
  // In-memory cache: symbol -> latest tick
  private tickCache: Map<string, NormalizedTick> = new Map();
  
  // Active data source (can be changed at runtime)
  private activeSource: MarketDataSource = MarketDataSource.SIMULATED;
  
  // Source status tracking
  private sourceStatus: Map<MarketDataSource, MarketConnectionStatus> = new Map();
  
  // Freshness thresholds (milliseconds)
  private readonly staleThresholdMs = parseInt(
    process.env.MARKET_DATA_STALE_THRESHOLD_MS || '10000',
    10
  );
  
  // Statistics
  private readonly stats = {
    totalTicks: 0,
    ticksBySource: new Map<MarketDataSource, number>(),
    errorsBySource: new Map<MarketDataSource, number>(),
    lastTickTime: new Map<MarketDataSource, Date>(),
  };

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly twelveData: TwelveDataProvider,
  ) {
    // Initialize source status
    this.sourceStatus.set(MarketDataSource.SIMULATED, MarketConnectionStatus.DISCONNECTED);
    this.sourceStatus.set(MarketDataSource.ANGELONE_LIVE, MarketConnectionStatus.DISCONNECTED);
    this.sourceStatus.set(MarketDataSource.TWELVEDATA, MarketConnectionStatus.DISCONNECTED);
  }

  async onModuleInit() {
    this.logger.log('Unified Market Data Service initialized');
    this.logger.log(`Active source: ${this.activeSource}`);
    this.logger.log(`Stale threshold: ${this.staleThresholdMs}ms`);
  }

  async onModuleDestroy() {
    this.tickCache.clear();
    this.logger.log('Unified Market Data Service destroyed');
  }

  /**
   * Listen to simulated market tick events (from SimulatedMarketEngineService)
   */
  @OnEvent('market.tick')
  handleSimulatedTick(event: { ticks: any[]; timestamp: Date; source: string }) {
    if (event.source !== 'SIMULATED') {
      return;
    }

    for (const tick of event.ticks) {
      const normalized = this.normalizeSimulatedTick(tick);
      this.updateTick(normalized);
    }

    this.sourceStatus.set(MarketDataSource.SIMULATED, MarketConnectionStatus.CONNECTED);
    this.stats.lastTickTime.set(MarketDataSource.SIMULATED, new Date());
  }

  /**
   * Listen to broker market data events (from AngelOneWebSocketAdapter)
   */
  @OnEvent('broker.marketdata.tick')
  handleBrokerTick(event: { provider: string; tick: any; timestamp: Date }) {
    if (event.provider !== 'ANGELONE') {
      return;
    }

    try {
      const normalized = this.normalizeAngelOneTick(event.tick);
      this.updateTick(normalized);
      
      this.sourceStatus.set(MarketDataSource.ANGELONE_LIVE, MarketConnectionStatus.CONNECTED);
      this.stats.lastTickTime.set(MarketDataSource.ANGELONE_LIVE, new Date());
    } catch (error) {
      this.logger.error(`Failed to normalize Angel One tick: ${(error as Error).message}`);
      this.incrementErrorCount(MarketDataSource.ANGELONE_LIVE);
    }
  }

  /**
   * Listen to broker connection events
   */
  @OnEvent('broker.marketdata.connected')
  handleBrokerConnected(event: { provider: string; timestamp: Date }) {
    if (event.provider === 'ANGELONE') {
      this.logger.log('Angel One market data connected');
      this.sourceStatus.set(MarketDataSource.ANGELONE_LIVE, MarketConnectionStatus.CONNECTED);
    }
  }

  @OnEvent('broker.marketdata.disconnected')
  handleBrokerDisconnected(event: { provider: string; timestamp: Date }) {
    if (event.provider === 'ANGELONE') {
      this.logger.warn('Angel One market data disconnected');
      this.sourceStatus.set(MarketDataSource.ANGELONE_LIVE, MarketConnectionStatus.DISCONNECTED);
    }
  }

  @OnEvent('broker.marketdata.error')
  handleBrokerError(event: { provider: string; error: string; timestamp: Date }) {
    if (event.provider === 'ANGELONE') {
      this.logger.error(`Angel One market data error: ${event.error}`);
      this.sourceStatus.set(MarketDataSource.ANGELONE_LIVE, MarketConnectionStatus.ERROR);
      this.incrementErrorCount(MarketDataSource.ANGELONE_LIVE);
    }
  }

  /**
   * Listen to Twelve Data provider tick events
   */
  @OnEvent('market.provider.tick')
  handleTwelveDataTick(event: { provider: string; symbol: string; price: Decimal; timestamp: Date; receivedAt: Date }) {
    if (event.provider !== 'TWELVEDATA') {
      return;
    }

    try {
      const normalized = this.normalizeTwelveDataTick(event);
      this.updateTick(normalized);
      
      this.sourceStatus.set(MarketDataSource.TWELVEDATA, MarketConnectionStatus.CONNECTED);
      this.stats.lastTickTime.set(MarketDataSource.TWELVEDATA, new Date());
    } catch (error) {
      this.logger.error(`Failed to normalize Twelve Data tick: ${(error as Error).message}`);
      this.incrementErrorCount(MarketDataSource.TWELVEDATA);
    }
  }

  /**
   * Listen to Twelve Data provider connection events
   */
  @OnEvent('market.provider.connected')
  handleTwelveDataConnected(event: { provider: string; timestamp: Date }) {
    if (event.provider === 'TWELVEDATA') {
      this.logger.log('Twelve Data provider connected');
      this.sourceStatus.set(MarketDataSource.TWELVEDATA, MarketConnectionStatus.CONNECTED);
    }
  }

  @OnEvent('market.provider.disconnected')
  handleTwelveDataDisconnected(event: { provider: string; code?: number; reason?: string; timestamp: Date }) {
    if (event.provider === 'TWELVEDATA') {
      this.logger.warn('Twelve Data provider disconnected');
      this.sourceStatus.set(MarketDataSource.TWELVEDATA, MarketConnectionStatus.DISCONNECTED);
    }
  }

  @OnEvent('market.provider.error')
  handleTwelveDataError(event: { provider: string; error: string; timestamp: Date }) {
    if (event.provider === 'TWELVEDATA') {
      this.logger.error(`Twelve Data provider error: ${event.error}`);
      this.sourceStatus.set(MarketDataSource.TWELVEDATA, MarketConnectionStatus.ERROR);
      this.incrementErrorCount(MarketDataSource.TWELVEDATA);
    }
  }

  /**
   * Normalize simulated tick to standard format
   */
  private normalizeSimulatedTick(tick: any): NormalizedTick {
    return {
      symbol: tick.symbol,
      source: MarketDataSource.SIMULATED,
      lastTradedPrice: tick.last,
      bid: tick.bid,
      ask: tick.ask,
      spread: tick.spread,
      receivedAt: tick.timestamp,
      connectionStatus: MarketConnectionStatus.CONNECTED,
      isStale: false,
    };
  }

  /**
   * Normalize Angel One tick to standard format
   */
  private normalizeAngelOneTick(tick: any): NormalizedTick {
    // Validate required fields
    if (!tick.token) {
      throw new Error('Missing instrument token');
    }

    // Validate prices (no negative, NaN, or Infinity)
    const validatePrice = (price: number | undefined): Decimal | undefined => {
      if (price === undefined || price === null) {
        return undefined;
      }
      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Invalid price: ${price}`);
      }
      return new Decimal(price);
    };

    return {
      symbol: this.tokenToSymbol(tick.token, tick.exchangeType),
      source: MarketDataSource.ANGELONE_LIVE,
      providerInstrumentId: tick.token,
      exchange: this.getExchangeName(tick.exchangeType),
      lastTradedPrice: validatePrice(tick.lastTradedPrice),
      bid: validatePrice(tick.bidPrice),
      ask: validatePrice(tick.askPrice),
      open: validatePrice(tick.openPriceOfTheDay),
      high: validatePrice(tick.highPriceOfTheDay),
      low: validatePrice(tick.lowPriceOfTheDay),
      close: validatePrice(tick.closedPrice),
      lastTradedQuantity: tick.lastTradedQuantity,
      bidQuantity: tick.bidQty,
      askQuantity: tick.askQty,
      volume: tick.volumeTradeForTheDay,
      exchangeTimestamp: tick.exchangeTimestamp 
        ? new Date(tick.exchangeTimestamp) 
        : undefined,
      receivedAt: new Date(),
      connectionStatus: MarketConnectionStatus.CONNECTED,
      isStale: false,
    };
  }

  /**
   * Normalize Twelve Data tick to standard format
   */
  private normalizeTwelveDataTick(event: { provider: string; symbol: string; price: Decimal; timestamp: Date; receivedAt: Date }): NormalizedTick {
    return {
      symbol: event.symbol,
      source: MarketDataSource.TWELVEDATA,
      lastTradedPrice: event.price,
      exchangeTimestamp: event.timestamp,
      receivedAt: event.receivedAt,
      connectionStatus: MarketConnectionStatus.CONNECTED,
      isStale: false,
    };
  }

  /**
   * Update tick in cache
   */
  private updateTick(tick: NormalizedTick): void {
    this.tickCache.set(tick.symbol, tick);
    this.stats.totalTicks++;
    
    const sourceCount = this.stats.ticksBySource.get(tick.source) || 0;
    this.stats.ticksBySource.set(tick.source, sourceCount + 1);

    // Emit normalized tick event for downstream consumers
    this.eventEmitter.emit('market.tick.normalized', tick);
  }

  /**
   * Get quote for a symbol
   */
  getQuote(symbol: string, preferredSource?: MarketDataSource): QuoteResponseDto {
    const source = preferredSource || this.activeSource;
    const tick = this.tickCache.get(symbol);

    if (!tick) {
      return {
        symbol,
        source,
        tick: null,
        available: false,
        reason: 'Instrument not found in cache',
      };
    }

    // Check if source matches
    if (tick.source !== source) {
      return {
        symbol,
        source,
        tick: null,
        available: false,
        reason: `Instrument only available in ${tick.source} mode`,
      };
    }

    // Check staleness
    const age = Date.now() - tick.receivedAt.getTime();
    const isStale = age > this.staleThresholdMs;

    if (isStale) {
      return {
        symbol,
        source,
        tick: { ...tick, isStale: true },
        available: false,
        reason: `Data is stale (${Math.round(age / 1000)}s old)`,
      };
    }

    return {
      symbol,
      source,
      tick,
      available: true,
    };
  }

  /**
   * Get all quotes
   */
  getAllQuotes(source?: MarketDataSource): NormalizedTick[] {
    const filterSource = source || this.activeSource;
    const quotes: NormalizedTick[] = [];

    for (const tick of this.tickCache.values()) {
      if (tick.source === filterSource) {
        // Check staleness
        const age = Date.now() - tick.receivedAt.getTime();
        const isStale = age > this.staleThresholdMs;
        
        quotes.push({ ...tick, isStale });
      }
    }

    return quotes;
  }

  /**
   * Get market data status
   */
  getStatus(): MarketDataStatusDto {
    const status = this.sourceStatus.get(this.activeSource) || MarketConnectionStatus.DISCONNECTED;
    const lastTick = this.stats.lastTickTime.get(this.activeSource);
    const subscribedCount = this.tickCache.size;

    return {
      source: this.activeSource,
      status,
      lastTickAt: lastTick,
      subscribedInstruments: subscribedCount,
      supportedExchanges: this.getSupportedExchanges(),
    };
  }

  /**
   * Get health status
   */
  getHealth(): MarketDataHealthDto {
    const sources: any = {};

    for (const [source, status] of this.sourceStatus.entries()) {
      const lastTick = this.stats.lastTickTime.get(source);
      const lastTickAge = lastTick ? Date.now() - lastTick.getTime() : -1;
      const tickCount = this.stats.ticksBySource.get(source) || 0;
      const errorCount = this.stats.errorsBySource.get(source) || 0;

      sources[source] = {
        status,
        tickCount,
        lastTickAge,
        errorCount,
      };
    }

    // Determine overall health
    const activeStatus = this.sourceStatus.get(this.activeSource);
    let overall: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'DOWN';

    if (activeStatus === MarketConnectionStatus.CONNECTED) {
      const lastTick = this.stats.lastTickTime.get(this.activeSource);
      if (lastTick && Date.now() - lastTick.getTime() < this.staleThresholdMs * 2) {
        overall = 'HEALTHY';
      } else {
        overall = 'DEGRADED';
      }
    } else if (activeStatus === MarketConnectionStatus.RECONNECTING) {
      overall = 'DEGRADED';
    }

    return {
      overall,
      sources,
      timestamp: new Date(),
    };
  }

  /**
   * Set active data source
   */
  setActiveSource(source: MarketDataSource): void {
    this.logger.log(`Switching active source: ${this.activeSource} → ${source}`);
    this.activeSource = source;
    
    this.eventEmitter.emit('market.source.changed', {
      previousSource: this.activeSource,
      newSource: source,
      timestamp: new Date(),
    });
  }

  /**
   * Get active source
   */
  getActiveSource(): MarketDataSource {
    return this.activeSource;
  }

  /**
   * Check if data is fresh enough for trading
   * Used by Day 3 order placement validation
   */
  isFreshEnoughForTrading(symbol: string): boolean {
    const quote = this.getQuote(symbol);
    return quote.available && !quote.tick?.isStale;
  }

  /**
   * Helper: Convert Angel One token to symbol
   * TODO: Implement proper instrument master lookup
   */
  private tokenToSymbol(token: string, exchangeType: number): string {
    // Placeholder - needs instrument master service
    return `TOKEN_${token}`;
  }

  /**
   * Helper: Get exchange name from Angel One exchange type
   */
  private getExchangeName(exchangeType: number): string {
    const exchanges: { [key: number]: string } = {
      1: 'NSE',
      2: 'NFO',
      3: 'BSE',
      4: 'BFO',
      5: 'MCX',
      6: 'NCO',
      7: 'CDS',
    };
    return exchanges[exchangeType] || 'UNKNOWN';
  }

  /**
   * Get supported exchanges for active source
   */
  private getSupportedExchanges(): string[] {
    if (this.activeSource === MarketDataSource.SIMULATED) {
      return ['SIMULATED'];
    }
    if (this.activeSource === MarketDataSource.ANGELONE_LIVE) {
      return ['NSE', 'BSE', 'NFO', 'MCX', 'CDS'];
    }
    if (this.activeSource === MarketDataSource.TWELVEDATA) {
      return ['FOREX', 'CRYPTO', 'STOCKS', 'INDICES', 'ETF', 'COMMODITIES'];
    }
    return [];
  }

  /**
   * Increment error count for source
   */
  private incrementErrorCount(source: MarketDataSource): void {
    const count = this.stats.errorsBySource.get(source) || 0;
    this.stats.errorsBySource.set(source, count + 1);
  }
}
