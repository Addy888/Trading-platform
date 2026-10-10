import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { AccountStateService } from '../trading-accounts/account-state.service';
import { Prisma, TradeStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * Balance and Equity Service
 * 
 * Authoritative backend service for:
 * - Balance management (realized financial state)
 * - Equity calculation (balance + unrealized P&L)
 * - Realized P&L tracking
 * - Unrealized P&L calculation
 * - High Water Mark (HWM) management
 * 
 * CRITICAL RULES:
 * 1. Balance changes ONLY from:
 *    - Realized trade P&L (position close)
 *    - Authorized adjustments (if supported)
 * 2. Equity = Balance + Total Unrealized P&L (from open positions)
 * 3. HWM = Highest equity ever reached
 * 4. HWM ONLY increases, never decreases during normal operation
 * 5. All calculations use Decimal.js (never floating-point)
 * 6. Frontend CANNOT modify these values
 */
@Injectable()
export class BalanceEquityService {
  private readonly logger = new Logger(BalanceEquityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataEngineService,
    private readonly instrumentConfig: InstrumentConfigService,
    private readonly accountState: AccountStateService,
  ) {}

  /**
   * Calculate unrealized P&L for a single position
   */
  calculatePositionUnrealizedPnl(
    side: TradeSide,
    entryPrice: Decimal,
    currentPrice: Decimal,
    volume: Decimal,
    contractMultiplier: number,
  ): Decimal {
    return FinancialCalculations.calculateUnrealizedPnl(
      side,
      entryPrice,
      currentPrice,
      volume,
      contractMultiplier,
    );
  }

  /**
   * Calculate realized P&L for a closed position
   */
  calculatePositionRealizedPnl(
    side: TradeSide,
    entryPrice: Decimal,
    exitPrice: Decimal,
    volume: Decimal,
    contractMultiplier: number,
  ): Decimal {
    return FinancialCalculations.calculateRealizedPnl(
      side,
      entryPrice,
      exitPrice,
      volume,
      contractMultiplier,
    );
  }

  /**
   * Calculate total unrealized P&L for all open positions
   */
  async calculateTotalUnrealizedPnl(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx || this.prisma;

    const openTrades = await db.trade.findMany({
      where: {
        tradingAccountId: accountId,
        status: TradeStatus.OPEN,
      },
    });

    let totalUnrealizedPnl = new Decimal(0);

    for (const trade of openTrades) {
      // Get current market price (bid for long close, ask for short close)
      let currentPrice: Decimal | null;
      
      if (trade.side === TradeSide.BUY) {
        currentPrice = this.marketData.getBid(trade.symbol);
      } else {
        currentPrice = this.marketData.getAsk(trade.symbol);
      }

      if (!currentPrice) {
        // If market price unavailable, skip this position
        this.logger.warn(
          `Market price unavailable for ${trade.symbol}, skipping unrealized P&L`,
        );
        continue;
      }

      // Get contract multiplier
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      const contractMultiplier = instrument?.contractMultiplier || 1;

      // Calculate unrealized P&L
      const unrealizedPnl = this.calculatePositionUnrealizedPnl(
        trade.side,
        new Decimal(trade.entryPrice),
        currentPrice,
        new Decimal(trade.volume),
        contractMultiplier,
      );

      totalUnrealizedPnl = FinancialCalculations.add(totalUnrealizedPnl, unrealizedPnl);
    }

    return FinancialCalculations.roundMoney(totalUnrealizedPnl);
  }

  /**
   * Calculate total realized P&L from closed positions
   */
  async calculateTotalRealizedPnl(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx || this.prisma;

    const closedTrades = await db.trade.findMany({
      where: {
        tradingAccountId: accountId,
        status: TradeStatus.CLOSED,
      },
      select: {
        realizedPnl: true,
      },
    });

    const totalRealizedPnl = closedTrades.reduce(
      (sum, trade) => FinancialCalculations.add(sum, trade.realizedPnl),
      new Decimal(0),
    );

    return FinancialCalculations.roundMoney(totalRealizedPnl);
  }

  /**
   * Calculate account equity
   * Equity = Balance + Total Unrealized P&L
   */
  async calculateAccountEquity(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx || this.prisma;

    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      select: { currentBalance: true },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const unrealizedPnl = await this.calculateTotalUnrealizedPnl(accountId, tx);
    
    return FinancialCalculations.calculateEquity(
      new Decimal(account.currentBalance),
      unrealizedPnl,
    );
  }

  /**
   * Update account balance after position close
   * 
   * CRITICAL: Balance changes ONLY when trades are realized (closed)
   */
  async updateBalanceOnClose(
    accountId: string,
    realizedPnl: Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx || this.prisma;

    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      select: { currentBalance: true },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const newBalance = FinancialCalculations.add(
      account.currentBalance,
      realizedPnl,
    );

    await db.tradingAccount.update({
      where: { id: accountId },
      data: {
        currentBalance: newBalance,
        lastTradeAt: new Date(),
      },
    });

    this.logger.log(
      `Balance updated: Account ${accountId}, P&L: ${FinancialCalculations.formatMoney(realizedPnl)}, New Balance: ${FinancialCalculations.formatMoney(newBalance)}`,
    );

    return newBalance;
  }

  /**
   * Update account equity (typically after market price update or trade)
   */
  async updateAccountEquity(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx || this.prisma;

    const equity = await this.calculateAccountEquity(accountId, tx);

    await db.tradingAccount.update({
      where: { id: accountId },
      data: { equity },
    });

    this.logger.debug(
      `Equity updated: Account ${accountId}, Equity: ${FinancialCalculations.formatMoney(equity)}`,
    );

    return equity;
  }

  /**
   * Update High Water Mark if equity exceeds current HWM
   * 
   * HWM = Highest equity peak ever reached
   * HWM ONLY increases, never decreases
   */
  async updateHighWaterMark(
    accountId: string,
    currentEquity: Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<{ updated: boolean; hwm: Decimal }> {
    const db = tx || this.prisma;

    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      select: { highWaterMark: true },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const currentHWM = new Decimal(account.highWaterMark);

    if (FinancialCalculations.greaterThan(currentEquity, currentHWM)) {
      // New peak reached
      await db.tradingAccount.update({
        where: { id: accountId },
        data: { highWaterMark: currentEquity },
      });

      this.logger.log(
        `HWM updated: Account ${accountId}, ${FinancialCalculations.formatMoney(currentHWM)} → ${FinancialCalculations.formatMoney(currentEquity)}`,
      );

      return { updated: true, hwm: currentEquity };
    }

    return { updated: false, hwm: currentHWM };
  }

  /**
   * Complete financial state update after trade close
   * 
   * Steps:
   * 1. Update balance with realized P&L
   * 2. Calculate new equity
   * 3. Update HWM if new peak
   * 4. Update daily P&L tracking
   */
  async updateFinancialStateOnClose(
    accountId: string,
    realizedPnl: Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    balance: Decimal;
    equity: Decimal;
    hwmUpdated: boolean;
    hwm: Decimal;
  }> {
    const db = tx || this.prisma;

    // 1. Update balance
    const balance = await this.updateBalanceOnClose(accountId, realizedPnl, db);

    // 2. Calculate and update equity
    const equity = await this.updateAccountEquity(accountId, db);

    // 3. Update HWM if new peak
    const { updated: hwmUpdated, hwm } = await this.updateHighWaterMark(
      accountId,
      equity,
      db,
    );

    // 4. Update daily P&L
    await this.updateDailyPnl(accountId, equity, db);

    return {
      balance,
      equity,
      hwmUpdated,
      hwm,
    };
  }

  /**
   * Complete financial state update after market price change
   * 
   * Steps:
   * 1. Calculate new equity (balance + unrealized P&L)
   * 2. Update equity in database
   * 3. Update HWM if new peak
   * 4. Update daily P&L tracking
   */
  async updateFinancialStateOnPriceChange(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    equity: Decimal;
    hwmUpdated: boolean;
    hwm: Decimal;
  }> {
    const db = tx || this.prisma;

    // 1. Calculate and update equity
    const equity = await this.updateAccountEquity(accountId, db);

    // 2. Update HWM if new peak
    const { updated: hwmUpdated, hwm } = await this.updateHighWaterMark(
      accountId,
      equity,
      db,
    );

    // 3. Update daily P&L
    await this.updateDailyPnl(accountId, equity, db);

    return {
      equity,
      hwmUpdated,
      hwm,
    };
  }

  /**
   * Update daily P&L tracking
   */
  private async updateDailyPnl(
    accountId: string,
    currentEquity: Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      select: { dailyStartEquity: true },
    });

    if (!account) {
      return;
    }

    const dailyPnl = FinancialCalculations.calculateDailyPnl(
      currentEquity,
      new Decimal(account.dailyStartEquity),
    );

    await db.tradingAccount.update({
      where: { id: accountId },
      data: { currentDailyPnl: dailyPnl },
    });
  }

  /**
   * Get complete account financial state
   */
  async getAccountFinancialState(accountId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        initialBalance: true,
        currentBalance: true,
        equity: true,
        highWaterMark: true,
        dailyStartBalance: true,
        dailyStartEquity: true,
        currentDailyPnl: true,
        currentDrawdown: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const unrealizedPnl = await this.calculateTotalUnrealizedPnl(accountId);
    const realizedPnl = await this.calculateTotalRealizedPnl(accountId);
    const totalPnl = FinancialCalculations.add(realizedPnl, unrealizedPnl);
    
    const drawdown = FinancialCalculations.calculateDrawdownFromHWM(
      new Decimal(account.highWaterMark),
      new Decimal(account.equity),
    );

    return {
      initialBalance: FinancialCalculations.formatMoney(account.initialBalance),
      currentBalance: FinancialCalculations.formatMoney(account.currentBalance),
      equity: FinancialCalculations.formatMoney(account.equity),
      highWaterMark: FinancialCalculations.formatMoney(account.highWaterMark),
      realizedPnl: FinancialCalculations.formatMoney(realizedPnl),
      unrealizedPnl: FinancialCalculations.formatMoney(unrealizedPnl),
      totalPnl: FinancialCalculations.formatMoney(totalPnl),
      currentDailyPnl: FinancialCalculations.formatMoney(account.currentDailyPnl),
      currentDrawdown: FinancialCalculations.formatPercentage(drawdown),
      dailyStartBalance: FinancialCalculations.formatMoney(account.dailyStartBalance),
      dailyStartEquity: FinancialCalculations.formatMoney(account.dailyStartEquity),
    };
  }
}
