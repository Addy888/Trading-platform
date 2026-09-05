import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradingEngineV2Service, TradingErrorCode } from './trading-engine-v2.service';
import { MarginService } from './margin.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { OpenTradeDto } from './dto/open-trade.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

/**
 * Trading Engine V2 Controller
 * 
 * Enhanced trading endpoints with:
 * - Comprehensive validation
 * - Margin management
 * - Bid/ask execution
 * - Error handling
 */
@Controller('v2/trading-accounts/:accountId')
@UseGuards(JwtAuthGuard)
export class TradingEngineV2Controller {
  constructor(
    private readonly tradingEngine: TradingEngineV2Service,
    private readonly marginService: MarginService,
    private readonly marketData: MarketDataEngineService,
    private readonly instrumentConfig: InstrumentConfigService,
  ) {}

  /**
   * Open a new trade
   */
  @Post('trades')
  @HttpCode(HttpStatus.CREATED)
  async openTrade(
    @Param('accountId') accountId: string,
    @Body() dto: OpenTradeDto,
    @Request() req: any,
  ) {
    try {
      const trade = await this.tradingEngine.openTrade(accountId, req.user.userId, dto);

      return {
        success: true,
        trade: {
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          volume: trade.volume.toString(),
          entryPrice: trade.entryPrice.toString(),
          stopLoss: trade.stopLoss?.toString(),
          takeProfit: trade.takeProfit?.toString(),
          status: trade.status,
          openedAt: trade.openedAt,
        },
      };
    } catch (error: any) {
      throw this.handleTradingError(error);
    }
  }

  /**
   * Close a trade
   */
  @Delete('trades/:tradeId')
  @HttpCode(HttpStatus.OK)
  async closeTrade(
    @Param('accountId') accountId: string,
    @Param('tradeId') tradeId: string,
    @Request() req: any,
  ) {
    try {
      const trade = await this.tradingEngine.closeTrade(accountId, tradeId, req.user.userId);

      return {
        success: true,
        trade: {
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          volume: trade.volume.toString(),
          entryPrice: trade.entryPrice.toString(),
          exitPrice: trade.exitPrice?.toString(),
          realizedPnl: trade.realizedPnl.toFixed(2),
          status: trade.status,
          openedAt: trade.openedAt,
          closedAt: trade.closedAt,
        },
      };
    } catch (error: any) {
      throw this.handleTradingError(error);
    }
  }

  /**
   * Update position SL/TP
   */
  @Patch('trades/:tradeId')
  @HttpCode(HttpStatus.OK)
  async updatePosition(
    @Param('accountId') accountId: string,
    @Param('tradeId') tradeId: string,
    @Body() dto: UpdatePositionDto,
    @Request() req: any,
  ) {
    try {
      const trade = await this.tradingEngine.updatePosition(
        accountId,
        tradeId,
        req.user.userId,
        dto,
      );

      return {
        success: true,
        trade: {
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          volume: trade.volume.toString(),
          entryPrice: trade.entryPrice.toString(),
          stopLoss: trade.stopLoss?.toString(),
          takeProfit: trade.takeProfit?.toString(),
          status: trade.status,
        },
      };
    } catch (error: any) {
      throw this.handleTradingError(error);
    }
  }

  /**
   * Get account margin information
   */
  @Get('margin')
  async getMarginInfo(
    @Param('accountId') accountId: string,
    @Request() req: any,
  ) {
    const marginInfo = await this.marginService.calculateAccountMargin(accountId);

    return {
      accountId: marginInfo.accountId,
      balance: marginInfo.balance.toFixed(2),
      equity: marginInfo.equity.toFixed(2),
      usedMargin: marginInfo.usedMargin.toFixed(2),
      freeMargin: marginInfo.freeMargin.toFixed(2),
      marginLevel: marginInfo.marginLevel.toFixed(2),
      openPositions: marginInfo.openPositions,
    };
  }

  /**
   * Get market quotes with bid/ask
   */
  @Get('quotes')
  async getMarketQuotes() {
    const ticks = this.marketData.getAllTicks();
    const marketStatus = this.marketData.getMarketStatus();

    return {
      status: marketStatus,
      quotes: ticks.map((tick) => ({
        symbol: tick.symbol,
        bid: tick.bid.toString(),
        ask: tick.ask.toString(),
        spread: tick.spread.toString(),
        last: tick.last.toString(),
        timestamp: tick.timestamp,
      })),
    };
  }

