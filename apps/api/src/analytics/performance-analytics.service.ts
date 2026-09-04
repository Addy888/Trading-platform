import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketPriceService } from '../market-data/market-price.service';
import { TradeStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';

export interface PerformanceMetrics {
  overview: {
    initialBalance: string;
    currentBalance: string;
    equity: string;
    totalPnl: string;
    returnPercentage: string;
  };
  trades: {
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: string;
    lossRate: string;
  };
  pnl: {
    realized: string;
    unrealized: string;
    averageWin: string;
    averageLoss: string;
    largestWin: string;
    largestLoss: string;
    profitFactor: string;
  };
}

/**
 * Performance Analytics Service
 * 
 * Calculates comprehensive trading performance metrics:
 * - Win/Loss statistics
 * - PnL breakdown
 * - Trade quality metrics
 * - Profit factor
 * - Return percentage
 */
@Injectable()
export class PerformanceAnalyticsService {
  private readonly CONTRACT_MULTIPLIER = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketPrice: MarketPriceService,
  ) {}

  /**
   * Calculate comprehensive performance metrics for a trading account
   * @param tradingAccountId Trading account ID
   * @param userId User ID for authorization
   */
  async calculatePerformanceMetrics(
    tradingAccountId: string,
    userId: string,
  ): Promise<PerformanceMetrics> {
    // Fetch account with trades
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        trades: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Separate open and closed trades
    const openTrades = account.trades.filter((t) => t.status === TradeStatus.OPEN);
    const closedTrades = account.trades.filter((t) => t.status === TradeStatus.CLOSED);

    // Calculate realized PnL
    const totalRealizedPnl = closedTrades.reduce(
      (sum, trade) => sum.plus(trade.realizedPnl),
      new Decimal(0),
    );

    // Calculate unrealized PnL
    let totalUnrealizedPnl = new Decimal(0);
    for (const trade of openTrades) {
      const currentPrice = this.marketPrice.getPrice(trade.symbol);
      const unrealizedPnl = this.calculateUnrealizedPnl(
        trade.side,
        trade.entryPrice,
        currentPrice,
        trade.volume,
      );
      totalUnrealizedPnl = totalUnrealizedPnl.plus(unrealizedPnl);
    }

    // Calculate total PnL
    const totalPnl = totalRealizedPnl.plus(totalUnrealizedPnl);

    // Calculate return percentage
    const returnPercentage = totalPnl
      .dividedBy(account.initialBalance)
      .times(100);

    // Winning and losing trades
    const winningTrades = closedTrades.filter((t) => t.realizedPnl.greaterThan(0));
    const losingTrades = closedTrades.filter((t) => t.realizedPnl.lessThan(0));

    // Win/Loss rates
    const winRate =
      closedTrades.length > 0
        ? ((winningTrades.length / closedTrades.length) * 100).toFixed(2)
        : '0.00';
    const lossRate =
      closedTrades.length > 0
        ? ((losingTrades.length / closedTrades.length) * 100).toFixed(2)
        : '0.00';

    // Average win/loss
    const averageWin =
      winningTrades.length > 0
        ? winningTrades
            .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0))
            .dividedBy(winningTrades.length)
        : new Decimal(0);

    const averageLoss =
      losingTrades.length > 0
        ? losingTrades
            .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0))
            .dividedBy(losingTrades.length)
        : new Decimal(0);

    // Largest win/loss
    const largestWin =
      winningTrades.length > 0
        ? winningTrades.reduce((max, t) =>
            t.realizedPnl.greaterThan(max) ? t.realizedPnl : max,
          new Decimal(0))
        : new Decimal(0);

    const largestLoss =
      losingTrades.length > 0
        ? losingTrades.reduce((min, t) =>
            t.realizedPnl.lessThan(min) ? t.realizedPnl : min,
          new Decimal(0))
        : new Decimal(0);

    // Profit factor
    const grossProfit = winningTrades.reduce(
      (sum, t) => sum.plus(t.realizedPnl),
      new Decimal(0),
    );
    const grossLoss = losingTrades.reduce(
      (sum, t) => sum.plus(t.realizedPnl.abs()),
      new Decimal(0),
    );

    let profitFactor: string;
    if (grossLoss.equals(0)) {
      profitFactor = grossProfit.greaterThan(0) ? '∞' : '0.00';
    } else {
      profitFactor = grossProfit.dividedBy(grossLoss).toFixed(2);
    }

    return {
      overview: {
        initialBalance: account.initialBalance.toFixed(2),
        currentBalance: account.currentBalance.toFixed(2),
        equity: account.equity.toFixed(2),
        totalPnl: totalPnl.toFixed(2),
        returnPercentage: returnPercentage.toFixed(2),
      },
      trades: {
        totalTrades: account.trades.length,
        openTrades: openTrades.length,
        closedTrades: closedTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate,
        lossRate,
      },
      pnl: {
        realized: totalRealizedPnl.toFixed(2),
        unrealized: totalUnrealizedPnl.toFixed(2),
        averageWin: averageWin.toFixed(2),
        averageLoss: averageLoss.toFixed(2),
        largestWin: largestWin.toFixed(2),
        largestLoss: largestLoss.toFixed(2),
        profitFactor,
      },
    };
  }

  /**
   * Calculate unrealized PnL for an open position
   */
  private calculateUnrealizedPnl(
    side: TradeSide,
    entryPrice: Decimal,
    currentPrice: Decimal,
    volume: Decimal,
  ): Decimal {
    let pnl: Decimal;

    if (side === TradeSide.BUY) {
      pnl = currentPrice
        .minus(entryPrice)
        .times(volume)
        .times(this.CONTRACT_MULTIPLIER);
    } else {
      pnl = entryPrice
        .minus(currentPrice)
        .times(volume)
        .times(this.CONTRACT_MULTIPLIER);
    }

    return pnl;
  }
}
