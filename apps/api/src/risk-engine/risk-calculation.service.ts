import { Injectable, Logger } from '@nestjs/common';
import { AccountStage, RuleType } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';
import { DailyLossService, DailyLossEvaluation } from '../daily-loss/daily-loss.service';
import { MaxDrawdownService, MaxDrawdownEvaluation } from '../max-drawdown/max-drawdown.service';

/**
 * Profit Target Basis - What value to use for target calculation
 */
export enum ProfitTargetBasis {
  BALANCE = 'BALANCE',  // Use balance for target
  EQUITY = 'EQUITY',    // Use equity for target
}

/**
 * Profit Target Rule Configuration
 */
export interface ProfitTargetRule {
  ruleId: string;
  ruleName: string;
  profitTargetPercentage: Decimal;
  profitTargetBasis: ProfitTargetBasis;
  isPercentage: boolean;
  isActive: boolean;
}

/**
 * Profit Target Evaluation Result
 */
export interface ProfitTargetEvaluation {
  accountId: string;
  evaluationTimestamp: Date;
  ruleSnapshot: {
    ruleId: string;
    ruleName: string;
    snapshotVersion: string;
  };
  profitTargetBasis: ProfitTargetBasis;
  
  // Reference values
  startingBalance: Decimal;
  currentValue: Decimal;  // Current balance or equity based on basis
  
  // Target calculations
  profitTargetAmount: Decimal;       // Required profit amount
  profitTargetThreshold: Decimal;    // Value at which target is reached
  currentProfit: Decimal;            // Current profit amount
  currentProfitPercentage: Decimal;  // Current profit as %
  remainingProfit: Decimal;          // Profit needed to reach target
  progressPercentage: Decimal;       // 0-100+%
  
  // Achievement status
  reached: boolean;
  
  // Details
  details: {
    initialBalance: Decimal;
    currentBalance: Decimal;
    currentEquity: Decimal;
    unrealizedPnl: Decimal;
  };
}

/**
 * Minimum Trading Days Rule Configuration
 */
export interface MinTradingDaysRule {
  ruleId: string;
  ruleName: string;
  requiredTradingDays: number;
  isActive: boolean;
}

/**
 * Minimum Trading Days Evaluation
 */
export interface MinTradingDaysEvaluation {
  accountId: string;
  evaluationTimestamp: Date;
  ruleSnapshot: {
    ruleId: string;
    ruleName: string;
    snapshotVersion: string;
  };
  requiredDays: number;
  completedDays: number;
  remainingDays: number;
  progressPercentage: Decimal;
  reached: boolean;
}

/**
 * Risk Warning Levels
 */
export enum RiskWarningLevel {
  SAFE = 'SAFE',              // < 50% risk usage
  CAUTION = 'CAUTION',        // 50-75% risk usage
  WARNING = 'WARNING',        // 75-90% risk usage
  CRITICAL = 'CRITICAL',      // 90-100% risk usage
  BREACHED = 'BREACHED',      // >= 100% risk usage
}

/**
 * Risk Warning
 */
export interface RiskWarning {
  level: RiskWarningLevel;
  ruleType: RuleType;
  message: string;
  usagePercentage: Decimal;
}

/**
 * Complete Risk Calculation Result
 * 
 * Pure calculation result with no side effects.
 * Contains all risk metrics for decision making.
 */
export interface RiskCalculationResult {
  // Account identification
  accountId: string;
  accountStage: AccountStage;
  calculationTimestamp: Date;
  
  // Rule snapshot reference
  ruleSnapshotVersion: string;
  
  // Financial state
  initialBalance: Decimal;
  currentBalance: Decimal;
  currentEquity: Decimal;
  highWaterMark: Decimal;
  
  // Daily tracking
  dailyStartBalance: Decimal;
  dailyStartEquity: Decimal;
  
  // Daily Loss evaluation
  dailyLoss: DailyLossEvaluation | null;
  dailyLossBreached: boolean;
  
