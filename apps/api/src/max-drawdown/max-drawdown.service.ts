import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * Drawdown Type - Static or Trailing
 */
export enum DrawdownType {
  STATIC = 'STATIC',      // From initial balance
  TRAILING = 'TRAILING',  // From high water mark
}

/**
 * Drawdown Basis - What value to use for drawdown calculation
 */
export enum DrawdownBasis {
  BALANCE = 'BALANCE',    // Use balance for drawdown
  EQUITY = 'EQUITY',      // Use equity (balance + unrealized) for drawdown
}

/**
 * Trailing Method - When to update HWM for trailing drawdown
 */
export enum TrailingMethod {
  REALTIME = 'REALTIME',  // Update HWM immediately on new high
  EOD = 'EOD',            // Update HWM at end of day only
}

/**
 * Max Drawdown Rule Configuration
 */
export interface MaxDrawdownRule {
  ruleId: string;
  ruleName: string;
  maxDrawdownPercentage: Decimal;
  drawdownType: DrawdownType;
  drawdownBasis: DrawdownBasis;
  trailingMethod?: TrailingMethod;
  isPercentage: boolean;
  isActive: boolean;
}

/**
 * Max Drawdown Evaluation Result
 */
export interface MaxDrawdownEvaluation {
  accountId: string;
  evaluationTimestamp: Date;
  ruleSnapshot: {
    ruleId: string;
    ruleName: string;
    snapshotVersion: string;
  };
  drawdownType: DrawdownType;
  drawdownBasis: DrawdownBasis;
  trailingMethod?: TrailingMethod;
  
  // Reference values
  referencePoint: Decimal;          // Initial balance or HWM
  currentValue: Decimal;            // Current balance or equity
  
  // Drawdown calculations
  maxDrawdownLimit: Decimal;        // Maximum allowed drawdown amount
  currentDrawdown: Decimal;         // Current drawdown amount
  currentDrawdownPercentage: Decimal; // Current drawdown as %
  drawdownThreshold: Decimal;       // Value at which breach occurs
  remainingDrawdownBuffer: Decimal; // How much buffer remains
  usagePercentage: Decimal;         // 0-100+%
  
  // Breach status
  breached: boolean;
  breachReason?: string;
  
  // Details
  details: {
    initialBalance: Decimal;
    currentBalance: Decimal;
    currentEquity: Decimal;
    highWaterMark: Decimal;
    unrealizedPnl: Decimal;
  };
}

/**
 * Max Drawdown Service
 * 
 * Implements Static and Trailing Drawdown evaluation with:
 * - Pinned rule snapshot integration
 * - Static drawdown (from initial balance)
 * - Trailing drawdown (from high water mark)
 * - Configurable basis (BALANCE or EQUITY)
 * - Real-time or EOD HWM updates
 * - Precise decimal calculations
 * 
 * Day 6 Implementation - Trading Risk Engine
 */
