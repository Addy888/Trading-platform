import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketDataManagerService } from './market-data-manager.service';

/** Authenticated Twelve Data market-data surface. Execution/account APIs remain separate. */
@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketDataController {
  constructor(private readonly marketData: MarketDataManagerService) {}

  @Get('status')
  @SkipThrottle()
  getStatus() { return this.marketData.getProviderStatus(); }

  @Get('instruments')
  async getInstruments() {
    return { provider: 'TWELVE_DATA', instruments: this.marketData.getSupportedSymbols() };
  }

  @Get('exchanges')
  async getExchanges(
    @Query('query') query = '',
    @Query('type') type = 'ALL',
    @Query('page') pageValue = '1',
    @Query('limit') limitValue = '20',
  ) {
    if (query.trim().length > 80) {
      throw new BadRequestException('Exchange search text must not exceed 80 characters.');
    }
    const page = this.positiveInteger(pageValue, 'page', 1, 100_000);
    const limit = this.positiveInteger(limitValue, 'limit', 20, 100);
    if (!['ALL', 'STOCK', 'CRYPTO'].includes(type.toUpperCase())) {
      throw new BadRequestException('type must be ALL, STOCK, or CRYPTO.');
    }
    const normalizedQuery = query.trim().toLowerCase();
    const exchanges = await this.marketData.getExchanges();
    const filtered = exchanges
      .filter((exchange) => type.toUpperCase() === 'ALL' || exchange.marketType === type.toUpperCase())
      .filter((exchange) => !normalizedQuery || [
        exchange.name,
        exchange.displayName,
        exchange.code || '',
        exchange.country || '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery)))
      .sort((left, right) => left.name.localeCompare(right.name));
    const offset = (page - 1) * limit;
    return {
      provider: 'TWELVE_DATA',
      exchanges: filtered.slice(offset, offset + limit).map((exchange) => ({
        ...exchange,
        marketStatus: null,
        tradingHours: null,
        dataClassification: 'NOT_PROVIDED_BY_EXCHANGE_DIRECTORY',
      })),
      pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
      limitations: ['Exchange directory does not include trading hours, live status, or user subscription entitlements.'],
    };
  }

  @Get('exchanges/:exchange/status')
  async getExchangeMarketState(@Param('exchange') exchange: string) {
    const markets = await this.marketData.getExchangeMarketState(exchange);
    return { provider: 'TWELVE_DATA', exchange, markets };
  }

  @Get('exchanges/:exchange/schedule')
  async getExchangeSchedule(@Param('exchange') exchange: string) {
    const schedule = await this.marketData.getExchangeSchedule(exchange);
    return { provider: 'TWELVE_DATA', exchange, schedule };
  }

  @Get('instruments/search')
  async searchInstruments(
    @Query('query') query: string,
    @Query('type') type = 'ALL',
    @Query('exchange') exchange?: string,
    @Query('page') pageValue = '1',
    @Query('limit') limitValue = '20',
  ) {
    if (!query?.trim() || query.trim().length < 2 || query.trim().length > 80) {
      throw new BadRequestException('query must contain between 2 and 80 characters.');
    }
    if (!['ALL', 'FOREX', 'CRYPTO', 'COMMODITY', 'STOCK', 'OTHER'].includes(type.toUpperCase())) {
      throw new BadRequestException('Unsupported instrument type filter.');
    }
    const page = this.positiveInteger(pageValue, 'page', 1, 30);
    const limit = this.positiveInteger(limitValue, 'limit', 20, 30);
    const providerLimit = 30;
    const providerResults = await this.marketData.searchInstruments(query.trim(), providerLimit, exchange);
    const filtered = type.toUpperCase() === 'ALL'
      ? providerResults
      : providerResults.filter((instrument) => instrument.assetType === type.toUpperCase());
    const offset = (page - 1) * limit;
    return {
      provider: 'TWELVE_DATA',
      instruments: filtered.slice(offset, offset + limit),
      pagination: {
        page,
        limit,
        returned: filtered.length,
        total: filtered.length,
        providerResultCap: 30,
        refineQueryWhenExhausted: providerResults.length >= providerLimit,
        hasMore: offset + limit < filtered.length,
      },
      limitations: ['Search results are limited by Twelve Data symbol search. Refine the query to discover more matches.'],
    };
  }

  @Get('instruments/details')
  async getInstrumentDetails(@Query('symbol') symbol: string, @Query('exchange') exchange?: string) {
    if (!symbol?.trim() || symbol.trim().length > 80) {
      throw new BadRequestException('A symbol between 1 and 80 characters is required.');
    }
    const instrument = await this.marketData.getInstrumentDetails(symbol, exchange);
    return { provider: 'TWELVE_DATA', instrument };
  }

  @Get('quote/:symbol')
  async getQuoteByPath(@Param('symbol') symbol: string, @Query('exchange') exchange?: string) {
    const quote = await this.marketData.getQuote(symbol, exchange);
    const servedAt = new Date().toISOString();
    return { success: true, provider: 'TWELVE_DATA', symbol, quote, servedAt, timestamp: servedAt };
  }

  @Get('quote')
  async getQuote(@Query('symbol') symbol: string, @Query('exchange') exchange?: string) {
    if (!symbol?.trim() || symbol.trim().length > 80) {
      throw new BadRequestException('A symbol between 1 and 80 characters is required.');
    }
    const quote = await this.marketData.getQuote(symbol, exchange);
    const servedAt = new Date().toISOString();
    return { success: true, provider: 'TWELVE_DATA', symbol, quote, servedAt, timestamp: servedAt };
  }

  @Get('candles')
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('interval') interval = '1h',
    @Query('outputsize') outputsize = '100',
    @Query('exchange') exchange?: string,
  ) {
    if (!symbol?.trim()) throw new BadRequestException('Symbol parameter is required.');
    if (!/^\d+$/.test(outputsize)) throw new BadRequestException('outputsize must be a positive integer.');
    const parsedCount = Number(outputsize);
    if (!Number.isSafeInteger(parsedCount) || parsedCount < 1) throw new BadRequestException('outputsize must be a positive integer.');
    const count = Math.min(parsedCount, 5000);
    
    // ✅ Log incoming request
    const requestLog = {
      symbol,
      interval,
      count,
      exchange: exchange || 'none',
      timestamp: new Date().toISOString()
    };
    console.log('[market-data.controller] Candles request:', requestLog);
    
    const candles = await this.marketData.getCandles(symbol, interval, count, exchange);
    
    // ✅ Validate candles before sending to frontend
    const invalidCandles: number[] = [];
    candles.forEach((candle, idx) => {
      const open = Number(candle.open.toString());
      const high = Number(candle.high.toString());
      const low = Number(candle.low.toString());
      const close = Number(candle.close.toString());
      
      if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        invalidCandles.push(idx);
      } else if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
        invalidCandles.push(idx);
      }
    });
    
    if (invalidCandles.length > 0) {
      console.error('[market-data.controller] Found invalid candles at indices:', invalidCandles.slice(0, 10));
      throw new BadRequestException(`Provider returned ${invalidCandles.length} invalid candles. Cannot serve malformed data.`);
    }
    
    const formattedCandles = candles.map((candle) => ({
      timestamp: candle.timestamp instanceof Date ? candle.timestamp.toISOString() : candle.timestamp,
      open: candle.open.toString(),
      high: candle.high.toString(),
      low: candle.low.toString(),
      close: candle.close.toString(),
      volume: candle.volume
    }));
    
    // ✅ Calculate data freshness
    const now = Date.now();
    const latestCandleTime = candles.length > 0 
      ? (candles[candles.length - 1].timestamp instanceof Date 
          ? candles[candles.length - 1].timestamp.getTime() 
          : Date.parse(candles[candles.length - 1].timestamp as any))
      : 0;
    
    const ageMs = now - latestCandleTime;
    const ageMinutes = Math.floor(ageMs / 60000);
    
    // Define freshness thresholds based on interval
    const intervalMs = this.getIntervalMs(interval);
    const staleThreshold = Math.max(intervalMs * 3, 5 * 60000); // 3x interval or 5 minutes, whichever is larger
    
    const dataStatus: 'LIVE' | 'DELAYED' | 'STALE' = 
      ageMs < intervalMs * 1.5 ? 'LIVE' :
      ageMs < staleThreshold ? 'DELAYED' : 'STALE';
    
    // ✅ Log response summary with freshness
    console.log('[market-data.controller] Candles response:', {
      symbol,
      interval,
      candleCount: formattedCandles.length,
      firstCandle: formattedCandles[0]?.timestamp || null,
      lastCandle: formattedCandles[formattedCandles.length - 1]?.timestamp || null,
      dataStatus,
      ageMinutes,
      servedAt: new Date().toISOString()
    });
    
    return {
      success: true,
      provider: 'TWELVE_DATA',
      symbol,
      interval,
      count: formattedCandles.length,
      candles: formattedCandles,
      metadata: {
        latestCandleTimestamp: formattedCandles[formattedCandles.length - 1]?.timestamp || null,
        dataStatus,
        ageMinutes,
        serverTimestamp: new Date().toISOString(),
      }
    };
  }

  private getIntervalMs(interval: string): number {
    const map: Record<string, number> = {
      '1min': 60000,
      '5min': 5 * 60000,
      '15min': 15 * 60000,
      '30min': 30 * 60000,
      '1h': 60 * 60000,
      '4h': 4 * 60 * 60000,
      '1day': 24 * 60 * 60000,
    };
    return map[interval] || 60000;
  }

  private positiveInteger(value: string, name: string, fallback: number, maximum: number): number {
    if (!/^\d+$/.test(value)) throw new BadRequestException(`${name} must be a positive integer.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BadRequestException(`${name} must be a positive integer.`);
    return Math.min(parsed, maximum || fallback);
  }
}
