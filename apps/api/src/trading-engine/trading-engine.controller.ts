import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradingEngineService } from './trading-engine.service';
import { OpenTradeDto } from './dto/open-trade.dto';
import { TradeStatus } from '@prisma/client';

@Controller('trading-accounts/:accountId')
@UseGuards(JwtAuthGuard)
export class TradingEngineController {
  constructor(private readonly tradingEngine: TradingEngineService) {}

  /**
   * Open a new trade
   * POST /api/trading-accounts/:accountId/trades
   */
  @Post('trades')
  async openTrade(
    @Param('accountId') accountId: string,
    @Body() dto: OpenTradeDto,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    return this.tradingEngine.openTrade(accountId, userId, dto);
  }

  /**
   * Close an open trade
   * POST /api/trading-accounts/:accountId/trades/:tradeId/close
   */
  @Post('trades/:tradeId/close')
  async closeTrade(
    @Param('accountId') accountId: string,
    @Param('tradeId') tradeId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    return this.tradingEngine.closeTrade(accountId, tradeId, userId);
  }

  /**
   * Get account performance
   * GET /api/trading-accounts/:accountId/performance
   */
  @Get('performance')
  async getPerformance(
    @Param('accountId') accountId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    return this.tradingEngine.getAccountPerformance(accountId, userId);
  }

  /**
   * Get open positions
   * GET /api/trading-accounts/:accountId/positions
   */
  @Get('positions')
  async getPositions(
    @Param('accountId') accountId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    return this.tradingEngine.getOpenPositions(accountId, userId);
  }

  /**
   * Get trade history
   * GET /api/trading-accounts/:accountId/trades
   */
  @Get('trades')
  async getTrades(
    @Param('accountId') accountId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: TradeStatus,
  ) {
    const userId = req.user.sub;
    return this.tradingEngine.getTradeHistory(
      accountId,
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
    );
  }
}
