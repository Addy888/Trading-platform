import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { TradeStatus, TradeSide, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * Open Position P&L Details
 */
export interface OpenPositionPnL {
  tradeId: string;
  symbol: string;
  side: TradeSide;
  entryPrice: string;
  currentPrice: string;
  quantity: string;
  lotSize: number;
  contractSize: number;
  unrealizedGrossPnl: string;
  spreadImpact: string;
  commission: string;
  swap: string;
  netUnrealizedPnl: string;
  pnlPercentage: string;
  openedAt: Date;
}

/**
 * Closed Trade P&L Details
 */
export interface ClosedTradePnL {
  tradeId: string;
  symbol: string;
  side: TradeSide;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  grossPnl: string;
  commission: string;
  swap: string;
  netPnl: string;
  pnlPercentage: string;
  openedAt: Date;
  closedAt: Date;
  holdingDays: number;
}

/**
 * Account Financial Summary
 */
export interface AccountFinancialSummary {
  balance: string;
  equity: string;
  usedMargin: string;
  freeMargin: string;
  unrealizedPnl: string;
  realizedPnl: string;
  todaysPnl: string;
  totalNetPnl: string;
  marginUtilization: string;
  accountStatus: string;
}

/**
 * Dashboard Analytics
 */
export interface DashboardAnalytics {
  dailyPnl: string;
  weeklyPnl: string;
  monthlyPnl: string;
  totalRealizedPnl: string;
  totalUnrealizedPnl: string;
  winningTrades: number;
  losingTrades: number;
  totalTrades: number;
  winRate: string;
  avgProfitPerWinningTrade: string;
  avgLossPerLosingTrade: string;
  largestProfit: string;
  largestLoss: string;
  profitFactor: string;
}

/**
 * Closed Trade Report Entry
 */
export interface ClosedTradeReportEntry {
  positionId: string;
  instrument: string;
  direction: TradeSide;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  grossPnl: string;
  commission: string;
  swap: string;
  netPnl: string;
  openingTimestamp: Date;
  closingTimestamp: Date;
  closingReason: string;
  holdingDays: number;
}

/**
 * Closed Trade Report
 */
export interface ClosedTradeReport {
  accountId: string;
  accountNumber: string;
  reportDate: Date;
  trades: ClosedTradeReportEntry[];
  totalGrossPnl: string;
  totalCommission: string;
  totalSwap: string;
  totalNetPnl: string;
  winningTradesCount: number;
  losingTradesCount: number;
}

/**
 * P&L Calculation Service
 * 
 * Comprehensive P&L calculations for:
 * - Open position unrealized P&L with spread and costs
 * - Closed trade realized P&L with all deductions
 * - Account financial summary
 * - Dashboard analytics
 * - Detailed trade reports
 * 
 * CRITICAL RULES:
 * 1. All calculations use Decimal.js for precision
 * 2. Open P&L uses executable bid/ask prices
 * 3. Commission and swap deducted from net P&L
 * 4. Balance updated only on close (realized P&L)
 * 5. Equity = Balance + Unrealized P&L
 * 6. Never use hardcoded or fabricated prices
 */
@Injectable()
export class PnLCalculationService {
  private readonly logger = new Logger(PnLCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataEngineService,
    private readonly instrumentConfig: InstrumentConfigService,
  ) {}

  /**
   * Calculate open position P&L with all components
   */
  async calculateOpenPositionPnL(
    trade: {
      id: string;
      symbol: string;
      side: TradeSide;
      entryPrice: Decimal;
      volume: Decimal;
      openedAt: Date;
    },
  ): Promise<OpenPositionPnL> {
    // Verify market data available
    if (!this.marketData.isMarketAvailable(trade.symbol)) {
      throw new ServiceUnavailableException(
        `Market data unavailable for ${trade.symbol}. Cannot calculate P&L.`,
      );
    }

    // Get current executable price (bid for SELL, ask for BUY)
    let currentPrice: Decimal | null;
    if (trade.side === TradeSide.BUY) {
      currentPrice = this.marketData.getBid(trade.symbol);
    } else {
      currentPrice = this.marketData.getAsk(trade.symbol);
    }

    if (!currentPrice) {
      throw new ServiceUnavailableException(
        `Executable price unavailable for ${trade.symbol}. Cannot calculate P&L.`,
      );
    }

    // Get instrument configuration
    const instrument = this.instrumentConfig.getInstrument(trade.symbol);
    const contractSize = instrument?.contractMultiplier || 1;
    const lotSize = 1; // Standard lot

    // Calculate gross P&L
    const unrealizedGrossPnl = FinancialCalculations.calculateUnrealizedPnl(
      trade.side,
      trade.entryPrice,
      currentPrice,
      trade.volume,
      contractSize,
    );

    // Calculate spread impact (bid-ask spread cost)
    const spreadImpact = this.calculateSpreadImpact(
      trade.side,
      trade.volume,
      contractSize,
      trade.symbol,
    );

    // Calculate commission (placeholder: 0 for now, can be configured)
    const commission = new Decimal(0);

    // Calculate swap (placeholder: 0 for now, can be configured)
    const swap = new Decimal(0);

    // Net P&L = Gross - Spread - Commission - Swap
    const netUnrealizedPnl = FinancialCalculations.subtract(
      FinancialCalculations.subtract(unrealizedGrossPnl, spreadImpact),
      FinancialCalculations.add(commission, swap),
    );

    // P&L percentage
    const entryValue = trade.entryPrice.times(trade.volume).times(contractSize);
    const pnlPercentage = entryValue.isZero()
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          netUnrealizedPnl.dividedBy(entryValue).times(100),
        );

    return {
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: FinancialCalculations.formatPrice(trade.entryPrice),
      currentPrice: FinancialCalculations.formatPrice(currentPrice),
      quantity: FinancialCalculations.formatPrice(trade.volume),
      lotSize,
      contractSize,
      unrealizedGrossPnl: FinancialCalculations.formatMoney(unrealizedGrossPnl),
      spreadImpact: FinancialCalculations.formatMoney(spreadImpact),
      commission: FinancialCalculations.formatMoney(commission),
      swap: FinancialCalculations.formatMoney(swap),
      netUnrealizedPnl: FinancialCalculations.formatMoney(netUnrealizedPnl),
      pnlPercentage: FinancialCalculations.formatPercentage(pnlPercentage),
      openedAt: trade.openedAt,
    };
  }

  /**
   * Calculate closed trade P&L with all components
   */
  async calculateClosedTradePnL(
    trade: {
      id: string;
      symbol: string;
      side: TradeSide;
      entryPrice: Decimal;
      exitPrice: Decimal;
      volume: Decimal;
      openedAt: Date;
      closedAt: Date;
    },
  ): Promise<ClosedTradePnL> {
    // Get instrument configuration
    const instrument = this.instrumentConfig.getInstrument(trade.symbol);
    const contractSize = instrument?.contractMultiplier || 1;

    // Calculate gross P&L
    const grossPnl = FinancialCalculations.calculateRealizedPnl(
      trade.side,
      trade.entryPrice,
      trade.exitPrice,
      trade.volume,
      contractSize,
    );

    // Calculate commission (placeholder: 0 for now)
    const commission = new Decimal(0);

    // Calculate swap (placeholder: 0 for now)
    const swap = new Decimal(0);

    // Net P&L = Gross - Commission - Swap
    const netPnl = FinancialCalculations.subtract(
      FinancialCalculations.subtract(grossPnl, commission),
      swap,
    );

    // P&L percentage
    const entryValue = trade.entryPrice.times(trade.volume).times(contractSize);
    const pnlPercentage = entryValue.isZero()
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          netPnl.dividedBy(entryValue).times(100),
        );

    // Holding days
    const holdingTime = new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime();
    const holdingDays = Math.ceil(holdingTime / (1000 * 60 * 60 * 24));

    return {
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: FinancialCalculations.formatPrice(trade.entryPrice),
      exitPrice: FinancialCalculations.formatPrice(trade.exitPrice),
      quantity: FinancialCalculations.formatPrice(trade.volume),
      grossPnl: FinancialCalculations.formatMoney(grossPnl),
      commission: FinancialCalculations.formatMoney(commission),
      swap: FinancialCalculations.formatMoney(swap),
      netPnl: FinancialCalculations.formatMoney(netPnl),
      pnlPercentage: FinancialCalculations.formatPercentage(pnlPercentage),
      openedAt: trade.openedAt,
      closedAt: trade.closedAt,
      holdingDays,
    };
  }

  /**
   * Get all open positions with P&L
   */
  async getOpenPositionsPnL(
    accountId: string,
  ): Promise<OpenPositionPnL[]> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const openTrades = await this.prisma.trade.findMany({
      where: {
        tradingAccountId: accountId,
        status: TradeStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });

    const positionsPnL: OpenPositionPnL[] = [];

    for (const trade of openTrades) {
      try {
        const pnl = await this.calculateOpenPositionPnL({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          entryPrice: new Decimal(trade.entryPrice),
          volume: new Decimal(trade.volume),
          openedAt: trade.openedAt,
        });
        positionsPnL.push(pnl);
      } catch (error) {
        this.logger.warn(
          `Failed to calculate P&L for trade ${trade.id}: ${(error as Error).message}`,
        );
      }
    }

    return positionsPnL;
  }

  /**
   * Get closed trades with P&L
   */
  async getClosedTradesPnL(
    accountId: string,
    options?: {
      page?: number;
      limit?: number;
      fromDate?: Date;
      toDate?: Date;
      symbol?: string;
      side?: TradeSide;
    },
  ): Promise<{
    trades: ClosedTradePnL[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.TradeWhereInput = {
      tradingAccountId: accountId,
      status: TradeStatus.CLOSED,
    };

    if (options?.fromDate) {
      where.closedAt = { gte: options.fromDate };
    }

    if (options?.toDate) {
      if (options?.fromDate) {
        where.closedAt = { gte: options.fromDate, lte: options.toDate };
      } else {
        where.closedAt = { lte: options.toDate };
      }
    }

    if (options?.symbol) {
      where.symbol = options.symbol.toUpperCase();
    }

    if (options?.side) {
      where.side = options.side;
    }

    const closedTrades = await this.prisma.trade.findMany({
      where,
      orderBy: { closedAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await this.prisma.trade.count({ where });

    const tradesPnL: ClosedTradePnL[] = [];

    for (const trade of closedTrades) {
      try {
        const pnl = await this.calculateClosedTradePnL({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          entryPrice: new Decimal(trade.entryPrice),
          exitPrice: new Decimal(trade.exitPrice!),
          volume: new Decimal(trade.volume),
          openedAt: trade.openedAt,
          closedAt: trade.closedAt!,
        });
        tradesPnL.push(pnl);
      } catch (error) {
        this.logger.warn(
          `Failed to calculate P&L for trade ${trade.id}: ${(error as Error).message}`,
        );
      }
    }

    return {
      trades: tradesPnL,
      total,
      page,
      limit,
    };
  }

  /**
   * Calculate spread impact for a position
   */
  private calculateSpreadImpact(
    side: TradeSide,
    volume: Decimal,
    contractSize: number,
    symbol: string,
  ): Decimal {
    // Get bid-ask spread
    const bid = this.marketData.getBid(symbol);
    const ask = this.marketData.getAsk(symbol);

    if (!bid || !ask) {
      return new Decimal(0);
    }

    // Spread = ask - bid
    const spread = ask.minus(bid);

    // For BUY: we pay ask, spread costs us the spread amount * volume
    // For SELL: we receive bid, spread costs us the spread amount * volume
    const spreadCost = spread.times(volume).times(contractSize);

    return FinancialCalculations.roundMoney(spreadCost);
  }

  /**
   * Get account financial summary
   */
  async getAccountFinancialSummary(
    accountId: string,
  ): Promise<AccountFinancialSummary> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        trades: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Calculate realized P&L
    const realizedPnl = account.trades
      .filter((t) => t.status === TradeStatus.CLOSED)
      .reduce(
        (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
        new Decimal(0),
      );

    // Calculate unrealized P&L
    let unrealizedPnl = new Decimal(0);
    for (const trade of account.trades.filter((t) => t.status === TradeStatus.OPEN)) {
      try {
        const pnl = await this.calculateOpenPositionPnL({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          entryPrice: new Decimal(trade.entryPrice),
          volume: new Decimal(trade.volume),
          openedAt: trade.openedAt,
        });
        unrealizedPnl = FinancialCalculations.add(unrealizedPnl, pnl.netUnrealizedPnl);
      } catch (error) {
        this.logger.warn(
          `Failed to calculate unrealized P&L for trade ${trade.id}: ${(error as Error).message}`,
        );
      }
    }

    const balance = new Decimal(account.currentBalance);
    const equity = FinancialCalculations.calculateEquity(balance, unrealizedPnl);
    const usedMargin = this.calculateUsedMargin(account.trades);
    const freeMargin = FinancialCalculations.subtract(equity, usedMargin);
    const marginUtilization = usedMargin.isZero()
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          usedMargin.dividedBy(equity).times(100),
        );

    // Today's P&L
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrades = account.trades.filter(
      (t) =>
        t.closedAt &&
        new Date(t.closedAt).toDateString() === today.toDateString(),
    );
    const todaysPnl = todayTrades.reduce(
      (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
      new Decimal(0),
    );

    const totalNetPnl = FinancialCalculations.add(realizedPnl, unrealizedPnl);

    return {
      balance: FinancialCalculations.formatMoney(balance),
      equity: FinancialCalculations.formatMoney(equity),
      usedMargin: FinancialCalculations.formatMoney(usedMargin),
      freeMargin: FinancialCalculations.formatMoney(freeMargin),
      unrealizedPnl: FinancialCalculations.formatMoney(unrealizedPnl),
      realizedPnl: FinancialCalculations.formatMoney(realizedPnl),
      todaysPnl: FinancialCalculations.formatMoney(todaysPnl),
      totalNetPnl: FinancialCalculations.formatMoney(totalNetPnl),
      marginUtilization: FinancialCalculations.formatPercentage(marginUtilization),
      accountStatus: account.status,
    };
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics(accountId: string): Promise<DashboardAnalytics> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        trades: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const closedTrades = account.trades.filter((t) => t.status === TradeStatus.CLOSED);
    const openTrades = account.trades.filter((t) => t.status === TradeStatus.OPEN);

    // Total realized P&L
    const totalRealizedPnl = closedTrades.reduce(
      (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
      new Decimal(0),
    );

    // Total unrealized P&L
    let totalUnrealizedPnl = new Decimal(0);
    for (const trade of openTrades) {
      try {
        const pnl = await this.calculateOpenPositionPnL({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          entryPrice: new Decimal(trade.entryPrice),
          volume: new Decimal(trade.volume),
          openedAt: trade.openedAt,
        });
        totalUnrealizedPnl = FinancialCalculations.add(
          totalUnrealizedPnl,
          pnl.netUnrealizedPnl,
        );
      } catch (error) {
        this.logger.warn(`Failed to calculate unrealized P&L: ${(error as Error).message}`);
      }
    }

    // Winning and losing trades
    const winningTrades = closedTrades.filter((t) =>
      FinancialCalculations.isPositive(t.realizedPnl),
    );
    const losingTrades = closedTrades.filter((t) =>
      FinancialCalculations.isNegative(t.realizedPnl),
    );

    // Win rate
    const winRate = closedTrades.length === 0
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          new Decimal(winningTrades.length)
            .dividedBy(closedTrades.length)
            .times(100),
        );

    // Average profit per winning trade
    const avgProfitPerWinningTrade =
      winningTrades.length === 0
        ? new Decimal(0)
        : FinancialCalculations.roundMoney(
            winningTrades
              .reduce(
                (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
                new Decimal(0),
              )
              .dividedBy(winningTrades.length),
          );

    // Average loss per losing trade
    const avgLossPerLosingTrade =
      losingTrades.length === 0
        ? new Decimal(0)
        : FinancialCalculations.roundMoney(
            losingTrades
              .reduce(
                (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
                new Decimal(0),
              )
              .dividedBy(losingTrades.length),
          );

    // Largest profit and loss
    const largestProfit =
      winningTrades.length === 0
        ? new Decimal(0)
        : FinancialCalculations.max(
            ...winningTrades.map((t) => t.realizedPnl),
          );

    const largestLoss =
      losingTrades.length === 0
        ? new Decimal(0)
        : FinancialCalculations.min(
            ...losingTrades.map((t) => t.realizedPnl),
          );

    // Profit factor
    const totalWinnings = winningTrades.reduce(
      (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
      new Decimal(0),
    );

    const totalLosses = FinancialCalculations.abs(
      losingTrades.reduce(
        (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
        new Decimal(0),
      ),
    );

    const profitFactor = totalLosses.isZero()
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(totalWinnings.dividedBy(totalLosses));

    // Daily, weekly, monthly P&L
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dailyPnl = closedTrades
      .filter((t) => t.closedAt && t.closedAt >= oneDayAgo)
      .reduce(
        (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
        new Decimal(0),
      );

    const weeklyPnl = closedTrades
      .filter((t) => t.closedAt && t.closedAt >= sevenDaysAgo)
      .reduce(
        (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
        new Decimal(0),
      );

    const monthlyPnl = closedTrades
      .filter((t) => t.closedAt && t.closedAt >= thirtyDaysAgo)
      .reduce(
        (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
        new Decimal(0),
      );

    return {
      dailyPnl: FinancialCalculations.formatMoney(dailyPnl),
      weeklyPnl: FinancialCalculations.formatMoney(weeklyPnl),
      monthlyPnl: FinancialCalculations.formatMoney(monthlyPnl),
      totalRealizedPnl: FinancialCalculations.formatMoney(totalRealizedPnl),
      totalUnrealizedPnl: FinancialCalculations.formatMoney(totalUnrealizedPnl),
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalTrades: closedTrades.length,
      winRate: FinancialCalculations.formatPercentage(winRate),
      avgProfitPerWinningTrade: FinancialCalculations.formatMoney(avgProfitPerWinningTrade),
      avgLossPerLosingTrade: FinancialCalculations.formatMoney(avgLossPerLosingTrade),
      largestProfit: FinancialCalculations.formatMoney(largestProfit),
      largestLoss: FinancialCalculations.formatMoney(largestLoss),
      profitFactor: FinancialCalculations.formatPercentage(profitFactor),
    };
  }

  /**
   * Calculate used margin from open positions
   */
  private calculateUsedMargin(trades: any[]): Decimal {
    // Placeholder: return sum of position values
    let usedMargin = new Decimal(0);

    for (const trade of trades.filter((t) => t.status === TradeStatus.OPEN)) {
      const positionValue = new Decimal(trade.entryPrice)
        .times(trade.volume)
        .times(2); // Simple approximation

      usedMargin = FinancialCalculations.add(usedMargin, positionValue);
    }

    return FinancialCalculations.roundMoney(usedMargin);
  }

  /**
   * Generate closed trade report
   */
  async generateClosedTradeReport(
    accountId: string,
    options?: {
      fromDate?: Date;
      toDate?: Date;
    },
  ): Promise<ClosedTradeReport> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const where: Prisma.TradeWhereInput = {
      tradingAccountId: accountId,
      status: TradeStatus.CLOSED,
    };

    if (options?.fromDate) {
      where.closedAt = { gte: options.fromDate };
    }

    if (options?.toDate) {
      if (options?.fromDate) {
        where.closedAt = { gte: options.fromDate, lte: options.toDate };
      } else {
        where.closedAt = { lte: options.toDate };
      }
    }

    const closedTrades = await this.prisma.trade.findMany({
      where,
      orderBy: { closedAt: 'desc' },
    });

    const entries: ClosedTradeReportEntry[] = [];
    let totalGrossPnl = new Decimal(0);
    let totalCommission = new Decimal(0);
    let totalSwap = new Decimal(0);
    let totalNetPnl = new Decimal(0);

    for (const trade of closedTrades) {
      const pnl = await this.calculateClosedTradePnL({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        entryPrice: new Decimal(trade.entryPrice),
        exitPrice: new Decimal(trade.exitPrice!),
        volume: new Decimal(trade.volume),
        openedAt: trade.openedAt,
        closedAt: trade.closedAt!,
      });

      const holdingTime = new Date(trade.closedAt!).getTime() - new Date(trade.openedAt).getTime();
      const holdingDays = Math.ceil(holdingTime / (1000 * 60 * 60 * 24));

      entries.push({
        positionId: trade.id,
        instrument: trade.symbol,
        direction: trade.side,
        entryPrice: pnl.entryPrice,
        exitPrice: pnl.exitPrice,
        quantity: pnl.quantity,
        grossPnl: pnl.grossPnl,
        commission: pnl.commission,
        swap: pnl.swap,
        netPnl: pnl.netPnl,
        openingTimestamp: trade.openedAt,
        closingTimestamp: trade.closedAt,
        closingReason: 'MANUAL_CLOSE',
        holdingDays,
      });

      totalGrossPnl = FinancialCalculations.add(totalGrossPnl, pnl.grossPnl);
      totalCommission = FinancialCalculations.add(totalCommission, pnl.commission);
      totalSwap = FinancialCalculations.add(totalSwap, pnl.swap);
      totalNetPnl = FinancialCalculations.add(totalNetPnl, pnl.netPnl);
    }

    const winningTrades = entries.filter((e) =>
      FinancialCalculations.isPositive(e.netPnl),
    ).length;
    const losingTrades = entries.filter((e) =>
      FinancialCalculations.isNegative(e.netPnl),
    ).length;

    return {
      accountId,
      accountNumber: account.accountNumber,
      reportDate: new Date(),
      trades: entries,
      totalGrossPnl: FinancialCalculations.formatMoney(totalGrossPnl),
      totalCommission: FinancialCalculations.formatMoney(totalCommission),
      totalSwap: FinancialCalculations.formatMoney(totalSwap),
      totalNetPnl: FinancialCalculations.formatMoney(totalNetPnl),
      winningTradesCount: winningTrades,
      losingTradesCount: losingTrades,
    };
  }
}