@Injectable()
export class MaxDrawdownService {
  private readonly logger = new Logger(MaxDrawdownService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get Max Drawdown rule from account's pinned rule snapshot
   */
  async getMaxDrawdownRule(accountId: string): Promise<MaxDrawdownRule | null> {
    const snapshot = await this.prisma.accountRuleSnapshot.findUnique({
      where: { tradingAccountId: accountId },
    });

    if (!snapshot) {
      this.logger.error(
        `⚠️ CRITICAL: No rule snapshot found for account ${accountId}. ` +
        `Risk rules cannot be enforced. Account may need snapshot backfill.`
      );
      // Return null to trigger validation failure upstream
      return null;
    }

    const rules = snapshot.rules as any[];
    const maxDrawdownRule = rules.find((r) => r.type === RuleType.MAX_DRAWDOWN);

    if (!maxDrawdownRule) {
      this.logger.debug(
        `No MAX_DRAWDOWN rule configured for account ${accountId}`,
      );
      return null;
    }

    // Determine drawdown type (default to TRAILING for backward compatibility)
    const drawdownType = (maxDrawdownRule.drawdownType as DrawdownType) || DrawdownType.TRAILING;
    
    // Determine drawdown basis (default to EQUITY for standard behavior)
    const drawdownBasis = (maxDrawdownRule.drawdownBasis as DrawdownBasis) || DrawdownBasis.EQUITY;
    
    // Determine trailing method (default to REALTIME)
    const trailingMethod = drawdownType === DrawdownType.TRAILING
      ? ((maxDrawdownRule.trailingMethod as TrailingMethod) || TrailingMethod.REALTIME)
      : undefined;

    return {
      ruleId: maxDrawdownRule.id,
      ruleName: maxDrawdownRule.name || 'Max Drawdown',
      maxDrawdownPercentage: new Decimal(maxDrawdownRule.value),
      drawdownType,
      drawdownBasis,
      trailingMethod,
      isPercentage: maxDrawdownRule.isPercentage,
      isActive: maxDrawdownRule.isActive !== false,
    };
  }

  /**
   * Calculate Static Drawdown Threshold
   * 
   * Formula:
   *   maxDrawdownAmount = initialBalance × maxDrawdownPercent / 100
   *   staticThreshold = initialBalance - maxDrawdownAmount
   * 
   * @param initialBalance Starting balance
   * @param maxDrawdownPercentage Max drawdown percentage
   * @param isPercentage Whether the rule is percentage-based
   * @returns Static drawdown threshold
   */
  calculateStaticDrawdownThreshold(
    initialBalance: Decimal,
    maxDrawdownPercentage: Decimal,
    isPercentage: boolean,
  ): { threshold: Decimal; maxDrawdownAmount: Decimal } {
    let maxDrawdownAmount: Decimal;

    if (isPercentage) {
      maxDrawdownAmount = FinancialCalculations.roundMoney(
        FinancialCalculations.percentageOf(
          maxDrawdownPercentage,
          initialBalance,
        ),
      );
    } else {
      maxDrawdownAmount = FinancialCalculations.roundMoney(maxDrawdownPercentage);
    }

    const threshold = FinancialCalculations.subtract(
      initialBalance,
      maxDrawdownAmount,
    );

    return {
      threshold: FinancialCalculations.roundMoney(threshold),
      maxDrawdownAmount,
    };
  }

  /**
   * Calculate Trailing Drawdown Threshold
   * 
   * Formula:
   *   trailingThreshold = highWaterMark - maxDrawdownAmount
   * 
   * Threshold moves up with HWM but never down.
   * 
   * @param highWaterMark Current high water mark
   * @param maxDrawdownPercentage Max drawdown percentage
   * @param isPercentage Whether the rule is percentage-based
   * @returns Trailing drawdown threshold
   */
  calculateTrailingDrawdownThreshold(
    highWaterMark: Decimal,
    maxDrawdownPercentage: Decimal,
    isPercentage: boolean,
  ): { threshold: Decimal; maxDrawdownAmount: Decimal } {
    let maxDrawdownAmount: Decimal;

    if (isPercentage) {
      maxDrawdownAmount = FinancialCalculations.roundMoney(
        FinancialCalculations.percentageOf(
          maxDrawdownPercentage,
          highWaterMark,
        ),
      );
    } else {
      maxDrawdownAmount = FinancialCalculations.roundMoney(maxDrawdownPercentage);
    }

    const threshold = FinancialCalculations.subtract(
      highWaterMark,
      maxDrawdownAmount,
    );

    return {
      threshold: FinancialCalculations.roundMoney(threshold),
      maxDrawdownAmount,
    };
  }

  /**
   * Calculate Current Drawdown
   * 
   * Formula:
   *   currentDrawdown = max(0, referencePoint - currentValue)
   * 
   * @param referencePoint Initial balance or HWM
   * @param currentValue Current balance or equity
   * @returns Current drawdown amount
   */
  calculateCurrentDrawdown(
    referencePoint: Decimal,
    currentValue: Decimal,
  ): Decimal {
    const drawdown = FinancialCalculations.subtract(referencePoint, currentValue);
    
    // Drawdown cannot be negative (profit = 0 drawdown)
    return FinancialCalculations.roundMoney(
      FinancialCalculations.max(drawdown, new Decimal(0)),
    );
  }

  /**
   * Evaluate Max Drawdown Breach
   * 
   * Breach occurs when: currentValue <= drawdownThreshold
   * Equivalent to: currentDrawdown >= maxDrawdownAmount
   * 
   * @param currentValue Current balance or equity
   * @param drawdownThreshold Threshold at which breach occurs
   * @returns True if breached
   */
  evaluateMaxDrawdownBreach(
    currentValue: Decimal,
    drawdownThreshold: Decimal,
  ): boolean {
    return FinancialCalculations.lessThanOrEqual(currentValue, drawdownThreshold);
  }

  /**
   * Update High Water Mark
   * 
   * HWM increases when equity reaches a new high.
   * HWM never decreases.
   * 
   * @param accountId Trading account ID
   * @param currentEquity Current equity
   * @param tx Optional Prisma transaction client
   * @returns Update result
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
      throw new Error(`Account ${accountId} not found`);
    }

    const currentHWM = new Decimal(account.highWaterMark);

    if (FinancialCalculations.greaterThan(currentEquity, currentHWM)) {
      await db.tradingAccount.update({
        where: { id: accountId },
        data: { highWaterMark: currentEquity },
      });

      this.logger.debug(
        `HWM updated for ${accountId}: ${FinancialCalculations.formatMoney(currentHWM)} -> ${FinancialCalculations.formatMoney(currentEquity)}`,
      );

      return { updated: true, hwm: currentEquity };
    }

    return { updated: false, hwm: currentHWM };
  }

  /**
   * Evaluate Max Drawdown for an account
   * 
   * Complete evaluation with static or trailing drawdown.
   * Uses account's pinned rule snapshot.
   * Respects configured drawdown basis (BALANCE or EQUITY).
   * 
   * @param accountId Trading account ID
   * @param tx Optional Prisma transaction client
   * @returns Max drawdown evaluation result
   */
  async evaluateMaxDrawdown(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MaxDrawdownEvaluation> {
    const db = tx || this.prisma;

    // Get account with all necessary data
    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        ruleSnapshot: true,
        trades: {
          where: { status: 'OPEN' },
          select: { unrealizedPnl: true },
        },
      },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    // Get max drawdown rule from snapshot
    const rule = await this.getMaxDrawdownRule(accountId);

    if (!rule) {
      throw new Error(`No MAX_DRAWDOWN rule configured for account ${accountId}`);
    }

    if (!rule.isActive) {
      throw new Error(`MAX_DRAWDOWN rule is inactive for account ${accountId}`);
    }

    // Get financial values
    const initialBalance = new Decimal(account.initialBalance);
    const currentBalance = new Decimal(account.currentBalance);
    const currentEquity = new Decimal(account.equity);
    const highWaterMark = new Decimal(account.highWaterMark);

    // Calculate total unrealized P&L
    const unrealizedPnl = account.trades.reduce(
      (sum, trade) => FinancialCalculations.add(sum, trade.unrealizedPnl),
      new Decimal(0),
    );

    // Determine reference point based on drawdown type
    let referencePoint: Decimal;
    if (rule.drawdownType === DrawdownType.STATIC) {
      // Static: Always from initial balance
      referencePoint = initialBalance;
    } else {
      // Trailing: From high water mark
      referencePoint = highWaterMark;
    }

    // Determine current value based on drawdown basis
    let currentValue: Decimal;
    if (rule.drawdownBasis === DrawdownBasis.EQUITY) {
      // EQUITY: Use equity (balance + unrealized)
      currentValue = currentEquity;
    } else {
      // BALANCE: Use balance only
      currentValue = currentBalance;
    }

    // Calculate drawdown threshold and limit
    let threshold: Decimal;
    let maxDrawdownAmount: Decimal;

    if (rule.drawdownType === DrawdownType.STATIC) {
      const staticResult = this.calculateStaticDrawdownThreshold(
        initialBalance,
        rule.maxDrawdownPercentage,
        rule.isPercentage,
      );
      threshold = staticResult.threshold;
      maxDrawdownAmount = staticResult.maxDrawdownAmount;
    } else {
      const trailingResult = this.calculateTrailingDrawdownThreshold(
        highWaterMark,
        rule.maxDrawdownPercentage,
        rule.isPercentage,
      );
      threshold = trailingResult.threshold;
      maxDrawdownAmount = trailingResult.maxDrawdownAmount;
    }

    // Calculate current drawdown
    const currentDrawdown = this.calculateCurrentDrawdown(referencePoint, currentValue);

    // Calculate current drawdown percentage
    const currentDrawdownPercentage = FinancialCalculations.isZero(referencePoint)
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          FinancialCalculations.percentage(currentDrawdown, referencePoint),
        );

    // Calculate remaining buffer
    const remainingBuffer = FinancialCalculations.subtract(
      currentValue,
      threshold,
    );

    // Calculate usage percentage
    const usagePercentage = FinancialCalculations.isZero(maxDrawdownAmount)
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          FinancialCalculations.percentage(currentDrawdown, maxDrawdownAmount),
        );

