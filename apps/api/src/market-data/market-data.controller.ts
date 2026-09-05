import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SimulatedMarketEngineService } from './simulated-market-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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

  /**
   * Get historical candle data for charting
   * 
   * GET /api/market/candles?symbol=EURUSD&timeframe=1H&limit=100
   */
  @Get('candles')
  @UseGuards(JwtAuthGuard)
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: string = '1H',
    @Query('limit') limitStr?: string,
  ) {
    if (!symbol) {
      throw new Error('Symbol is required');
    }

    if (!this.marketEngine.isSymbolSupported(symbol)) {
      throw new Error(`Symbol ${symbol} is not supported`);
    }

    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    // Generate simulated historical candles
    const candles = this.generateSimulatedCandles(symbol, timeframe, limit);

    return {
      symbol: symbol.toUpperCase(),
      timeframe,
      candles,
      source: this.marketEngine.getPriceSource(),
    };
  }

  private generateSimulatedCandles(symbol: string, timeframe: string, limit: number) {
    const timeframeMinutes = this.getTimeframeMinutes(timeframe);
    const currentPrice = parseFloat(this.marketEngine.getPrice(symbol).toString());
    const now = Math.floor(Date.now() / 1000);
    
    const candles = [];
    
    for (let i = limit - 1; i >= 0; i--) {
      const time = now - (i * timeframeMinutes * 60);
      
      // Generate realistic OHLC values with some randomness
      const volatility = currentPrice * 0.001; // 0.1% volatility
      const open = currentPrice + (Math.random() - 0.5) * volatility * 10;
      const close = open + (Math.random() - 0.5) * volatility * 5;
      const high = Math.max(open, close) + Math.random() * volatility * 3;
      const low = Math.min(open, close) - Math.random() * volatility * 3;
      
      candles.push({
        time,
        open: parseFloat(open.toFixed(8)),
        high: parseFloat(high.toFixed(8)),
        low: parseFloat(low.toFixed(8)),
        close: parseFloat(close.toFixed(8)),
        volume: Math.floor(Math.random() * 10000) + 1000,
      });
    }
    
    return candles;
  }

  private getTimeframeMinutes(timeframe: string): number {
    const map: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '1H': 60,
      '4H': 240,
      '1D': 1440,
    };
    return map[timeframe] || 60;
  }
}
