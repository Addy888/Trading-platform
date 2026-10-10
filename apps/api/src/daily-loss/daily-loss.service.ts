import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType, TradingAccountStatus, TradeStatus, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Daily Loss Basis - determines what value is used as the reference
 */
export enum DailyLossBasis {
  BALANCE = 'BALANCE',  // Balance at start of day vs current balance
  EQUITY = 'EQUITY',    // Equity at start of day vs current equity
}

/**
 * Daily Loss Rule Configuration
 */
export interface DailyLossRule {
  ruleId: string;
  ruleName: string;
  dailyLossPercentage: Decimal;  // Percentage limit (e.g., 4.00 for 4%)
  dailyLossBasis: DailyLossBasis;
  isPercentage: boolean;
  isActive: boolean;
}

/**
 * Daily Loss Evaluation Result
 */
export interface DailyLossEvaluation {
  accountId: string;
  evaluationTimestamp: Date;
  ruleSnapshot: {
    ruleId: string;
    ruleName: string;
    snapshotVersion: string;
  };
  dailyLossBasis: DailyLossBasis;
  dailyReference: Decimal;              // Starting value for the day
  currentReference: Decimal;            // Current value
  dailyLoss: Decimal;                   // Calculated loss amount
  dailyLossLimit: Decimal;              // Maximum allowed loss
  dailyLossPercentage: Decimal;         // Loss as percentage of reference
  remainingDailyLossBudget: Decimal;    // How much loss budget remains
  usagePercentage: Decimal;             // How much of limit is used (0-100+)
  breached: boolean;
  breachReason?: string;
  details: {
    dailyStartBalance: Decimal;
    dailyStartEquity: Decimal;
    currentBalance: Decimal;
    currentEquity: Decimal;
    realizedDailyPnl: Decimal;
    unrealizedPnl: Decimal;
    tradingDay: Date;
    lastResetAt: Date | null;
  };
}

/**
 * Daily Loss Engine Service
 * 
 * Implements authoritative backend Daily Loss calculation and evaluation
 * using pinned account rule snapshots and the Decimal Money Engine.
 * 
 * CRITICAL RULES:
 * 1. ALWAYS use account's pinned rule snapshot (not current plan rules)
 * 2. ALWAYS use Decimal arithmetic for all calculations
 * 3. ALWAYS respect the configured daily loss basis (BALANCE or EQUITY)
 * 4. ALWAYS include unrealized P&L when basis is EQUITY
 * 5. NEVER trust client-supplied values
 * 6. Backend is the ONLY source of truth
 * 
 * Day 5 Implementation - Trading Risk Engine
 */