    // Evaluate breach
    const breached = this.evaluateMaxDrawdownBreach(currentValue, threshold);

    const evaluation: MaxDrawdownEvaluation = {
      accountId,
      evaluationTimestamp: new Date(),
      ruleSnapshot: {
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        snapshotVersion: account.ruleSnapshot?.snapshotVersion || 'unknown',
      },
      drawdownType: rule.drawdownType,
      drawdownBasis: rule.drawdownBasis,
      trailingMethod: rule.trailingMethod,
      referencePoint,
      currentValue,
      maxDrawdownLimit: maxDrawdownAmount,
      currentDrawdown,
      currentDrawdownPercentage,
      drawdownThreshold: threshold,
      remainingDrawdownBuffer: remainingBuffer,
      usagePercentage,
      breached,
      breachReason: breached
        ? `${rule.drawdownType} max drawdown breached: ${rule.drawdownBasis.toLowerCase()} dropped to ${FinancialCalculations.formatMoney(currentValue)} (${FinancialCalculations.formatPercentage(currentDrawdownPercentage)}% drawdown from ${FinancialCalculations.formatMoney(referencePoint)}), threshold is ${FinancialCalculations.formatMoney(threshold)}`
        : undefined,
      details: {
        initialBalance,
        currentBalance,
        currentEquity,
        highWaterMark,
        unrealizedPnl,
      },
    };

    this.logger.debug(
      `Max Drawdown Evaluation for ${accountId}: ` +
      `Type=${rule.drawdownType}, ` +
      `Basis=${rule.drawdownBasis}, ` +
      `Drawdown=${FinancialCalculations.formatPercentage(currentDrawdownPercentage)}%, ` +
      `Breached=${breached}`,
    );

    return evaluation;
  }

  /**
   * Update current drawdown percentage in account
   * 
   * Stores the current drawdown percentage for display/analytics.
   * 
   * @param accountId Trading account ID
   * @param drawdownPercentage Current drawdown percentage
   * @param tx Optional Prisma transaction client
   */
  async updateCurrentDrawdown(
    accountId: string,
    drawdownPercentage: Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    await db.tradingAccount.update({
      where: { id: accountId },
      data: { currentDrawdown: drawdownPercentage },
    });
  }
}
