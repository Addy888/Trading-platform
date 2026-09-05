import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Decimal from 'decimal.js';

/**
 * Market Tick
 */
export interface MarketTick {
  symbol: string;
  bid: Decimal;
  ask: Decimal;
  last: Decimal;
  spread: Decimal;
  timestamp: Date;
  source: string;
}

/**
 * Market Status
 */
export enum MarketStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  STALE = 'STALE',
}

/**
 * Market Data Engine Service
 * 
 * IMPORTANT: This provides SIMULATED market data for development.
 * NOT real market data. DO NOT use for live trading.
 * 
 * Responsibilities:
 * - Maintain bid/ask prices
 * - Calculate spread
 * - Track market status
 * - Detect stale data
 * - Emit market updates
 * 
 * Architecture:
 * - Single engine per backend process
 * - Configurable update frequency
 * - Stale data detection
 * - Clean shutdown
 */
@Injectable()
export class MarketDataEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataEngineService.name);
  private readonly enabled: boolean;
  private readonly updateIntervalMs: number;
  private readonly staleThresholdMs: number;
  
  private marketUpdateInterval: NodeJS.Timeout | null = null;
  private currentTicks: Map<string, MarketTick> = new Map();
  private marketStatus: MarketStatus = MarketStatus.DISCONNECTED;

  // Symbol configurations
  private readonly symbolConfigs: Array<{
    symbol: string;
    basePrice: number;
    minPrice: number;
    maxPrice: number;
    volatility: number;
    spreadPips: number; // Spread in pips
    precision: number;
  }> = [
    {
      symbol: 'EURUSD',
      basePrice: 1.0850,
      minPrice: 1.0000,
      maxPrice: 1.2000,
      volatility: 0.0005,
      spreadPips: 1.5, // 1.5 pips spread
      precision: 5,
    },
    {
      symbol: 'GBPUSD',
      basePrice: 1.2650,
      minPrice: 1.1000,
      maxPrice: 1.4000,
      volatility: 0.0006,
      spreadPips: 2.0,
      precision: 5,
    },
    {
      symbol: 'USDJPY',
      basePrice: 149.50,
      minPrice: 130.00,
      maxPrice: 160.00,
      volatility: 0.0005,
      spreadPips: 2.0, // 2 pips (0.02 for JPY pairs)
      precision: 3,
    },
    {
      symbol: 'AUDUSD',
      basePrice: 0.6550,
      minPrice: 0.5500,
      maxPrice: 0.8000,
      volatility: 0.0006,
      spreadPips: 1.5,
      precision: 5,
    },
    {
      symbol: 'USDCAD',
      basePrice: 1.3550,
      minPrice: 1.2000,
      maxPrice: 1.5000,
      volatility: 0.0005,
      spreadPips: 2.0,
      precision: 5,
    },
    {
      symbol: 'XAUUSD',
      basePrice: 2050.50,
      minPrice: 1800.00,
      maxPrice: 2400.00,
      volatility: 0.001,
      spreadPips: 30, // $0.30 spread
      precision: 2,
    },
    {
      symbol: 'XAGUSD',
      basePrice: 24.50,
      minPrice: 18.00,
      maxPrice: 35.00,
      volatility: 0.0012,
      spreadPips: 3, // $0.03 spread
      precision: 3,
    },
    {
      symbol: 'WTIUSD',
      basePrice: 75.50,
      minPrice: 50.00,
      maxPrice: 120.00,
      volatility: 0.001,
      spreadPips: 5, // $0.05 spread
      precision: 2,
    },
    {
      symbol: 'BTCUSD',
      basePrice: 43500.00,
      minPrice: 20000.00,
      maxPrice: 70000.00,
      volatility: 0.002,
      spreadPips: 10, // $10 spread
      precision: 2,
    },
    {
      symbol: 'ETHUSD',
      basePrice: 2250.00,
      minPrice: 1000.00,
      maxPrice: 5000.00,
      volatility: 0.0025,
      spreadPips: 2, // $2 spread
      precision: 2,
    },
  ];

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.enabled = process.env.MARKET_DATA_ENABLED !== 'false';
    this.updateIntervalMs = parseInt(
      process.env.MARKET_UPDATE_INTERVAL_MS || '2000',
      10,
    );
    this.staleThresholdMs = parseInt(
      process.env.MARKET_STALE_THRESHOLD_MS || '10000',
      10,
    );
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Market data engine is DISABLED');
      return;
    }

    this.logger.log('Starting market data engine (SIMULATED)');
    this.initializePrices();
    this.startMarketUpdates();
    this.marketStatus = MarketStatus.CONNECTED;
  }

  async onModuleDestroy() {
    this.stopMarketUpdates();
    this.marketStatus = MarketStatus.DISCONNECTED;
  }

  /**
   * Initialize prices from configuration
   */
  private initializePrices(): void {
    for (const config of this.symbolConfigs) {
      const midPrice = new Decimal(config.basePrice);
      const spreadDecimal = this.calculateSpreadDecimal(
        config.spreadPips,
        config.precision,
      );

      const bid = midPrice.minus(spreadDecimal.dividedBy(2));
      const ask = midPrice.plus(spreadDecimal.dividedBy(2));

      const tick: MarketTick = {
        symbol: config.symbol,
        bid: new Decimal(bid.toFixed(config.precision)),
        ask: new Decimal(ask.toFixed(config.precision)),
        last: midPrice,
        spread: spreadDecimal,
        timestamp: new Date(),
        source: 'SIMULATED',
      };

      this.currentTicks.set(config.symbol, tick);
    }
  }

  /**
   * Calculate spread in decimal from pips
   */
  private calculateSpreadDecimal(spreadPips: number, precision: number): Decimal {
    // For most pairs: 1 pip = 0.0001 (4 decimal places)
    // For JPY pairs: 1 pip = 0.01 (2 decimal places)
    const pipValue = precision === 3 ? 0.01 : precision === 5 ? 0.0001 : 0.01;
    return new Decimal(spreadPips * pipValue);
  }

  /**
   * Start periodic price updates
   */
  private startMarketUpdates(): void {
    if (this.marketUpdateInterval) {
      return;
    }

    this.marketUpdateInterval = setInterval(() => {
      this.updateMarketPrices();
      this.checkStaleData();
    }, this.updateIntervalMs);

    this.logger.log(
      `Market updates started: ${this.updateIntervalMs}ms interval`,
    );
  }

  /**
   * Stop periodic price updates
   */
  private stopMarketUpdates(): void {
    if (this.marketUpdateInterval) {
      clearInterval(this.marketUpdateInterval);
      this.marketUpdateInterval = null;
      this.logger.log('Market updates stopped');
    }
  }

  /**
   * Update all market prices
   */
  private updateMarketPrices(): void {
    const updates: MarketTick[] = [];

    for (const config of this.symbolConfigs) {
      const currentTick = this.currentTicks.get(config.symbol);
      if (!currentTick) continue;

      // Simulate price movement
      const midPrice = this.simulatePriceMovement(
        currentTick.last,
        config.volatility,
        config.minPrice,
        config.maxPrice,
        config.precision,
      );

      // Calculate bid/ask with spread
      const spreadDecimal = this.calculateSpreadDecimal(
        config.spreadPips,
        config.precision,
      );
      const halfSpread = spreadDecimal.dividedBy(2);

      const bid = midPrice.minus(halfSpread);
      const ask = midPrice.plus(halfSpread);

      const newTick: MarketTick = {
        symbol: config.symbol,
        bid: new Decimal(bid.toFixed(config.precision)),
        ask: new Decimal(ask.toFixed(config.precision)),
        last: midPrice,
        spread: spreadDecimal,
        timestamp: new Date(),
        source: 'SIMULATED',
      };

      this.currentTicks.set(config.symbol, newTick);
      updates.push(newTick);
    }

    // Emit market update event
    this.eventEmitter.emit('market.tick', {
      ticks: updates,
      timestamp: new Date(),
      source: 'SIMULATED',
    });
  }

  /**
   * Simulate realistic price movement
   */
  private simulatePriceMovement(
    currentPrice: Decimal,
    volatility: number,
    minPrice: number,
    maxPrice: number,
    precision: number,
  ): Decimal {
    // Random walk with mean reversion
    const randomMovement = (Math.random() - 0.5) * 2 * volatility;
    let newPrice = currentPrice.times(1 + randomMovement);

    // Enforce bounds
    const minDecimal = new Decimal(minPrice);
    const maxDecimal = new Decimal(maxPrice);

    if (newPrice.lessThan(minDecimal)) {
      newPrice = minDecimal;
    }
    if (newPrice.greaterThan(maxDecimal)) {
      newPrice = maxDecimal;
    }

    return new Decimal(newPrice.toFixed(precision));
  }

  /**
   * Check for stale data
   */
  private checkStaleData(): void {
    const now = Date.now();
    let isStale = false;

    for (const tick of this.currentTicks.values()) {
      const age = now - tick.timestamp.getTime();
      if (age > this.staleThresholdMs) {
        isStale = true;
        break;
      }
    }

    const newStatus = isStale ? MarketStatus.STALE : MarketStatus.CONNECTED;

    if (newStatus !== this.marketStatus) {
      this.marketStatus = newStatus;
      this.logger.warn(`Market status changed: ${this.marketStatus}`);
      
      this.eventEmitter.emit('market.status.changed', {
        status: this.marketStatus,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get current market tick
   */
  getTick(symbol: string): MarketTick | null {
    return this.currentTicks.get(symbol.toUpperCase()) || null;
  }

  /**
   * Get bid price (for SELL execution)
   */
  getBid(symbol: string): Decimal | null {
    const tick = this.getTick(symbol);
    return tick ? tick.bid : null;
  }

  /**
   * Get ask price (for BUY execution)
   */
  getAsk(symbol: string): Decimal | null {
    const tick = this.getTick(symbol);
    return tick ? tick.ask : null;
  }

  /**
   * Get mid price (for display)
   */
  getMidPrice(symbol: string): Decimal | null {
    const tick = this.getTick(symbol);
    return tick ? tick.last : null;
  }

  /**
   * Get spread
   */
  getSpread(symbol: string): Decimal | null {
    const tick = this.getTick(symbol);
    return tick ? tick.spread : null;
  }

  /**
   * Get market status
   */
  getMarketStatus(): MarketStatus {
    return this.marketStatus;
  }

  /**
   * Check if market data is available
   */
  isMarketAvailable(symbol: string): boolean {
    if (this.marketStatus === MarketStatus.DISCONNECTED) {
      return false;
    }
    
    const tick = this.getTick(symbol);
    if (!tick) {
      return false;
    }

    // Check if data is stale
    const age = Date.now() - tick.timestamp.getTime();
    return age <= this.staleThresholdMs;
  }

  /**
   * Get all current ticks
   */
  getAllTicks(): MarketTick[] {
    return Array.from(this.currentTicks.values());
  }

  /**
   * Get supported symbols
   */
  getSupportedSymbols(): string[] {
    return this.symbolConfigs.map((c) => c.symbol);
  }

  /**
   * Check if symbol is supported
   */
  isSymbolSupported(symbol: string): boolean {
    return this.currentTicks.has(symbol.toUpperCase());
  }
}
