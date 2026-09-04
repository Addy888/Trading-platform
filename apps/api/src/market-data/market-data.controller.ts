import { Controller, Get, Param } from '@nestjs/common';
import { SimulatedMarketEngineService } from './simulated-market-engine.service';

/**
 * Market Data Controller
 * 
 * REST API for market prices (fallback when WebSocket unavailable)
 * 
 * IMPORTANT: All prices are SIMULATED/DEMO data
 */
@Controller('market')
export class MarketDataController {
  constructor(
    private readonly marketEngine: SimulatedMarketEngineService,
  ) {}

  /**
   * Get all current market prices
   * 
   * GET /api/market/prices
   */
  @Get('prices')
  getAllPrices() {
    const prices = this.marketEngine.getAllPrices();
    
    return {
      source: this.marketEngine.getPriceSource(),
      updatedAt: new Date(),
      prices,
    };
  }

  /**
   * Get price for specific symbol
   * 
   * GET /api/market/prices/:symbol
   */
  @Get('prices/:symbol')
  getSymbolPrice(@Param('symbol') symbol: string) {
    const price = this.marketEngine.getPrice(symbol);
    
    if (!price) {
      return {
        error: 'Symbol not supported',
        symbol,
        supportedSymbols: this.marketEngine.getSupportedSymbols(),
      };
    }
    
    return {
      symbol: symbol.toUpperCase(),
      price: price.toString(),
      source: this.marketEngine.getPriceSource(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get supported symbols
   * 
   * GET /api/market/symbols
   */
  @Get('symbols')
  getSupportedSymbols() {
    return {
      symbols: this.marketEngine.getSupportedSymbols(),
      source: this.marketEngine.getPriceSource(),
    };
  }
}