  // Max Drawdown evaluation
  maxDrawdown: MaxDrawdownEvaluation | null;
  maxDrawdownBreached: boolean;
  
  // Profit Target evaluation
  profitTarget: ProfitTargetEvaluation | null;
  profitTargetReached: boolean;
  
  // Min Trading Days evaluation
  minTradingDays: MinTradingDaysEvaluation | null;
  minTradingDaysReached: boolean;
  
  // Aggregate status
  anyBreach: boolean;
  allTargetsMet: boolean;
  canPass: boolean;
  canBreach: boolean;
  
  // Risk warnings (sorted by severity)
  warnings: RiskWarning[];
  
  // Breach/pass candidates (according to precedence)
  breachReason?: string;
  breachRuleType?: RuleType;
  passReason?: string;
}

/**
 * Risk Calculation Service
 * 
 * Pure calculation service for all risk metrics.
 * This is a SIDE-EFFECT FREE service that:
 * - Calculates all risk metrics
 * - Determines breach/pass eligibility
 * - Returns structured results
 * 
 * Does NOT:
 * - Write to database
 * - Send notifications
 * - Emit WebSocket events
 * - Change account status
 * 
 * Day 7 Implementation - Trading Risk Engine
 */
@Injectable()
export class RiskCalculationService {
  private readonly logger = new Logger(RiskCalculationService.name);

  constructor(
    private readonly dailyLossService: DailyLossService,
    private readonly maxDrawdownService: MaxDrawdownService,
  ) {}

