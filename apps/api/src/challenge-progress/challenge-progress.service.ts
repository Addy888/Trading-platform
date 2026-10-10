import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType, TradingAccountStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { DailyLossService } from '../daily-loss/daily-loss.service';
import { MaxDrawdownService } from '../max-drawdown/max-drawdown.service';
import { RiskCalculationService } from '../risk-engine/risk-calculation.service';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

export interface ProfitTargetProgress {
  requiredProfit: string;
  currentProfit: string;
  remainingProfit: string;
  progressPercentage: string;
  completed: boolean;
}

export interface MaxDrawdownProgress {
  maximumAllowedLoss: string;
  currentDrawdown: string;
  remainingLossAllowance: string;
  usagePercentage: string;
  breached: boolean;
}

export interface DailyLossProgress {
  dailyLossLimit: string;
  currentDailyLoss: string;
  remainingDailyLoss: string;
  usagePercentage: string;
  breached: boolean;
}

export interface MinTradingDaysProgress {
  requiredTradingDays: number;
  completedTradingDays: number;
  remainingTradingDays: number;
  progressPercentage: string;
  completed: boolean;
}

export interface ChallengeProgress {
  accountStatus: TradingAccountStatus;
  accountResult: string;
  overallProgress: string;
  rules: {
    profitTarget?: ProfitTargetProgress;
    maxDrawdown?: MaxDrawdownProgress;
    dailyLoss?: DailyLossProgress;
    minimumTradingDays?: MinTradingDaysProgress;
  };
}

/**
 * Challenge Progress Service
 * 
 * Calculates progress and status for challenge rules:
 * - Profit Target
 * - Maximum Drawdown
 * - Daily Loss Limit
 * - Minimum Trading Days
 */
