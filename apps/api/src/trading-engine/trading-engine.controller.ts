import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradingEngineService } from './trading-engine.service';
import { PnLCalculationService } from './pnl-calculation.service';
import { OpenTradeDto } from './dto/open-trade.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { TradeStatus, TradeSide } from '@prisma/client';

@Controller('trading-accounts/:accountId')
@UseGuards(JwtAuthGuard)
export class TradingEngineController {
  constructor(
    private readonly tradingEngine: TradingEngineService,
    private readonly pnlCalculation: PnLCalculationService,
  ) {}

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
   * Update trade SL/TP
   * PATCH /api/trading-accounts/:accountId/trades/:tradeId
   */
  @Patch('trades/:tradeId')
  async updatePosition(
    @Param('accountId') accountId: string,
    @Param('tradeId') tradeId: string,
    @Body() dto: UpdatePositionDto,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    return this.tradingEngine.updatePosition(accountId, tradeId, userId, dto);
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

  /**
   * Get open positions with P&L details
   * GET /api/trading-accounts/:accountId/pnl/open-positions
   */
  @Get('pnl/open-positions')
  async getOpenPositionsPnL(
    @Param('accountId') accountId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    // Verify account ownership
    await this.tradingEngine.verifyAccountOwnership(accountId, userId);
    const positions = await this.pnlCalculation.getOpenPositionsPnL(accountId);
    
    // Calculate total unrealized P&L
    const totalUnrealizedPnl = positions
      .reduce((sum, p) => {
        const value = parseFloat(p.netUnrealizedPnl);
        return sum + (isNaN(value) ? 0 : value);
      }, 0)
      .toFixed(2);

    return {
      positions,
      totalUnrealizedPnl,
      totalPositionsCount: positions.length,
    };
  }

  /**
   * Get closed trades with P&L details
   * GET /api/trading-accounts/:accountId/pnl/closed-trades
   */
  @Get('pnl/closed-trades')
  async getClosedTradesPnL(
    @Param('accountId') accountId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('symbol') symbol?: string,
    @Query('side') side?: TradeSide,
  ) {
    const userId = req.user.sub;
    // Verify account ownership
    await this.tradingEngine.verifyAccountOwnership(accountId, userId);
    
    const options = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      symbol,
      side,
    };

    const result = await this.pnlCalculation.getClosedTradesPnL(accountId, options);

    // Calculate total net P&L for these trades
    const totalNetPnl = result.trades
      .reduce((sum, t) => {
        const value = parseFloat(t.netPnl);
        return sum + (isNaN(value) ? 0 : value);
      }, 0)
      .toFixed(2);

    return {
      ...result,
      totalNetPnl,
    };
  }

  /**
   * Get account financial summary
   * GET /api/trading-accounts/:accountId/pnl/summary
   */
  @Get('pnl/summary')
  async getFinancialSummary(
    @Param('accountId') accountId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    // Verify account ownership
    await this.tradingEngine.verifyAccountOwnership(accountId, userId);
    return this.pnlCalculation.getAccountFinancialSummary(accountId);
  }

  /**
   * Get dashboard analytics
   * GET /api/trading-accounts/:accountId/pnl/analytics
   */
  @Get('pnl/analytics')
  async getDashboardAnalytics(
    @Param('accountId') accountId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    // Verify account ownership
    await this.tradingEngine.verifyAccountOwnership(accountId, userId);
    return this.pnlCalculation.getDashboardAnalytics(accountId);
  }

  /**
   * Generate closed trade report
   * GET /api/trading-accounts/:accountId/pnl/report
   */
  @Get('pnl/report')
  async generateTradeReport(
    @Param('accountId') accountId: string,
    @Req() req: any,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const userId = req.user.sub;
    // Verify account ownership
    await this.tradingEngine.verifyAccountOwnership(accountId, userId);

    const options = {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    };

    return this.pnlCalculation.generateClosedTradeReport(accountId, options);
  }
}
