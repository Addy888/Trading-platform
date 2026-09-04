import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradingAccountStatus, RuleType, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';

export interface RuleEvaluationResult {
  passed: boolean;
  breached: boolean;
  profitTargetReached: boolean;
  dailyLossBreached: boolean;
  maxDrawdownBreached: boolean;
  minTradingDaysReached: boolean;
  details: {
    currentEquity: string;
    initialBalance: string;
    profitLoss: string;
    profitLossPercentage: string;
    tradingDays: number;
  };
}

/**
 * Trading Rule Evaluator Service
 * 
 * Evaluates trading rules assigned to a trading account.
 * Determines if account should be marked as PASSED or BREACHED.
 */
@Injectable()
export class RuleEvaluatorService {
  private readonly logger = new Logger(RuleEvaluatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountSnapshots: AccountSnapshotsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Evaluate all rules for a trading account
   * @param tradingAccountId Trading account ID
   * @param currentEquity Current equity (balance + unrealized PnL)
   * @returns Rule evaluation result
   */
  async evaluateRules(
    tradingAccountId: string,
    currentEquity: Decimal,
  ): Promise<RuleEvaluationResult> {
    // Fetch account with rules
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
        trades: {
          select: {
            openedAt: true,
            status: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error('Trading account not found');
    }

    // If already breached, no further evaluation needed
    if (account.status === TradingAccountStatus.BREACHED) {
      return {
        passed: false,
        breached: true,
        profitTargetReached: false,
        dailyLossBreached: true,
        maxDrawdownBreached: true,
        minTradingDaysReached: false,
        details: this.getEvaluationDetails(account, currentEquity),
      };
    }

    const rules = account.ruleSet.ruleSetRules.map((rsr) => rsr.rule);
    
    const profitLoss = currentEquity.minus(account.initialBalance);
    const profitLossPercentage = profitLoss
      .dividedBy(account.initialBalance)
      .times(100);

    // Calculate trading days
    const tradingDays = this.calculateTradingDays(account.trades);

    // Initialize evaluation flags
    let profitTargetReached = false;
    let maxDrawdownBreached = false;
    let dailyLossBreached = false;
    let minTradingDaysReached = true; // Assume true unless rule exists and not met

    // Evaluate each rule
    for (const rule of rules) {
      if (!rule.isActive) continue;

      switch (rule.type) {
        case RuleType.PROFIT_TARGET:
          profitTargetReached = this.evaluateProfitTarget(
            profitLoss,
            profitLossPercentage,
            rule.value,
            rule.isPercentage,
          );
          break;

        case RuleType.MAX_DRAWDOWN:
          maxDrawdownBreached = this.evaluateMaxDrawdown(
            currentEquity,
            account.initialBalance,
            rule.value,
            rule.isPercentage,
          );
          break;

        case RuleType.DAILY_LOSS:
          dailyLossBreached = await this.evaluateDailyLoss(
            tradingAccountId,
            account.initialBalance,
            rule.value,
            rule.isPercentage,
          );
          break;

        case RuleType.MIN_TRADING_DAYS:
          minTradingDaysReached = this.evaluateMinTradingDays(
            tradingDays,
            rule.value,
          );
          break;
      }
    }

    // Determine final status
    const breached = maxDrawdownBreached || dailyLossBreached;
    const passed =
      profitTargetReached && minTradingDaysReached && !breached;

    return {
      passed,
      breached,
      profitTargetReached,
      dailyLossBreached,
      maxDrawdownBreached,
      minTradingDaysReached,
      details: this.getEvaluationDetails(account, currentEquity),
    };
  }

  /**
   * Evaluate profit target rule
   */
  private evaluateProfitTarget(
    profitLoss: Decimal,
    profitLossPercentage: Decimal,
    targetValue: Decimal,
    isPercentage: boolean,
  ): boolean {
    if (isPercentage) {
      return profitLossPercentage.greaterThanOrEqualTo(targetValue);
    } else {
      return profitLoss.greaterThanOrEqualTo(targetValue);
    }
  }

  /**
   * Evaluate max drawdown rule
   */
  private evaluateMaxDrawdown(
    currentEquity: Decimal,
    initialBalance: Decimal,
    maxDrawdownValue: Decimal,
    isPercentage: boolean,
  ): boolean {
    const loss = initialBalance.minus(currentEquity);

    if (isPercentage) {
      const lossPercentage = loss.dividedBy(initialBalance).times(100);
      return lossPercentage.greaterThanOrEqualTo(maxDrawdownValue);
    } else {
      return loss.greaterThanOrEqualTo(maxDrawdownValue);
    }
  }

  /**
   * Evaluate daily loss rule
   * 
   * Foundation for daily loss calculation.
   * Uses server timezone for day boundaries.
   */
  private async evaluateDailyLoss(
    tradingAccountId: string,
    initialBalance: Decimal,
    dailyLossLimit: Decimal,
    isPercentage: boolean,
  ): Promise<boolean> {
    // Get start of today (server timezone)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Get all trades opened or closed today
    const todayTrades = await this.prisma.trade.findMany({
      where: {
        tradingAccountId,
        OR: [
          { openedAt: { gte: startOfToday } },
          { closedAt: { gte: startOfToday } },
        ],
      },
    });

    // Calculate today's realized PnL
    const realizedPnlToday = todayTrades
      .filter((t) => t.closedAt && t.closedAt >= startOfToday)
      .reduce((sum, trade) => sum.plus(trade.realizedPnl), new Decimal(0));

    // For simplicity in Day 6, we consider only realized PnL
    // Future: Add unrealized PnL for open positions
    const dailyLoss = realizedPnlToday.isNegative()
      ? realizedPnlToday.abs()
      : new Decimal(0);

    if (isPercentage) {
      const dailyLossPercentage = dailyLoss.dividedBy(initialBalance).times(100);
      return dailyLossPercentage.greaterThanOrEqualTo(dailyLossLimit);
    } else {
      return dailyLoss.greaterThanOrEqualTo(dailyLossLimit);
    }
  }

  /**
   * Evaluate minimum trading days rule
   */
  private evaluateMinTradingDays(
    tradingDays: number,
    requiredDays: Decimal,
  ): boolean {
    return tradingDays >= requiredDays.toNumber();
  }

  /**
   * Calculate unique trading days
   * A trading day is counted when at least one trade is opened
   */
  private calculateTradingDays(
    trades: Array<{ openedAt: Date; status: any }>,
  ): number {
    const uniqueDays = new Set<string>();

    trades.forEach((trade) => {
      const dateKey = trade.openedAt.toISOString().split('T')[0];
      uniqueDays.add(dateKey);
    });

    return uniqueDays.size;
  }

  /**
   * Get evaluation details for response
   */
  private getEvaluationDetails(
    account: any,
    currentEquity: Decimal,
  ): RuleEvaluationResult['details'] {
    const profitLoss = currentEquity.minus(account.initialBalance);
    const profitLossPercentage = profitLoss
      .dividedBy(account.initialBalance)
      .times(100);

    return {
      currentEquity: currentEquity.toFixed(2),
      initialBalance: account.initialBalance.toFixed(2),
      profitLoss: profitLoss.toFixed(2),
      profitLossPercentage: profitLossPercentage.toFixed(2),
      tradingDays: this.calculateTradingDays(account.trades || []),
    };
  }

  /**
   * Update account status based on evaluation
   */
  async updateAccountStatus(
    tradingAccountId: string,
    evaluation: RuleEvaluationResult,
    actorId?: string,
  ): Promise<void> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        trades: {
          select: {
            status: true,
            realizedPnl: true,
          },
        },
      },
    });

    if (!account) return;

    // Don't update if already in final state
    if (
      account.status === TradingAccountStatus.BREACHED ||
      account.status === TradingAccountStatus.PASSED
    ) {
      return;
    }

    const previousStatus = account.status;

    if (evaluation.breached) {
      await this.prisma.tradingAccount.update({
        where: { id: tradingAccountId },
        data: { status: TradingAccountStatus.BREACHED },
      });

      // Create snapshot on breach
      const realizedPnl = account.trades
        .filter((t) => t.status === TradeStatus.CLOSED)
        .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0));
      
      const equity = new Decimal(evaluation.details.currentEquity);
      
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        account.currentBalance,
        equity,
        realizedPnl,
        equity.minus(account.currentBalance).minus(realizedPnl),
      );

      // Determine breach reason
      const reason = evaluation.maxDrawdownBreached
        ? 'Max drawdown exceeded'
        : 'Daily loss exceeded';

      // Create audit log
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'ACCOUNT_BREACHED',
          entityType: 'TradingAccount',
          entityId: tradingAccountId,
          metadata: {
            reason,
            details: evaluation.details,
          },
        },
      });

      // Emit account status changed event
      this.eventEmitter.emit('account.status.changed', {
        accountId: tradingAccountId,
        previousStatus,
        newStatus: TradingAccountStatus.BREACHED,
        reason,
      });

      this.logger.warn(
        `Trading account ${tradingAccountId} marked as BREACHED`,
      );
    } else if (evaluation.passed) {
      await this.prisma.tradingAccount.update({
        where: { id: tradingAccountId },
        data: { status: TradingAccountStatus.PASSED },
      });

      // Create snapshot on pass
      const realizedPnl = account.trades
        .filter((t) => t.status === TradeStatus.CLOSED)
        .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0));
      
      const equity = new Decimal(evaluation.details.currentEquity);
      
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        account.currentBalance,
        equity,
        realizedPnl,
        equity.minus(account.currentBalance).minus(realizedPnl),
      );

      // Create audit log
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'ACCOUNT_PASSED',
          entityType: 'TradingAccount',
          entityId: tradingAccountId,
          metadata: {
            details: evaluation.details,
          },
        },
      });

      // Emit account status changed event
      this.eventEmitter.emit('account.status.changed', {
        accountId: tradingAccountId,
        previousStatus,
        newStatus: TradingAccountStatus.PASSED,
      });

      this.logger.log(
        `Trading account ${tradingAccountId} marked as PASSED`,
      );
    }
  }
}
