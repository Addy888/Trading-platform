import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketDataManagerService } from './market-data-manager.service';

/** OANDA-only market-data surface. Execution/account APIs remain separate. */
@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketDataController {
  constructor(private readonly marketData: MarketDataManagerService) {}

  @Get('status')
  @SkipThrottle()
  getStatus() { return this.marketData.getProviderStatus(); }

  @Get('instruments')
  async getInstruments() {
    const instruments = await this.marketData.getInstruments();
    return { provider: 'OANDA', instruments };
  }

  @Get('quote/:symbol')
  async getQuote(@Param('symbol') symbol: string) {
    const quote = await this.marketData.getQuote(symbol);
    return { success: true, provider: 'OANDA', symbol, quote, timestamp: new Date().toISOString() };
  }

  @Get('candles')
  async getCandles(@Query('symbol') symbol: string, @Query('interval') interval = '1h', @Query('outputsize') outputsize = '100') {
    if (!symbol?.trim()) throw new BadRequestException('Symbol parameter is required.');
    const parsedCount = Number.parseInt(outputsize, 10);
    if (!Number.isFinite(parsedCount) || parsedCount < 1) throw new BadRequestException('outputsize must be a positive integer.');
    const count = Math.min(parsedCount, 5000);
    const candles = await this.marketData.getCandles(symbol, interval, count);
    return { success: true, provider: 'OANDA', symbol, interval, count: candles.length, candles: candles.map((candle) => ({ timestamp: candle.timestamp instanceof Date ? candle.timestamp.toISOString() : candle.timestamp, open: candle.open.toString(), high: candle.high.toString(), low: candle.low.toString(), close: candle.close.toString(), volume: candle.volume })) };
  }
}
