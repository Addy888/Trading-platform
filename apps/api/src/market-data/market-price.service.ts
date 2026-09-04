import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import Decimal from 'decimal.js';

/**
 * Market Price Service
 * 
 * IMPORTANT: This service provides SIMULATED/DEMO market prices for development.
 * These are NOT real market prices and should NOT be used for live trading.
 * 
 * This abstraction allows future integration with:
 * - Live price feeds
 * - External broker APIs
 * - WebSocket price streams
 * - Third-party market data providers
 * 
 * Day 8: Now integrates with SimulatedMarketEngineService for real-time prices
 */
@Injectable()
export class MarketPriceService {
  private simulatedMarketEngine: any = null;
  
  private readonly fallbackPrices: Map<string, number> = new Map([
    // Forex pairs
    ['EURUSD', 1.0850],
    ['GBPUSD', 1.2650],
    ['USDJPY', 149.50],
    ['AUDUSD', 0.6550],
    ['USDCAD', 1.3550],
    
    // Commodities
    ['XAUUSD', 2050.50],  // Gold
    ['XAGUSD', 24.50],    // Silver
    ['WTIUSD', 75.50],    // Oil
    
    // Crypto
    ['BTCUSD', 43500.00],
    ['ETHUSD', 2250.00],
  ]);

  /**
   * Set simulated market engine (injected after construction to avoid circular dependency)
   */
  setSimulatedMarketEngine(engine: any) {
    this.simulatedMarketEngine = engine;
  }

  /**
   * Get current simulated price for a symbol
   * @param symbol Trading symbol (e.g., EURUSD, BTCUSD)
   * @returns Decimal price value
   * @throws BadRequestException if symbol is not supported
   */
  getPrice(symbol: string): Decimal {
    const upperSymbol = symbol.toUpperCase();
    
    // Try to get price from simulated market engine if available
    if (this.simulatedMarketEngine) {
      const price = this.simulatedMarketEngine.getPrice(upperSymbol);
      if (price) {
        return price;
      }
    }
    
    // Fallback to static prices with variation
    if (!this.fallbackPrices.has(upperSymbol)) {
      throw new BadRequestException(
        `Symbol ${symbol} is not supported. Available symbols: ${this.getSupportedSymbols().join(', ')}`
      );
    }

    const price = this.fallbackPrices.get(upperSymbol);
    
    // Add small random variation (±0.1%) to simulate price movement
    // This makes the demo more realistic without being deterministic
    const variation = (Math.random() - 0.5) * 0.002; // ±0.1%
    const simulatedPrice = price * (1 + variation);

    return new Decimal(simulatedPrice.toFixed(8));
  }

  /**
   * Get list of supported symbols
   * @returns Array of symbol strings
   */
  getSupportedSymbols(): string[] {
    if (this.simulatedMarketEngine) {
      return this.simulatedMarketEngine.getSupportedSymbols();
    }
    return Array.from(this.fallbackPrices.keys()).sort();
  }

  /**
   * Check if a symbol is supported
   * @param symbol Trading symbol
   * @returns boolean
   */
  isSymbolSupported(symbol: string): boolean {
    if (this.simulatedMarketEngine) {
      return this.simulatedMarketEngine.isSymbolSupported(symbol);
    }
    return this.fallbackPrices.has(symbol.toUpperCase());
  }

  /**
   * Get price source description
   * @returns String describing the price source
   */
  getPriceSource(): string {
    if (this.simulatedMarketEngine) {
      return this.simulatedMarketEngine.getPriceSource();
    }
    return 'SIMULATED_DEMO';
  }
}
