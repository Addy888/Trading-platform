import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Symbol Configuration
 */
interface SymbolConfig {
  symbol: string;
  initialPrice: number;
  minPrice: number;
  maxPrice: number;
  volatility: number; // Movement magnitude as percentage (e.g., 0.001 = 0.1%)
  precision: number;  // Decimal places
}

/**
 * Simulated Market Engine Service
 * 
 * IMPORTANT: This service provides SIMULATED/DEMO market prices.
 * These are NOT real market prices and do NOT connect to real exchanges.
 * 
 * Responsibilities:
 * - Maintain current simulated prices
 * - Update prices periodically
 * - Publish price updates via events
 * - Prevent prices from going negative
 * - Keep prices within reasonable ranges
 * 
 * Architecture:
 * - Single interval per backend process
 * - Configurable update frequency
 * - Clean shutdown handling
 */
@Injectable()
export class SimulatedMarketEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulatedMarketEngineService.name);
  private marketUpdateInterval: NodeJS.Timeout | null = null;
  private currentPrices: Map<string, Decimal> = new Map();
  private readonly enabled: boolean;
  private readonly updateIntervalMs: number;

  private readonly symbolConfigs: SymbolConfig[] = [
    // Forex pairs
    {
      symbol: 'EURUSD',
      initialPrice: 1.0850,
      minPrice: 1.0000,
      maxPrice: 1.2000,
      volatility: 0.0005, // ±0.05%
      precision: 5,
    },
    {
      symbol: 'GBPUSD',
      initialPrice: 1.2650,
      minPrice: 1.1000,
      maxPrice: 1.4000,
      volatility: 0.0006,
      precision: 5,
    },
    {
      symbol: 'USDJPY',
      initialPrice: 148.50,
      minPrice: 100.00,
      maxPrice: 160.00,
      volatility: 0.0005,
      precision: 3,
    },
    {
      symbol: 'AUDUSD',
      initialPrice: 0.6550,
      minPrice: 0.6000,
      maxPrice: 0.7500,
      volatility: 0.0006,
      precision: 5,
    },
    {
      symbol: 'USDCAD',
      initialPrice: 1.3520,
      minPrice: 1.2000,
      maxPrice: 1.4500,
      volatility: 0.0005,
      precision: 5,
    },
    // Commodities
    {
      symbol: 'XAUUSD', // Gold
      initialPrice: 2050.50,
      minPrice: 1800.00,
      maxPrice: 2400.00,
      volatility: 0.001, // ±0.1%
      precision: 2,
    },
    {
      symbol: 'XAGUSD', // Silver
      initialPrice: 24.50,
      minPrice: 18.00,
      maxPrice: 35.00,
      volatility: 0.0015,
      precision: 3,
    },
    {
      symbol: 'WTIUSD', // Oil
      initialPrice: 78.50,
      minPrice: 50.00,
      maxPrice: 120.00,
      volatility: 0.002,
      precision: 2,
    },
    // Crypto
    {
      symbol: 'BTCUSD',
      initialPrice: 43500.00,
      minPrice: 20000.00,
      maxPrice: 70000.00,
      volatility: 0.002, // ±0.2% (more volatile)
      precision: 2,
    },
    {
      symbol: 'ETHUSD',
      initialPrice: 2300.00,
      minPrice: 1000.00,
      maxPrice: 4500.00,
      volatility: 0.0025, // ±0.25% (more volatile)
      precision: 2,
    },
  ];

  constructor(private readonly eventEmitter: EventEmitter2) {
    // Read configuration from environment
    this.enabled = process.env.SIMULATED_MARKET_ENABLED !== 'false';
    this.updateIntervalMs = parseInt(
      process.env.MARKET_UPDATE_INTERVAL_MS || '3000',
      10,
    );

    // Initialize current prices
    this.initializePrices();
  }

  /**
   * Initialize simulated prices from configuration
   */
  private initializePrices(): void {
    for (const config of this.symbolConfigs) {
      this.currentPrices.set(
        config.symbol,
        new Decimal(config.initialPrice.toFixed(config.precision)),
      );
    }
  }

  /**
   * Start the market engine on module initialization
   */
  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Simulated market engine is DISABLED');
      return;
    }

    this.logger.log(
      `Starting simulated market engine with ${this.updateIntervalMs}ms update interval`,
    );

    // Start price update loop
    this.startPriceUpdates();
  }

  /**
   * Stop the market engine on module destruction
   */
  async onModuleDestroy() {
    this.stopPriceUpdates();
  }

  /**
   * Start periodic price updates
   */
  private startPriceUpdates(): void {
    if (this.marketUpdateInterval) {
      this.logger.warn('Market update interval already running');
      return;
    }

    this.marketUpdateInterval = setInterval(() => {
      this.updatePrices();
    }, this.updateIntervalMs);

    this.logger.log('Market price updates started');
  }

  /**
   * Stop periodic price updates
   */
  private stopPriceUpdates(): void {
    if (this.marketUpdateInterval) {
      clearInterval(this.marketUpdateInterval);
      this.marketUpdateInterval = null;
      this.logger.log('Market price updates stopped');
    }
  }

  /**
   * Update all simulated prices
   */
  private updatePrices(): void {
    const updates: Array<{ symbol: string; price: string }> = [];

    for (const config of this.symbolConfigs) {
      const newPrice = this.simulatePriceMovement(config);
      this.currentPrices.set(config.symbol, newPrice);

      updates.push({
        symbol: config.symbol,
        price: newPrice.toFixed(config.precision),
      });
    }

    // Emit price update event for WebSocket broadcasting
    this.eventEmitter.emit('market.prices.updated', {
      prices: updates,
      timestamp: new Date(),
      source: 'SIMULATED',
    });
  }

  /**
   * Simulate realistic price movement for a symbol
   */
  private simulatePriceMovement(config: SymbolConfig): Decimal {
    const currentPrice = this.currentPrices.get(config.symbol);
    if (!currentPrice) {
      return new Decimal(config.initialPrice.toFixed(config.precision));
    }

    // Generate random movement: -volatility to +volatility
    const randomMovement = (Math.random() - 0.5) * 2 * config.volatility;
    
    // Calculate new price
    let newPrice = currentPrice.times(1 + randomMovement);

    // Enforce min/max bounds
    if (newPrice.lessThan(config.minPrice)) {
      newPrice = new Decimal(config.minPrice);
    }
    if (newPrice.greaterThan(config.maxPrice)) {
      newPrice = new Decimal(config.maxPrice);
    }

    // Apply precision
    return new Decimal(newPrice.toFixed(config.precision));
  }

  /**
   * Get current price for a symbol
   */
  getPrice(symbol: string): Decimal | null {
    return this.currentPrices.get(symbol.toUpperCase()) || null;
  }

  /**
   * Get all current prices
   */
  getAllPrices(): Array<{ symbol: string; price: string }> {
    const prices: Array<{ symbol: string; price: string }> = [];

    for (const config of this.symbolConfigs) {
      const price = this.currentPrices.get(config.symbol);
      if (price) {
        prices.push({
          symbol: config.symbol,
          price: price.toFixed(config.precision),
        });
      }
    }

    return prices;
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
    return this.currentPrices.has(symbol.toUpperCase());
  }

  /**
   * Get price source description
   */
  getPriceSource(): string {
    return 'SIMULATED';
  }
}
