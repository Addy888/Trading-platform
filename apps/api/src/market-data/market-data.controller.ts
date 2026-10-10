import { Controller, Get, Param, Query, UseGuards, Post, Body } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SimulatedMarketEngineService } from './simulated-market-engine.service';
import { UnifiedMarketDataService } from './unified-market-data.service';
import { TwelveDataProvider } from './providers/twelvedata/twelve-data.provider';
import { MarketDataManagerService } from './market-data-manager.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketDataSource } from './dto/normalized-tick.dto';

/**
 * Market Data Controller
 * 
 * REST API for market prices (fallback when WebSocket unavailable)
 * 
 * Day 2: Extended with unified market data endpoints (SIMULATED + LIVE)
 * Day 4: Added Twelve Data integration
 * Day 7 MVP: Integrated MarketDataManagerService to prevent quota exhaustion
 * 
 * Note: Twelve Data endpoints skip global throttling because the manager service
 * has its own quota tracking, caching (30s for quotes, 5min for candles), 
 * request deduplication, and circuit breaker protection
 */
@Controller('market')
export class MarketDataController {
  constructor(
    private readonly marketEngine: SimulatedMarketEngineService,
    private readonly unifiedMarketData: UnifiedMarketDataService,
    private readonly twelveData: TwelveDataProvider,
    private readonly marketDataManager: MarketDataManagerService,
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

  /**
   * DAY 2: Get market data status
   * 
   * GET /api/market-data/status
   */
  @Get('data/status')
  @UseGuards(JwtAuthGuard)
  getMarketDataStatus() {
    return this.unifiedMarketData.getStatus();
  }

  /**
   * DAY 2: Get market data health
   * 
   * GET /api/market-data/health
   */
  @Get('data/health')
  @UseGuards(JwtAuthGuard)
  getMarketDataHealth() {
    return this.unifiedMarketData.getHealth();
  }

  /**
   * DAY 2: Get all quotes (unified)
   * 
   * GET /api/market-data/quotes
   */
  @Get('data/quotes')
  @UseGuards(JwtAuthGuard)
  getAllQuotes(@Query('source') source?: string) {
    const dataSource = source as MarketDataSource | undefined;
    return {
      quotes: this.unifiedMarketData.getAllQuotes(dataSource),
      source: dataSource || this.unifiedMarketData.getActiveSource(),
      timestamp: new Date(),
    };
  }

  /**
   * DAY 2: Get quote for specific symbol (unified)
   * 
   * GET /api/market-data/quotes/:symbol
   */
  @Get('data/quotes/:symbol')
  @UseGuards(JwtAuthGuard)
  getQuote(
    @Param('symbol') symbol: string,
    @Query('source') source?: string,
  ) {
    const dataSource = source as MarketDataSource | undefined;
    return this.unifiedMarketData.getQuote(symbol, dataSource);
  }

  /**
   * DAY 2: Set active market data source
   * 
   * POST /api/market-data/source
   */
  @Post('data/source')
  @UseGuards(JwtAuthGuard)
  setActiveSource(@Body() body: { source: MarketDataSource }) {
    this.unifiedMarketData.setActiveSource(body.source);
    return {
      success: true,
      source: body.source,
      timestamp: new Date(),
    };
  }

  /**
   * DAY 4: Get Twelve Data provider status
   * DAY 7: Now returns MarketDataManager status with quota tracking
   * 
   * GET /api/market/twelvedata/status
   * 
   * Skip throttle: Manager handles all rate limiting internally
   */
  @Get('twelvedata/status')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  getTwelveDataStatus() {
    return this.marketDataManager.getProviderStatus();
  }

  /**
   * DAY 4: Get real-time quote from Twelve Data
   * DAY 7: Now uses MarketDataManager with caching and quota tracking
   * 
   * GET /api/market/twelvedata/quote/:symbol?mode=LIVE
   * 
   * Skip throttle: Manager has request deduplication + 30s cache + quota tracking
   */
  @Get('twelvedata/quote/:symbol')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  async getTwelveDataQuote(
    @Param('symbol') symbol: string,
    @Query('mode') mode?: string,
  ) {
    try {
      const executionMode = (mode?.toUpperCase() === 'SIMULATED' ? 'SIMULATED' : 'LIVE') as 'LIVE' | 'SIMULATED';
      const quote = await this.marketDataManager.getQuote(symbol, executionMode);
      return {
        success: true,
        symbol,
        mode: executionMode,
        quote,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        symbol,
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * DAY 4: Get historical candles from Twelve Data
   * DAY 7: Now uses MarketDataManager with caching (5min TTL) and quota tracking
   * 
   * GET /api/market/twelvedata/candles/:symbol?interval=1h&outputsize=100&mode=LIVE
   * 
   * Skip throttle: Manager has request deduplication + 5min cache + quota tracking
   */
  @Get('twelvedata/candles/:symbol')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  async getTwelveDataCandles(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1h',
    @Query('outputsize') outputsizeStr: string = '100',
    @Query('mode') mode?: string,
  ) {
    try {
      const outputsize = parseInt(outputsizeStr, 10);
      const executionMode = (mode?.toUpperCase() === 'SIMULATED' ? 'SIMULATED' : 'LIVE') as 'LIVE' | 'SIMULATED';
      const candles = await this.marketDataManager.getCandles(symbol, interval, outputsize, executionMode);
      
      return {
        success: true,
        symbol,
        interval,
        mode: executionMode,
        candles,
        count: candles.length,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        symbol,
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }
}
