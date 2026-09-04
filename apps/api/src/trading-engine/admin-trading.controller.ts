import {
  Controller,
  Get,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TradingEngineService } from './trading-engine.service';
import { MarketPriceService } from '../market-data/market-price.service';
import { TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Admin Trading Controller
 * Read-only access for admins to view trading account details
 */
@Controller('admin/trading-accounts/:accountId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTradingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradingEngine: TradingEngineService,
    private readonly marketPrice: MarketPriceService,
  ) {}

  /**
   * Get account performance (Admin view)
   * GET /api/admin/trading-accounts/:accountId/performance
   */
  @Get('performance')
  async getPerformance(@Param('accountId') accountId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        challengePlan: {
          select: {
            name: true,
          },
        },
        trades: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Calculate metrics
    const totalTrades = account.trades.length;
    const openTrades = account.trades.filter(
      (t) => t.status === TradeStatus.OPEN,
    ).length;
    const closedTrades = account.trades.filter(
      (t) => t.status === TradeStatus.CLOSED,
    ).length;

    const totalRealizedPnl = account.trades
      .filter((t) => t.status === TradeStatus.CLOSED)
      .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0));

    // Calculate unrealized PnL
    let totalUnrealizedPnl = new Decimal(0);
    for (const trade of account.trades.filter(
      (t) => t.status === TradeStatus.OPEN,
    )) {
      const currentPrice = this.marketPrice.getPrice(trade.symbol);
      const unrealizedPnl = this.tradingEngine.calculateUnrealizedPnl(
        trade.side,
        trade.entryPrice,
        currentPrice,
        trade.volume,
      );
      totalUnrealizedPnl = totalUnrealizedPnl.plus(unrealizedPnl);
    }

    const totalPnl = totalRealizedPnl.plus(totalUnrealizedPnl);
    const returnPercentage = totalPnl
      .dividedBy(account.initialBalance)
      .times(100);

    return {
      accountNumber: account.accountNumber,
      user: account.user,
      challengePlan: account.challengePlan.name,
      initialBalance: account.initialBalance.toFixed(2),
      currentBalance: account.currentBalance.toFixed(2),
      equity: account.equity.toFixed(2),
      totalTrades,
      openTrades,
      closedTrades,
      totalRealizedPnl: totalRealizedPnl.toFixed(2),
      totalUnrealizedPnl: totalUnrealizedPnl.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      returnPercentage: returnPercentage.toFixed(2),
      accountStatus: account.status,
      startedAt: account.startedAt,
      createdAt: account.createdAt,
    };
  }

  /**
   * Get open positions (Admin view)
   * GET /api/admin/trading-accounts/:accountId/positions
   */
  @Get('positions')
  async getPositions(@Param('accountId') accountId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    const openTrades = await this.prisma.trade.findMany({
      where: {
        tradingAccountId: accountId,
        status: TradeStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });

    return openTrades.map((trade) => {
      const currentPrice = this.marketPrice.getPrice(trade.symbol);
      const unrealizedPnl = this.tradingEngine.calculateUnrealizedPnl(
        trade.side,
        trade.entryPrice,
        currentPrice,
        trade.volume,
      );

      return {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        volume: trade.volume.toString(),
        entryPrice: trade.entryPrice.toString(),
        currentPrice: currentPrice.toString(),
        unrealizedPnl: unrealizedPnl.toFixed(2),
        stopLoss: trade.stopLoss?.toString(),
        takeProfit: trade.takeProfit?.toString(),
        openedAt: trade.openedAt,
        priceSource: this.marketPrice.getPriceSource(),
      };
    });
  }

  /**
   * Get trade history (Admin view)
   * GET /api/admin/trading-accounts/:accountId/trades
   */
  @Get('trades')
  async getTrades(@Param('accountId') accountId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    const trades = await this.prisma.trade.findMany({
      where: { tradingAccountId: accountId },
      orderBy: { openedAt: 'desc' },
    });

    return trades.map((trade) => ({
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
    }));
  }
}