  /**
   * Calculate complete risk state for an account
   * 
   * This is the CENTRAL CALCULATION function.
   * Pure, deterministic, side-effect free.
   * 
   * @param accountSnapshot Complete account data with trades and rules
   * @returns Complete risk calculation result
   */
  async calculateRisk(
    accountSnapshot: {
      id: string;
      stage: AccountStage;
      initialBalance: Decimal;
      currentBalance: Decimal;
      equity: Decimal;
      highWaterMark: Decimal;
      dailyStartBalance: Decimal;
      dailyStartEquity: Decimal;
      ruleSnapshot: {
        snapshotVersion: string;
        rules: any[];
      } | null;
      trades: Array<{
        openedAt: Date;
        status: string;
        unrealizedPnl: Decimal;
      }>;
    },
  ): Promise<RiskCalculationResult> {
    const calculationTimestamp = new Date();

    // Initialize result
    const result: RiskCalculationResult = {
      accountId: accountSnapshot.id,
      accountStage: accountSnapshot.stage,
      calculationTimestamp,
      ruleSnapshotVersion: accountSnapshot.ruleSnapshot?.snapshotVersion || 'none',
      
      // Financial state
      initialBalance: accountSnapshot.initialBalance,
      currentBalance: accountSnapshot.currentBalance,
      currentEquity: accountSnapshot.equity,
      highWaterMark: accountSnapshot.highWaterMark,
      
      // Daily tracking
      dailyStartBalance: accountSnapshot.dailyStartBalance,
      dailyStartEquity: accountSnapshot.dailyStartEquity,
      
      // Evaluations (will be populated)
      dailyLoss: null,
      dailyLossBreached: false,
      
      maxDrawdown: null,
      maxDrawdownBreached: false,
      
      profitTarget: null,
      profitTargetReached: false,
      
      minTradingDays: null,
      minTradingDaysReached: true, // Default to true unless rule exists
      
      // Aggregate status
      anyBreach: false,
      allTargetsMet: false,
      canPass: false,
      canBreach: false,
      
      warnings: [],
    };

    // Evaluate Daily Loss (Priority 1)
    try {
      result.dailyLoss = await this.dailyLossService.evaluateDailyLoss(accountSnapshot.id);
      result.dailyLossBreached = result.dailyLoss.breached;
    } catch (error) {
      this.logger.debug(`Daily loss evaluation skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Evaluate Max Drawdown (Priority 2)
    try {
      result.maxDrawdown = await this.maxDrawdownService.evaluateMaxDrawdown(accountSnapshot.id);
      result.maxDrawdownBreached = result.maxDrawdown.breached;
    } catch (error) {
      this.logger.debug(`Max drawdown evaluation skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Evaluate Profit Target (Success condition)
    try {
      result.profitTarget = await this.evaluateProfitTarget(accountSnapshot);
      result.profitTargetReached = result.profitTarget.reached;
    } catch (error) {
      this.logger.debug(`Profit target evaluation skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Evaluate Min Trading Days (Success requirement)
    try {
      result.minTradingDays = await this.evaluateMinTradingDays(accountSnapshot);
      result.minTradingDaysReached = result.minTradingDays.reached;
    } catch (error) {
      this.logger.debug(`Min trading days evaluation skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Determine aggregate status with PRECEDENCE RULES
    result.anyBreach = result.dailyLossBreached || result.maxDrawdownBreached;
    result.allTargetsMet = result.profitTargetReached && result.minTradingDaysReached;
    
    // Apply precedence: DAILY_LOSS > MAX_DRAWDOWN > TARGET
    if (result.dailyLossBreached) {
      result.canBreach = true;
      result.breachReason = result.dailyLoss?.breachReason || 'Daily loss limit exceeded';
      result.breachRuleType = RuleType.DAILY_LOSS;
    } else if (result.maxDrawdownBreached) {
      result.canBreach = true;
      result.breachReason = result.maxDrawdown?.breachReason || 'Max drawdown exceeded';
      result.breachRuleType = RuleType.MAX_DRAWDOWN;
    } else if (result.allTargetsMet) {
      result.canPass = true;
      result.passReason = 'Profit target and minimum trading days requirements met';
    }

    // Generate risk warnings
    result.warnings = this.generateRiskWarnings(result);

    return result;
  }

  /**
   * Evaluate Profit Target
   * 
   * Uses pinned rule snapshot for configuration.
   * Supports BALANCE and EQUITY basis.
   * 
   * Formula:
   *   profitTargetAmount = startingBalance × profitTargetPercent / 100
   *   profitTargetThreshold = startingBalance + profitTargetAmount
   *   reached when: currentValue >= profitTargetThreshold
   */
  private async evaluateProfitTarget(
    accountSnapshot: any,
  ): Promise<ProfitTargetEvaluation> {
    // Get profit target rule from snapshot
    const rule = this.getProfitTargetRule(accountSnapshot);

    if (!rule) {
      throw new Error('No PROFIT_TARGET rule configured');
    }

    if (!rule.isActive) {
      throw new Error('PROFIT_TARGET rule is inactive');
    }

    // Get financial values
    const initialBalance = accountSnapshot.initialBalance;
    const currentBalance = accountSnapshot.currentBalance;
    const currentEquity = accountSnapshot.equity;

    // Calculate total unrealized P&L
    const unrealizedPnl = accountSnapshot.trades
      .filter((t: any) => t.status === 'OPEN')
      .reduce(
        (sum: Decimal, trade: any) => FinancialCalculations.add(sum, trade.unrealizedPnl),
        new Decimal(0),
      );

    // Determine current value based on profit target basis
    let currentValue: Decimal;
    if (rule.profitTargetBasis === ProfitTargetBasis.EQUITY) {
      currentValue = currentEquity;
    } else {
      currentValue = currentBalance;
    }

    // Calculate profit target amount
    let profitTargetAmount: Decimal;
    if (rule.isPercentage) {
      profitTargetAmount = FinancialCalculations.roundMoney(
        FinancialCalculations.percentageOf(
          rule.profitTargetPercentage,
          initialBalance,
        ),
      );
    } else {
      profitTargetAmount = FinancialCalculations.roundMoney(rule.profitTargetPercentage);
    }

    // Calculate profit target threshold
    const profitTargetThreshold = FinancialCalculations.add(
      initialBalance,
      profitTargetAmount,
    );

    // Calculate current profit
    const currentProfit = FinancialCalculations.subtract(currentValue, initialBalance);

    // Calculate current profit percentage
    const currentProfitPercentage = FinancialCalculations.isZero(initialBalance)
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          FinancialCalculations.percentage(currentProfit, initialBalance),
        );

    // Calculate remaining profit needed
    const remainingProfit = FinancialCalculations.subtract(
      profitTargetAmount,
      currentProfit,
    );

    // Calculate progress percentage
    const progressPercentage = FinancialCalculations.isZero(profitTargetAmount)
      ? new Decimal(100)
      : FinancialCalculations.roundPercentage(
          FinancialCalculations.percentage(currentProfit, profitTargetAmount),
        );

    // Evaluate if target reached: currentValue >= profitTargetThreshold
    const reached = FinancialCalculations.greaterThanOrEqual(
      currentValue,
      profitTargetThreshold,
    );

    return {
      accountId: accountSnapshot.id,
      evaluationTimestamp: new Date(),
      ruleSnapshot: {
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        snapshotVersion: accountSnapshot.ruleSnapshot?.snapshotVersion || 'unknown',
      },
      profitTargetBasis: rule.profitTargetBasis,
      startingBalance: initialBalance,
      currentValue,
      profitTargetAmount,
      profitTargetThreshold,
      currentProfit,
      currentProfitPercentage,
      remainingProfit,
      progressPercentage,
      reached,
      details: {
        initialBalance,
        currentBalance,
        currentEquity,
        unrealizedPnl,
      },
    };
  }

  /**
   * Get Profit Target rule from account's pinned rule snapshot
   */
  private getProfitTargetRule(accountSnapshot: any): ProfitTargetRule | null {
    if (!accountSnapshot.ruleSnapshot) {
      return null;
    }

    const rules = accountSnapshot.ruleSnapshot.rules as any[];
    const profitTargetRule = rules.find((r) => r.type === RuleType.PROFIT_TARGET);

    if (!profitTargetRule) {
      return null;
    }

    // Determine profit target basis (default to BALANCE for backward compatibility)
    const profitTargetBasis = (profitTargetRule.profitTargetBasis as ProfitTargetBasis) || ProfitTargetBasis.BALANCE;

    return {
      ruleId: profitTargetRule.id,
      ruleName: profitTargetRule.name || 'Profit Target',
      profitTargetPercentage: new Decimal(profitTargetRule.value),
      profitTargetBasis,
      isPercentage: profitTargetRule.isPercentage,
      isActive: profitTargetRule.isActive !== false,
    };
  }

  /**
   * Evaluate Minimum Trading Days
   * 
   * Day 22: Enhanced with timezone-aware tracking via MinTradingDaysService
   */
  private async evaluateMinTradingDays(
    accountSnapshot: any,
  ): Promise<MinTradingDaysEvaluation> {
    // Get min trading days rule from snapshot
    const rule = this.getMinTradingDaysRule(accountSnapshot);

    if (!rule) {
      throw new Error('No MIN_TRADING_DAYS rule configured');
    }

    if (!rule.isActive) {
      throw new Error('MIN_TRADING_DAYS rule is inactive');
    }

    // Day 22: Calculate completed trading days (timezone-aware)
    const timezone = accountSnapshot.timezone || 'UTC';
    const uniqueDays = new Set<string>();
    
    accountSnapshot.trades.forEach((trade: any) => {
      if (!trade.openedAt) return;
      
      // Convert to trading date in account timezone
      const tradingDate = this.getTradingDateInTimezone(trade.openedAt, timezone);
      uniqueDays.add(tradingDate);
    });

    const completedDays = uniqueDays.size;
    const requiredDays = rule.requiredTradingDays;
    const remainingDays = Math.max(0, requiredDays - completedDays);

    const progressPercentage = requiredDays === 0
      ? new Decimal(100)
      : FinancialCalculations.roundPercentage(
          new Decimal((completedDays / requiredDays) * 100),
        );

    const reached = completedDays >= requiredDays;

    return {
      accountId: accountSnapshot.id,
      evaluationTimestamp: new Date(),
      ruleSnapshot: {
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        snapshotVersion: accountSnapshot.ruleSnapshot?.snapshotVersion || 'unknown',
      },
      requiredDays,
      completedDays,
      remainingDays,
      progressPercentage,
      reached,
    };
  }

  /**
   * Get trading date in account timezone
   * 
   * Day 22: Helper for timezone-aware trading day calculation
   */
  private getTradingDateInTimezone(utcTimestamp: Date, timezone: string): string {
    try {
      const dateStr = utcTimestamp.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const [month, day, year] = dateStr.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch (error) {
      // Fallback to UTC
      return utcTimestamp.toISOString().split('T')[0];
    }
  }

  /**
   * Get Min Trading Days rule from account's pinned rule snapshot
   */
  private getMinTradingDaysRule(accountSnapshot: any): MinTradingDaysRule | null {
    if (!accountSnapshot.ruleSnapshot) {
      return null;
    }

    const rules = accountSnapshot.ruleSnapshot.rules as any[];
    const minTradingDaysRule = rules.find((r) => r.type === RuleType.MIN_TRADING_DAYS);

    if (!minTradingDaysRule) {
      return null;
    }

    return {
      ruleId: minTradingDaysRule.id,
      ruleName: minTradingDaysRule.name || 'Minimum Trading Days',
      requiredTradingDays: new Decimal(minTradingDaysRule.value).toNumber(),
      isActive: minTradingDaysRule.isActive !== false,
    };
  }

  /**
   * Generate risk warnings based on evaluation results
   */
  private generateRiskWarnings(result: RiskCalculationResult): RiskWarning[] {
    const warnings: RiskWarning[] = [];

    // Daily Loss warnings
    if (result.dailyLoss) {
      const usage = result.dailyLoss.usagePercentage;
      const level = this.getRiskLevel(usage);
      
      if (level !== RiskWarningLevel.SAFE) {
        warnings.push({
          level,
          ruleType: RuleType.DAILY_LOSS,
          message: `Daily loss at ${FinancialCalculations.formatPercentage(usage)}% of limit`,
          usagePercentage: usage,
        });
      }
    }

    // Max Drawdown warnings
    if (result.maxDrawdown) {
      const usage = result.maxDrawdown.usagePercentage;
      const level = this.getRiskLevel(usage);
      
      if (level !== RiskWarningLevel.SAFE) {
        warnings.push({
          level,
          ruleType: RuleType.MAX_DRAWDOWN,
          message: `Drawdown at ${FinancialCalculations.formatPercentage(usage)}% of limit`,
          usagePercentage: usage,
        });
      }
    }

    // Sort by severity (highest risk first)
    warnings.sort((a, b) => {
      const levelOrder = {
        [RiskWarningLevel.BREACHED]: 5,
        [RiskWarningLevel.CRITICAL]: 4,
        [RiskWarningLevel.WARNING]: 3,
        [RiskWarningLevel.CAUTION]: 2,
        [RiskWarningLevel.SAFE]: 1,
      };
      return levelOrder[b.level] - levelOrder[a.level];
    });

    return warnings;
  }

  /**
   * Determine risk warning level based on usage percentage
   */
  private getRiskLevel(usagePercentage: Decimal): RiskWarningLevel {
    const usage = usagePercentage.toNumber();

    if (usage >= 100) return RiskWarningLevel.BREACHED;
    if (usage >= 90) return RiskWarningLevel.CRITICAL;
    if (usage >= 75) return RiskWarningLevel.WARNING;
    if (usage >= 50) return RiskWarningLevel.CAUTION;
    return RiskWarningLevel.SAFE;
  }
}