@Injectable()
export class ChallengeProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyLossService: DailyLossService,
    private readonly maxDrawdownService: MaxDrawdownService,
    private readonly riskCalculation: RiskCalculationService,
  ) {}

  /**
   * Get complete challenge progress for an account
   * @param tradingAccountId Trading account ID
   */
  async getChallengeProgress(
    tradingAccountId: string,
  ): Promise<ChallengeProgress> {
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
            closedAt: true,
            realizedPnl: true,
            status: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error('Trading account not found');
    }

    const rules = account.ruleSet.ruleSetRules
      .map((rsr) => rsr.rule)
      .filter((rule) => rule.isActive);

    const result: ChallengeProgress = {
      accountStatus: account.status,
      accountResult: this.getAccountResult(account.status),
      overallProgress: '0',
      rules: {},
    };

    // Calculate progress for each rule type
    for (const rule of rules) {
      switch (rule.type) {
        case RuleType.PROFIT_TARGET:
          result.rules.profitTarget = this.calculateProfitTargetProgress(
            account.initialBalance,
            account.equity,
            rule.value,
            rule.isPercentage,
          );
          break;

        case RuleType.MAX_DRAWDOWN:
          // Day 6: Use new MaxDrawdownService for precise calculation
          result.rules.maxDrawdown = await this.calculateMaxDrawdownProgressV2(
            tradingAccountId,
          );
          break;

        case RuleType.DAILY_LOSS:
          // Day 5: Use new DailyLossService for precise calculation
          result.rules.dailyLoss = await this.calculateDailyLossProgressV2(
            tradingAccountId,
          );
          break;

        case RuleType.MIN_TRADING_DAYS:
          result.rules.minimumTradingDays = this.calculateMinTradingDaysProgress(
            account.trades,
            rule.value,
          );
          break;
      }
    }

    // Calculate overall progress
    result.overallProgress = this.calculateOverallProgress(result.rules);

    return result;
  }

  /**
   * Calculate Profit Target Progress
   */
  private calculateProfitTargetProgress(
    initialBalance: Decimal,
    equity: Decimal,
    targetValue: Decimal,
    isPercentage: boolean,
  ): ProfitTargetProgress {
    const currentProfit = equity.minus(initialBalance);

    let requiredProfit: Decimal;
    if (isPercentage) {
      requiredProfit = initialBalance.times(targetValue).dividedBy(100);
    } else {
      requiredProfit = targetValue;
    }

    const remainingProfit = requiredProfit.minus(currentProfit);
    const progressPercentage = currentProfit
      .dividedBy(requiredProfit)
      .times(100);
    const completed = currentProfit.greaterThanOrEqualTo(requiredProfit);

    return {
      requiredProfit: requiredProfit.toFixed(2),
      currentProfit: currentProfit.toFixed(2),
      remainingProfit: remainingProfit.isPositive()
        ? remainingProfit.toFixed(2)
        : '0.00',
      progressPercentage: progressPercentage.toFixed(2),
      completed,
    };
  }

  /**
   * Calculate Maximum Drawdown Progress
   */
  private calculateMaxDrawdownProgress(
    initialBalance: Decimal,
    equity: Decimal,
    maxDrawdownValue: Decimal,
    isPercentage: boolean,
  ): MaxDrawdownProgress {
    const currentDrawdown = initialBalance.minus(equity);

    let maximumAllowedLoss: Decimal;
    if (isPercentage) {
      maximumAllowedLoss = initialBalance.times(maxDrawdownValue).dividedBy(100);
    } else {
      maximumAllowedLoss = maxDrawdownValue;
    }

    const remainingLossAllowance = maximumAllowedLoss.minus(currentDrawdown);
    const usagePercentage = currentDrawdown
      .dividedBy(maximumAllowedLoss)
      .times(100);
    const breached = currentDrawdown.greaterThanOrEqualTo(maximumAllowedLoss);

    return {
      maximumAllowedLoss: maximumAllowedLoss.toFixed(2),
      currentDrawdown: currentDrawdown.isPositive()
        ? currentDrawdown.toFixed(2)
        : '0.00',
      remainingLossAllowance: remainingLossAllowance.isPositive()
        ? remainingLossAllowance.toFixed(2)
        : '0.00',
      usagePercentage: usagePercentage.toFixed(2),
      breached,
    };
  }

  /**
   * Calculate Maximum Drawdown Progress (Day 6 Implementation)
   * Uses MaxDrawdownService for precise evaluation with:
   * - Static/Trailing drawdown types
   * - Balance/Equity basis
   * - HWM tracking
   */
  private async calculateMaxDrawdownProgressV2(
    tradingAccountId: string,
  ): Promise<MaxDrawdownProgress> {
    try {
      const evaluation = await this.maxDrawdownService.evaluateMaxDrawdown(
        tradingAccountId,
      );

      return {
        maximumAllowedLoss: FinancialCalculations.formatMoney(evaluation.maxDrawdownLimit),
        currentDrawdown: FinancialCalculations.formatMoney(evaluation.currentDrawdown),
        remainingLossAllowance: FinancialCalculations.formatMoney(
          FinancialCalculations.max(evaluation.remainingDrawdownBuffer, new Decimal(0)),
        ),
        usagePercentage: FinancialCalculations.formatPercentage(evaluation.usagePercentage),
        breached: evaluation.breached,
      };
    } catch (error) {
      // If max drawdown evaluation fails, return safe defaults
      return {
        maximumAllowedLoss: '0.00',
        currentDrawdown: '0.00',
        remainingLossAllowance: '0.00',
        usagePercentage: '0.00',
        breached: false,
      };
    }
  }

  /**
   * Calculate Daily Loss Progress (Day 5 Implementation)
   * Uses DailyLossService for precise evaluation
   */
  private async calculateDailyLossProgressV2(
    tradingAccountId: string,
  ): Promise<DailyLossProgress> {
    try {
      const evaluation = await this.dailyLossService.evaluateDailyLoss(
        tradingAccountId,
      );

      return {
        dailyLossLimit: FinancialCalculations.formatMoney(evaluation.dailyLossLimit),
        currentDailyLoss: FinancialCalculations.formatMoney(evaluation.dailyLoss),
        remainingDailyLoss: FinancialCalculations.formatMoney(
          FinancialCalculations.max(evaluation.remainingDailyLossBudget, new Decimal(0)),
        ),
        usagePercentage: FinancialCalculations.formatPercentage(evaluation.usagePercentage),
        breached: evaluation.breached,
      };
    } catch (error) {
      // If daily loss evaluation fails, return safe defaults
      return {
        dailyLossLimit: '0.00',
        currentDailyLoss: '0.00',
        remainingDailyLoss: '0.00',
        usagePercentage: '0.00',
        breached: false,
      };
    }
  }

  /**
   * Calculate Daily Loss Progress (Legacy)
   * Uses server timezone for day boundaries
   * 
   * @deprecated Use calculateDailyLossProgressV2 instead
   */
  private async calculateDailyLossProgress(
    tradingAccountId: string,
    initialBalance: Decimal,
    dailyLossLimit: Decimal,
    isPercentage: boolean,
  ): Promise<DailyLossProgress> {
    // Get start of today (server timezone)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Get all trades closed today
    const todayTrades = await this.prisma.trade.findMany({
      where: {
        tradingAccountId,
        closedAt: { gte: startOfToday },
      },
      select: {
        realizedPnl: true,
      },
    });

    // Calculate today's realized PnL
    const realizedPnlToday = todayTrades.reduce(
      (sum, trade) => sum.plus(trade.realizedPnl),
      new Decimal(0),
    );

    // Current daily loss (only count losses)
    const currentDailyLoss = realizedPnlToday.isNegative()
      ? realizedPnlToday.abs()
      : new Decimal(0);

    let dailyLossLimitAmount: Decimal;
    if (isPercentage) {
      dailyLossLimitAmount = initialBalance.times(dailyLossLimit).dividedBy(100);
    } else {
      dailyLossLimitAmount = dailyLossLimit;
    }

    const remainingDailyLoss = dailyLossLimitAmount.minus(currentDailyLoss);
    const usagePercentage = currentDailyLoss
      .dividedBy(dailyLossLimitAmount)
      .times(100);
    const breached = currentDailyLoss.greaterThanOrEqualTo(dailyLossLimitAmount);

    return {
      dailyLossLimit: dailyLossLimitAmount.toFixed(2),
      currentDailyLoss: currentDailyLoss.toFixed(2),
      remainingDailyLoss: remainingDailyLoss.isPositive()
        ? remainingDailyLoss.toFixed(2)
        : '0.00',
      usagePercentage: usagePercentage.toFixed(2),
      breached,
    };
  }

  /**
   * Calculate Minimum Trading Days Progress
   */
  private calculateMinTradingDaysProgress(
    trades: Array<{ openedAt: Date }>,
    requiredDays: Decimal,
  ): MinTradingDaysProgress {
    const uniqueDays = new Set<string>();

    trades.forEach((trade) => {
      const dateKey = trade.openedAt.toISOString().split('T')[0];
      uniqueDays.add(dateKey);
    });

    const completedTradingDays = uniqueDays.size;
    const requiredTradingDays = requiredDays.toNumber();
    const remainingTradingDays = Math.max(0, requiredTradingDays - completedTradingDays);
    const progressPercentage = ((completedTradingDays / requiredTradingDays) * 100).toFixed(2);
    const completed = completedTradingDays >= requiredTradingDays;

    return {
      requiredTradingDays,
      completedTradingDays,
      remainingTradingDays,
      progressPercentage,
      completed,
    };
  }

  /**
   * Calculate overall challenge progress
   */
  private calculateOverallProgress(rules: ChallengeProgress['rules']): string {
    const progressItems: number[] = [];

    if (rules.profitTarget) {
      progressItems.push(new Decimal(rules.profitTarget.progressPercentage).toNumber());
    }

    if (rules.minimumTradingDays) {
      progressItems.push(new Decimal(rules.minimumTradingDays.progressPercentage).toNumber());
    }

    // For drawdown and daily loss, we want to show how much allowance is left
    // So we invert the usage percentage
    if (rules.maxDrawdown && !rules.maxDrawdown.breached) {
      progressItems.push(100 - new Decimal(rules.maxDrawdown.usagePercentage).toNumber());
    }

    if (rules.dailyLoss && !rules.dailyLoss.breached) {
      progressItems.push(100 - new Decimal(rules.dailyLoss.usagePercentage).toNumber());
    }

    if (progressItems.length === 0) {
      return '0.00';
    }

    const average = progressItems.reduce((a, b) => a + b, 0) / progressItems.length;
    return Math.min(100, Math.max(0, average)).toFixed(2);
  }

  /**
   * Get human-readable account result
   */
  private getAccountResult(status: TradingAccountStatus): string {
    switch (status) {
      case TradingAccountStatus.ACTIVE:
        return 'In Progress';
      case TradingAccountStatus.PASSED:
        return 'Passed';
      case TradingAccountStatus.BREACHED:
        return 'Breached';
      case TradingAccountStatus.SUSPENDED:
        return 'Suspended';
      case TradingAccountStatus.CLOSED:
        return 'Closed';
      default:
        return 'Unknown';
    }
  }
}