@Injectable()
export class DailyLossService {
  private readonly logger = new Logger(DailyLossService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get Daily Loss rule from account's pinned rule snapshot
   * 
   * @param accountId Trading account ID
   * @returns Daily Loss rule configuration or null if not configured
   */
  async getDailyLossRule(accountId: string): Promise<DailyLossRule | null> {
    // Get account's pinned rule snapshot
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

    // Parse rules from snapshot
    const rules = snapshot.rules as any[];
    const dailyLossRule = rules.find((r) => r.type === RuleType.DAILY_LOSS);

    if (!dailyLossRule) {
      this.logger.debug(
        `No DAILY_LOSS rule configured for account ${accountId}`,
      );
      return null;
    }

    // Determine daily loss basis
    // Default to BALANCE for backward compatibility
    // PDF specification should define this field
    const basis = (dailyLossRule.basis as DailyLossBasis) || DailyLossBasis.BALANCE;

    return {
      ruleId: dailyLossRule.id,
      ruleName: dailyLossRule.name || 'Daily Loss Limit',
      dailyLossPercentage: new Decimal(dailyLossRule.value),
      dailyLossBasis: basis,
      isPercentage: dailyLossRule.isPercentage,
      isActive: dailyLossRule.isActive !== false, // Default to true
    };
  }

  /**
   * Calculate Daily Loss Limit
   * 
   * Formula (percentage basis):
   *   dailyLossLimit = dailyStartingReference × dailyLossPercent / 100
   * 
   * Formula (absolute basis):
   *   dailyLossLimit = configured absolute value
   * 
   * @param dailyStartingReference Starting balance or equity for the day
   * @param dailyLossPercentage Daily loss percentage limit
   * @param isPercentage Whether the rule is percentage-based
   * @returns Daily loss limit amount
   */
  calculateDailyLossLimit(
    dailyStartingReference: Decimal,
    dailyLossPercentage: Decimal,
    isPercentage: boolean,
  ): Decimal {
    if (isPercentage) {
      return FinancialCalculations.roundMoney(
        FinancialCalculations.percentageOf(
          dailyLossPercentage,
          dailyStartingReference,
        ),
      );
    } else {
      return FinancialCalculations.roundMoney(dailyLossPercentage);
    }
  }

  /**
   * Calculate Current Daily Loss
   * 
   * Formula (BALANCE basis):
   *   dailyLoss = max(0, dailyStartBalance - currentBalance)
   * 
   * Formula (EQUITY basis):
   *   dailyLoss = max(0, dailyStartEquity - currentEquity)
   * 
   * Daily loss cannot be negative (profit is not negative loss).
   * 
   * @param dailyStartingReference Starting reference (balance or equity)
   * @param currentReference Current reference (balance or equity)
   * @returns Current daily loss amount (always >= 0)
   */
  calculateCurrentDailyLoss(
    dailyStartingReference: Decimal,
    currentReference: Decimal,
  ): Decimal {
    const loss = FinancialCalculations.subtract(
      dailyStartingReference,
      currentReference,
    );

    // Daily loss cannot be negative (profit day = 0 loss)
    return FinancialCalculations.roundMoney(
      FinancialCalculations.max(loss, new Decimal(0)),
    );
  }

  /**
   * Calculate Remaining Daily Loss Budget
   * 
   * Formula:
   *   remainingBudget = dailyLossLimit - currentDailyLoss
   * 
   * Can be negative if limit is exceeded.
   * 
   * @param dailyLossLimit Maximum allowed daily loss
   * @param currentDailyLoss Current daily loss
   * @returns Remaining budget (can be negative if breached)
   */
  calculateRemainingDailyLossBudget(
    dailyLossLimit: Decimal,
    currentDailyLoss: Decimal,
  ): Decimal {
    return FinancialCalculations.roundMoney(
      FinancialCalculations.subtract(dailyLossLimit, currentDailyLoss),
    );
  }

  /**
   * Evaluate Daily Loss Breach Condition
   * 
   * Per PDF specification:
   *   Breach occurs when: dailyLoss >= dailyLossLimit
   * 
   * @param currentDailyLoss Current daily loss amount
   * @param dailyLossLimit Maximum allowed daily loss
   * @returns True if breached, false otherwise
   */
  evaluateDailyLossBreach(
    currentDailyLoss: Decimal,
    dailyLossLimit: Decimal,
  ): boolean {
    return FinancialCalculations.greaterThanOrEqual(
      currentDailyLoss,
      dailyLossLimit,
    );
  }

  /**
   * Evaluate Daily Loss for an account
   * 
   * Complete evaluation with all details.
   * Uses account's pinned rule snapshot.
   * Respects configured daily loss basis (BALANCE or EQUITY).
   * 
   * @param accountId Trading account ID
   * @param tx Optional Prisma transaction client
   * @returns Daily loss evaluation result
   */
  async evaluateDailyLoss(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DailyLossEvaluation> {
    const db = tx || this.prisma;

    // Get account with all necessary data
    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        ruleSnapshot: true,
        trades: {
          where: { status: TradeStatus.OPEN },
          select: {
            unrealizedPnl: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    // Get daily loss rule from snapshot
    const rule = await this.getDailyLossRule(accountId);

    if (!rule) {
      throw new Error(`No DAILY_LOSS rule configured for account ${accountId}`);
    }

    if (!rule.isActive) {
      throw new Error(`DAILY_LOSS rule is inactive for account ${accountId}`);
    }

    // Get daily starting values and current values
    const dailyStartBalance = new Decimal(account.dailyStartBalance);
    const dailyStartEquity = new Decimal(account.dailyStartEquity);
    const currentBalance = new Decimal(account.currentBalance);
    const currentEquity = new Decimal(account.equity);

    // Calculate total unrealized P&L
    const unrealizedPnl = account.trades.reduce(
      (sum, trade) => FinancialCalculations.add(sum, trade.unrealizedPnl),
      new Decimal(0),
    );

    // Determine daily reference based on configured basis
    let dailyReference: Decimal;
    let currentReference: Decimal;

    if (rule.dailyLossBasis === DailyLossBasis.EQUITY) {
      // EQUITY BASIS: Uses equity (balance + unrealized P&L)
      dailyReference = dailyStartEquity;
      currentReference = currentEquity;
    } else {
      // BALANCE BASIS: Uses realized balance only
      dailyReference = dailyStartBalance;
      currentReference = currentBalance;
    }

    // Calculate daily loss limit
    const dailyLossLimit = this.calculateDailyLossLimit(
      dailyReference,
      rule.dailyLossPercentage,
      rule.isPercentage,
    );

    // Calculate current daily loss
    const dailyLoss = this.calculateCurrentDailyLoss(
      dailyReference,
      currentReference,
    );

    // Calculate daily loss percentage
    const dailyLossPercentage = FinancialCalculations.isZero(dailyReference)
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          FinancialCalculations.percentage(dailyLoss, dailyReference),
        );

    // Calculate remaining budget
    const remainingBudget = this.calculateRemainingDailyLossBudget(
      dailyLossLimit,
      dailyLoss,
    );

    // Calculate usage percentage
    const usagePercentage = FinancialCalculations.isZero(dailyLossLimit)
      ? new Decimal(0)
      : FinancialCalculations.roundPercentage(
          FinancialCalculations.percentage(dailyLoss, dailyLossLimit),
        );

    // Evaluate breach
    const breached = this.evaluateDailyLossBreach(dailyLoss, dailyLossLimit);

    // Calculate realized daily P&L
    const realizedDailyPnl = FinancialCalculations.subtract(
      currentBalance,
      dailyStartBalance,
    );

    const evaluation: DailyLossEvaluation = {
      accountId,
      evaluationTimestamp: new Date(),
      ruleSnapshot: {
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        snapshotVersion: account.ruleSnapshot?.snapshotVersion || 'unknown',
      },
      dailyLossBasis: rule.dailyLossBasis,
      dailyReference,
      currentReference,
      dailyLoss,
      dailyLossLimit,
      dailyLossPercentage,
      remainingDailyLossBudget: remainingBudget,
      usagePercentage,
      breached,
      breachReason: breached
        ? `Daily ${rule.dailyLossBasis.toLowerCase()} loss of ${FinancialCalculations.formatMoney(dailyLoss)} (${FinancialCalculations.formatPercentage(dailyLossPercentage)}%) exceeds limit of ${FinancialCalculations.formatMoney(dailyLossLimit)}`
        : undefined,
      details: {
        dailyStartBalance,
        dailyStartEquity,
        currentBalance,
        currentEquity,
        realizedDailyPnl,
        unrealizedPnl,
        tradingDay: account.lastDailyResetAt || account.startedAt || account.createdAt,
        lastResetAt: account.lastDailyResetAt,
      },
    };

    this.logger.debug(
      `Daily Loss Evaluation for ${accountId}: ` +
      `Basis=${rule.dailyLossBasis}, ` +
      `Loss=${FinancialCalculations.formatMoney(dailyLoss)}/${FinancialCalculations.formatMoney(dailyLossLimit)}, ` +
      `Breached=${breached}`,
    );

    return evaluation;
  }

  /**
   * Check if account is eligible for daily reset
   * 
   * Only ACTIVE accounts are eligible for daily reset.
   * BREACHED, PASSED, CLOSED, SUSPENDED accounts should not be reset.
   * 
   * @param account Trading account
   * @returns True if eligible for reset
   */
  isEligibleForDailyReset(account: {
    status: TradingAccountStatus;
  }): boolean {
    return account.status === TradingAccountStatus.ACTIVE;
  }

  /**
   * Reset daily tracking values for a new trading day
   * 
   * CRITICAL: This should be called at the configured reset time
   * for the account's timezone.
   * 
   * Idempotent: Safe to call multiple times for the same day.
   * Transaction-safe: Must be called within a transaction.
   * 
   * @param accountId Trading account ID
   * @param resetTime Time of reset (for timezone-aware reset)
   * @param tx Prisma transaction client
   * @returns Updated account
   */
  async performDailyReset(
    accountId: string,
    resetTime: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // Get account with FOR UPDATE lock
    const account = await tx.tradingAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    // Check eligibility
    if (!this.isEligibleForDailyReset(account)) {
      this.logger.debug(
        `Account ${accountId} not eligible for daily reset (status: ${account.status})`,
      );
      return;
    }

    // Check if already reset today (idempotency)
    if (account.lastDailyResetAt) {
      const lastResetDate = new Date(account.lastDailyResetAt);
      lastResetDate.setHours(0, 0, 0, 0);
      
      const resetDate = new Date(resetTime);
      resetDate.setHours(0, 0, 0, 0);

      if (lastResetDate.getTime() === resetDate.getTime()) {
        this.logger.debug(
          `Account ${accountId} already reset today (${resetDate.toISOString()})`,
        );
        return;
      }
    }

    // Get current equity (including unrealized P&L)
    const openTrades = await tx.trade.findMany({
      where: {
        tradingAccountId: accountId,
        status: TradeStatus.OPEN,
      },
      select: {
        unrealizedPnl: true,
      },
    });

    const totalUnrealizedPnl = openTrades.reduce(
      (sum, trade) => FinancialCalculations.add(sum, trade.unrealizedPnl),
      new Decimal(0),
    );

    const currentEquity = FinancialCalculations.calculateEquity(
      new Decimal(account.currentBalance),
      totalUnrealizedPnl,
    );

    // Create daily snapshot for historical record
    const tradingDay = new Date(resetTime);
    tradingDay.setHours(0, 0, 0, 0);

    await tx.dailySnapshot.upsert({
      where: {
        tradingAccountId_tradingDay: {
          tradingAccountId: accountId,
          tradingDay,
        },
      },
      create: {
        tradingAccountId: accountId,
        tradingDay,
        startOfDayBalance: account.currentBalance,
        startOfDayEquity: currentEquity,
        endOfDayBalance: null,
        endOfDayEquity: null,
        dailyPnl: new Decimal(0),
        highWaterMark: account.highWaterMark,
      },
      update: {
        startOfDayBalance: account.currentBalance,
        startOfDayEquity: currentEquity,
      },
    });

    // Update account daily tracking values
    await tx.tradingAccount.update({
      where: { id: accountId },
      data: {
        dailyStartBalance: account.currentBalance,
        dailyStartEquity: currentEquity,
        currentDailyPnl: new Decimal(0),
        lastDailyResetAt: resetTime,
      },
    });

    // Day 18: Create immutable DAILY_RESET audit log
    await tx.auditLog.create({
      data: {
        actorId: null, // System-initiated
        action: 'DAILY_RESET',
        entityType: 'TradingAccount',
        entityId: accountId,
        metadata: {
          resetTime: resetTime.toISOString(),
          timezone: account.timezone || 'UTC',
          previousDailyStartBalance: FinancialCalculations.formatMoney(new Decimal(account.dailyStartBalance)),
          previousDailyStartEquity: FinancialCalculations.formatMoney(new Decimal(account.dailyStartEquity)),
          newDailyStartBalance: FinancialCalculations.formatMoney(account.currentBalance),
          newDailyStartEquity: FinancialCalculations.formatMoney(currentEquity),
          currentBalance: FinancialCalculations.formatMoney(account.currentBalance),
          currentEquity: FinancialCalculations.formatMoney(currentEquity),
          highWaterMark: FinancialCalculations.formatMoney(new Decimal(account.highWaterMark)),
          openPositions: openTrades.length,
          totalUnrealizedPnl: FinancialCalculations.formatMoney(totalUnrealizedPnl),
        },
      },
    });

    this.logger.log(
      `Daily reset completed for account ${accountId} at ${resetTime.toISOString()}`,
    );
  }

  /**
   * Perform daily reset for all eligible accounts
   * 
   * Should be called by a scheduled job (e.g., cron) at midnight
   * for each timezone.
   * 
   * Handles:
   * - Transaction safety
   * - Duplicate execution protection
   * - Account eligibility filtering
   * - Error handling per account
   * 
   * @param resetTime Time of reset
   * @param timezone Timezone for reset (e.g., 'UTC', 'America/New_York')
   * @returns Number of accounts reset
   */
  async performDailyResetForAllAccounts(
    resetTime: Date,
    timezone: string = 'UTC',
  ): Promise<number> {
    this.logger.log(
      `Starting daily reset for timezone ${timezone} at ${resetTime.toISOString()}`,
    );

    // Get all eligible accounts for this timezone
    const accounts = await this.prisma.tradingAccount.findMany({
      where: {
        status: TradingAccountStatus.ACTIVE,
        timezone,
      },
      select: {
        id: true,
      },
    });

    this.logger.log(
      `Found ${accounts.length} eligible accounts for daily reset`,
    );

    let successCount = 0;
    let errorCount = 0;

    // Process each account in its own transaction
    for (const account of accounts) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.performDailyReset(account.id, resetTime, tx);
        });
        
        successCount++;
        
        // Day 20: Emit event AFTER successful transaction
        this.eventEmitter.emit('daily.reset.completed', {
          accountId: account.id,
          timezone,
        });
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed to reset account ${account.id}: ${errorMessage}`,
          errorStack,
        );
      }
    }

    this.logger.log(
      `Daily reset completed: ${successCount} success, ${errorCount} errors`,
    );

    return successCount;
  }
}