  /**
   * Get instrument specifications
   */
  @Get('instruments')
  async getInstruments() {
    const instruments = this.instrumentConfig.getEnabledInstruments();

    return {
      instruments: instruments.map((inst) => ({
        symbol: inst.symbol,
        name: inst.name,
        category: inst.category,
        minVolume: inst.minVolume.toString(),
        maxVolume: inst.maxVolume.toString(),
        volumeStep: inst.volumeStep.toString(),
        defaultLeverage: inst.defaultLeverage,
        maxLeverage: inst.maxLeverage,
        contractSize: inst.contractSize,
        pipSize: inst.pipSize.toString(),
      })),
    };
  }

  /**
   * Get instrument details
   */
  @Get('instruments/:symbol')
  async getInstrument(@Param('symbol') symbol: string) {
    const instrument = this.instrumentConfig.getInstrument(symbol);

    if (!instrument) {
      throw new BadRequestException('Instrument not found');
    }

    return {
      symbol: instrument.symbol,
      name: instrument.name,
      category: instrument.category,
      enabled: instrument.enabled,
      minVolume: instrument.minVolume.toString(),
      maxVolume: instrument.maxVolume.toString(),
      volumeStep: instrument.volumeStep.toString(),
      contractSize: instrument.contractSize,
      contractMultiplier: instrument.contractMultiplier,
      defaultLeverage: instrument.defaultLeverage,
      maxLeverage: instrument.maxLeverage,
      pipSize: instrument.pipSize.toString(),
      precision: instrument.precision,
    };
  }

  /**
   * Handle trading errors with proper error codes
   */
  private handleTradingError(error: any): never {
    if (error.message && Object.values(TradingErrorCode).includes(error.message)) {
      const code = error.message as TradingErrorCode;
      
      const errorMessages: Record<TradingErrorCode, string> = {
        [TradingErrorCode.ACCOUNT_NOT_FOUND]: 'Trading account not found',
        [TradingErrorCode.ACCOUNT_NOT_OWNED]: 'You do not own this account',
        [TradingErrorCode.ACCOUNT_NOT_ACTIVE]: 'Account is not active',
        [TradingErrorCode.ACCOUNT_BREACHED]: 'Account has been breached and cannot trade',
        [TradingErrorCode.ACCOUNT_PASSED]: 'Account has passed challenge',
        [TradingErrorCode.MARKET_CLOSED]: 'Market is currently closed',
        [TradingErrorCode.MARKET_DATA_UNAVAILABLE]: 'Market data is unavailable',
        [TradingErrorCode.MARKET_DATA_STALE]: 'Market data is stale - please retry',
        [TradingErrorCode.INVALID_SYMBOL]: 'Invalid trading symbol',
        [TradingErrorCode.SYMBOL_DISABLED]: 'Trading symbol is disabled',
        [TradingErrorCode.INVALID_VOLUME]: 'Invalid trade volume',
        [TradingErrorCode.INVALID_SIDE]: 'Invalid trade side',
        [TradingErrorCode.INVALID_SL]: 'Invalid stop loss level',
        [TradingErrorCode.INVALID_TP]: 'Invalid take profit level',
        [TradingErrorCode.INSUFFICIENT_MARGIN]: 'Insufficient margin',
        [TradingErrorCode.POSITION_NOT_FOUND]: 'Position not found',
        [TradingErrorCode.POSITION_NOT_OPEN]: 'Position is not open',
        [TradingErrorCode.POSITION_ALREADY_CLOSED]: 'Position already closed',
        [TradingErrorCode.DAILY_LOSS_LIMIT]: 'Daily loss limit exceeded',
        [TradingErrorCode.MAX_DRAWDOWN]: 'Maximum drawdown exceeded',
        [TradingErrorCode.TRADING_DISABLED]: 'Trading is disabled',
        [TradingErrorCode.SYSTEM_ERROR]: 'System error occurred',
      };

      throw new BadRequestException({
        success: false,
        error: code,
        message: errorMessages[code] || 'Trading error',
        details: error.response || undefined,
      });
    }

    throw error;
  }
}
