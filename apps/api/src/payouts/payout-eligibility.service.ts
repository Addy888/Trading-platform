import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, PayoutStatus, Prisma } from '@prisma/client';
import { KycGateService } from '../kyc/kyc-gate.service';
import { MinTradingDaysService } from '../risk-engine/min-trading-days.service';
import { InactivityService } from '../risk-engine/inactivity.service';
import { ConsistencyService } from '../risk-engine/consistency.service';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';
import { DecimalInputValidation } from '../common/utils/decimal-input-validation.util';
import Decimal from 'decimal.js';

/**
 * Individual eligibility check result
 */
export interface EligibilityCheck {
  checkName: string;
  passed: boolean;
  required: boolean;
  message: string;
  details?: any;
}

/**
 * Payout amount validation result
 */
export interface PayoutAmountValidation {
  valid: boolean;
  requestedAmount: Decimal;
  availableProfit: Decimal;
  minimumPayout: Decimal | null;
  maximumPayout: Decimal | null;
  profitSplit: Decimal | null;
  eligibleAmount: Decimal;
  pendingPayouts: Decimal;
  message: string;
}

/**
 * Complete payout eligibility evaluation result
 */
export interface PayoutEligibilityResult {
  eligible: boolean;
  rejectionCode: string | null;
  safeMessage: string;
  checks: EligibilityCheck[];
  amountValidation: PayoutAmountValidation | null;
  evaluatedAt: Date;
  ruleSnapshotVersion: string;
  accountSnapshot: {
    accountId: string;
    accountNumber: string;
    status: TradingAccountStatus;
    balance: string;
    equity: string;
    profit: string;
  };
}

/**
 * Payout request context
 */
export interface PayoutRequestContext {
  userId: string;
  tradingAccountId: string;
  requestedAmount: number;
  method?: string;
  destination?: string;
}

/**
 * Day 25: Payout Eligibility Service
 * 
 * Central backend-authoritative payout eligibility engine.
 * 
 * OBJECTIVE:
 * - Single source of truth for payout eligibility
 * - Evaluates ALL configured requirements
 * - Returns structured pass/fail result
 * - Does NOT approve or transfer money
 * - Only determines if payout request can be created
 * 
 * REQUIRED CHECKS:
 * 1. Account State - exists, owned, eligible status, not breached
 * 2. KYC Gate (Day 24) - identity verified
 * 3. Minimum Trading Days (Day 22) - required days met
 * 4. Inactivity (Day 23) - not inactive/suspended
 * 5. Profit/Pass State - account passed, has profit
 * 6. Consistency (Day 21) - profit distribution acceptable
 * 7. Payout Amount - within limits, split calculated
 * 8. Concurrent Payouts - no pending conflicts
 * 
 * KEY PRINCIPLES:
 * - Use pinned rule snapshot (not current plan)
 * - Backend-authoritative (no client trust)
 * - Transaction-safe (prevent race conditions)
 * - Immutable audit trail (Day 19)
 * - Clear rejection messages
 * - Admin can review but not bypass rules
 * 
 * Day 25 Implementation - Trading Risk Engine
 */
@Injectable()
export class PayoutEligibilityService {
  private readonly logger = new Logger(PayoutEligibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kycGate: KycGateService,
    private readonly minTradingDays: MinTradingDaysService,
    private readonly inactivity: InactivityService,
    private readonly consistency: ConsistencyService,
  ) {}

  /**
   * Evaluate complete payout eligibility
   * 
   * Runs all configured checks and returns structured result.
   * Does NOT create payout request - only evaluates eligibility.
   * 
   * @param context Payout request context
   * @returns Complete eligibility evaluation
   */
  async evaluate(
    context: PayoutRequestContext,
  ): Promise<PayoutEligibilityResult> {
    const checks: EligibilityCheck[] = [];
    const evaluatedAt = new Date();

    try {
      // 1. Load and validate account
      const account = await this.loadAccount(context.tradingAccountId, context.userId);
      
      if (!account.valid) {
        return this.buildRejectionResult(
          'ACCOUNT_INVALID',
          account.message,
          checks,
          evaluatedAt,
          null,
        );
      }

      const accountData = account.account!;
      const ruleSnapshotVersion = accountData.ruleSnapshot?.snapshotVersion || 'NONE';

      // Build account snapshot
      const accountSnapshot = {
        accountId: accountData.id,
        accountNumber: accountData.accountNumber,
        status: accountData.status,
        balance: accountData.currentBalance.toString(),
        equity: accountData.equity.toString(),
        profit: FinancialCalculations.formatMoney(
          FinancialCalculations.subtract(accountData.equity, accountData.initialBalance),
        ),
      };

      // 2. Account status check
      const statusCheck = await this.checkAccountStatus(accountData);
      checks.push(statusCheck);
      if (!statusCheck.passed) {
        return this.buildRejectionResult(
          'ACCOUNT_STATUS_INVALID',
          statusCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
        );
      }

      // 3. Account not breached
      const breachCheck = this.checkNotBreached(accountData);
      checks.push(breachCheck);
      if (!breachCheck.passed) {
        return this.buildRejectionResult(
          'ACCOUNT_BREACHED',
          breachCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
        );
      }

      // 4. KYC Gate (Day 24)
      const kycCheck = await this.checkKYC(context.userId, accountData);
      checks.push(kycCheck);
      if (!kycCheck.passed) {
        return this.buildRejectionResult(
          'KYC_NOT_VERIFIED',
          kycCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
        );
      }

      // 5. Minimum Trading Days (Day 22)
      const minDaysCheck = await this.checkMinimumTradingDays(accountData.id);
      checks.push(minDaysCheck);
      if (!minDaysCheck.passed && minDaysCheck.required) {
        return this.buildRejectionResult(
          'MIN_TRADING_DAYS_NOT_MET',
          minDaysCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
        );
      }

      // 6. Inactivity check (Day 23)
      const inactivityCheck = await this.checkInactivity(accountData.id);
      checks.push(inactivityCheck);
      if (!inactivityCheck.passed) {
        return this.buildRejectionResult(
          'ACCOUNT_INACTIVE',
          inactivityCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
        );
      }

      // 7. Profit exists and account passed
      const profitCheck = this.checkProfitAndPassStatus(accountData);
      checks.push(profitCheck);
      if (!profitCheck.passed) {
        return this.buildRejectionResult(
          'INSUFFICIENT_PROFIT',
          profitCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
        );
      }

      // 8. Consistency check (Day 21/26)
      const consistencyCheck = await this.checkConsistency(accountData.id);
      checks.push(consistencyCheck);

      // 9. Payout amount validation
      const amountValidation = await this.validatePayoutAmount(
        accountData,
        context.requestedAmount,
      );
      
      // Day 26: If consistency is enforced and failed, block payout BEFORE amount validation
      if (!consistencyCheck.passed && consistencyCheck.required) {
        return this.buildRejectionResult(
          'CONSISTENCY_THRESHOLD_EXCEEDED',
          consistencyCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
          amountValidation,
        );
      }
      
      // Continue with amount validation
      if (!amountValidation.valid) {
        return this.buildRejectionResult(
          'INVALID_PAYOUT_AMOUNT',
          amountValidation.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
          amountValidation,
        );
      }

      // 10. Check for concurrent/pending payouts
      const concurrentCheck = await this.checkConcurrentPayouts(
        context.userId,
        accountData.id,
      );
      checks.push(concurrentCheck);
      if (!concurrentCheck.passed) {
        return this.buildRejectionResult(
          'PENDING_PAYOUT_EXISTS',
          concurrentCheck.message,
          checks,
          evaluatedAt,
          ruleSnapshotVersion,
          accountSnapshot,
          amountValidation,
        );
      }

      // All checks passed!
      return {
        eligible: true,
        rejectionCode: null,
        safeMessage: 'Payout request eligible for admin review',
        checks,
        amountValidation,
        evaluatedAt,
        ruleSnapshotVersion,
        accountSnapshot,
      };

    } catch (error) {
      this.logger.error(
        `Payout eligibility evaluation failed: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return this.buildRejectionResult(
        'EVALUATION_ERROR',
        'Failed to evaluate payout eligibility. Please contact support.',
        checks,
        evaluatedAt,
        null,
      );
    }
  }

  /**
   * Load and validate trading account
   */
  private async loadAccount(
    tradingAccountId: string,
    userId: string,
  ): Promise<{
    valid: boolean;
    message: string;
    account?: any;
  }> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        ruleSnapshot: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!account) {
      return {
        valid: false,
        message: 'Trading account not found',
      };
    }

    // Verify ownership
    if (account.userId !== userId) {
      return {
        valid: false,
        message: 'Access denied: You do not own this account',
      };
    }

    return {
      valid: true,
      message: 'Account valid',
      account,
    };
  }

  /**
   * Check 1: Account status allows payouts
   */
  private async checkAccountStatus(account: any): Promise<EligibilityCheck> {
    const eligibleStatuses = [
      TradingAccountStatus.PASSED,
      TradingAccountStatus.ACTIVE,
    ];

    const passed = eligibleStatuses.includes(account.status);

    return {
      checkName: 'ACCOUNT_STATUS',
      passed,
      required: true,
      message: passed
        ? `Account status ${account.status} allows payouts`
        : `Account status ${account.status} does not allow payouts. Only PASSED or ACTIVE accounts can request payouts.`,
      details: {
        status: account.status,
        eligibleStatuses,
      },
    };
  }

  /**
   * Check 2: Account not breached
   */
  private checkNotBreached(account: any): EligibilityCheck {
    const passed = account.status !== TradingAccountStatus.BREACHED;

    return {
      checkName: 'NOT_BREACHED',
      passed,
      required: true,
      message: passed
        ? 'Account has not breached any rules'
        : `Account breached on ${account.breachedAt?.toISOString()}. Reason: ${account.breachReason || 'Unknown'}`,
      details: {
        breached: !passed,
        breachedAt: account.breachedAt,
        breachReason: account.breachReason,
      },
    };
  }

  /**
   * Check 3: KYC verified (Day 24)
   */
  private async checkKYC(
    userId: string,
    account: any,
  ): Promise<EligibilityCheck> {
    const kycResult = await this.kycGate.checkEligibility(userId, {
      tradingAccountId: account.id,
      accountNumber: account.accountNumber,
    });

    return {
      checkName: 'KYC_VERIFICATION',
      passed: kycResult.eligible,
      required: true,
      message: kycResult.reason,
      details: {
        kycStatus: kycResult.status,
        kycSubmissionId: kycResult.kycSubmissionId,
      },
    };
  }

  /**
   * Check 4: Minimum trading days met (Day 22)
   */
  private async checkMinimumTradingDays(
    accountId: string,
  ): Promise<EligibilityCheck> {
    try {
      const progress = await this.minTradingDays.calculateProgress(accountId);

      const passed = progress.reached || progress.requiredDays === 0;
      const required = progress.requiredDays > 0;

      return {
        checkName: 'MINIMUM_TRADING_DAYS',
        passed,
        required,
        message: required
          ? passed
            ? `Minimum trading days requirement met: ${progress.completedDays}/${progress.requiredDays} days`
            : `Minimum trading days not met: ${progress.completedDays}/${progress.requiredDays} days (${progress.remainingDays} remaining)`
          : 'No minimum trading days requirement',
        details: {
          required: progress.requiredDays,
          completed: progress.completedDays,
          remaining: progress.remainingDays,
          progressPercentage: progress.progressPercentage.toFixed(2),
        },
      };
    } catch (error) {
      this.logger.error(
        `Minimum trading days check failed: ${(error as Error).message}`,
      );

      return {
        checkName: 'MINIMUM_TRADING_DAYS',
        passed: false,
        required: false,
        message: 'Could not evaluate minimum trading days requirement',
        details: {
          error: (error as Error).message,
        },
      };
    }
  }

  /**
   * Check 5: Account not inactive (Day 23)
   */
  private async checkInactivity(accountId: string): Promise<EligibilityCheck> {
    try {
      const evaluation = await this.inactivity.evaluateInactivity(accountId);

      const passed = !evaluation.isInactive;

      return {
        checkName: 'INACTIVITY',
        passed,
        required: evaluation.inactivityEnabled,
        message: evaluation.inactivityEnabled
          ? passed
            ? evaluation.daysSinceLastTrade !== null
              ? `Account active: ${evaluation.daysSinceLastTrade} days since last trade (limit: ${evaluation.inactivityDays})`
              : 'No trading activity yet (not inactive)'
            : `Account inactive: ${evaluation.daysSinceLastTrade} days without trading exceeds limit of ${evaluation.inactivityDays} days`
          : 'No inactivity rule configured',
        details: {
          enabled: evaluation.inactivityEnabled,
          daysSinceLastTrade: evaluation.daysSinceLastTrade,
          inactivityDays: evaluation.inactivityDays,
          lastTradeAt: evaluation.lastTradeAt,
        },
      };
    } catch (error) {
      this.logger.error(`Inactivity check failed: ${(error as Error).message}`);

      return {
        checkName: 'INACTIVITY',
        passed: true, // Don't block on check failure
        required: false,
        message: 'Could not evaluate inactivity status',
        details: {
          error: (error as Error).message,
        },
      };
    }
  }

  /**
   * Check 6: Has profit and account passed
   */
  private checkProfitAndPassStatus(account: any): EligibilityCheck {
    const profit = FinancialCalculations.subtract(
      account.equity,
      account.initialBalance,
    );

    const hasProfit = FinancialCalculations.greaterThan(profit, new Decimal(0));
    const hasPassed = account.status === TradingAccountStatus.PASSED ||
                      account.passedAt !== null;

    const passed = hasProfit;

    return {
      checkName: 'PROFIT_AND_PASS_STATUS',
      passed,
      required: true,
      message: passed
        ? `Account has profit of ${FinancialCalculations.formatMoney(profit)}`
        : profit.equals(0)
          ? 'Account has no profit to withdraw'
          : `Account has negative P&L of ${FinancialCalculations.formatMoney(profit)}`,
      details: {
        profit: FinancialCalculations.formatMoney(profit),
        balance: account.currentBalance.toString(),
        equity: account.equity.toString(),
        initialBalance: account.initialBalance.toString(),
        hasPassed,
        passedAt: account.passedAt,
      },
    };
  }

  /**
   * Check 7: Consistency (Day 21/26)
   * 
   * Day 26: Can be enforced (blocking) or advisory based on rule configuration.
   */
  private async checkConsistency(accountId: string): Promise<EligibilityCheck> {
    try {
      const consistencyResult = await this.consistency.calculateConsistency(accountId);

      // Day 26: Check if consistency is enforced (blocking) or advisory
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: accountId },
        include: { ruleSnapshot: true },
      });

      const isEnforced = account?.ruleSnapshot 
        ? this.consistency.getConsistencyEnforcement(account.ruleSnapshot.rules)
        : false;

      return {
        checkName: 'CONSISTENCY',
        passed: consistencyResult.passed,
        required: isEnforced, // Day 26: Enforced mode blocks payout
        message: consistencyResult.requiredThreshold
          ? consistencyResult.passed
            ? `Consistency check passed: ${consistencyResult.consistencyPercentage.toFixed(2)}% (threshold: ${consistencyResult.requiredThreshold.toFixed(2)}%)`
            : isEnforced
              ? `Consistency check failed: ${consistencyResult.consistencyPercentage.toFixed(2)}% exceeds enforced threshold of ${consistencyResult.requiredThreshold.toFixed(2)}%. Payout blocked.`
              : `Consistency check failed: ${consistencyResult.consistencyPercentage.toFixed(2)}% exceeds threshold of ${consistencyResult.requiredThreshold.toFixed(2)}%. Manual admin review required.`
          : `Consistency: ${consistencyResult.consistencyPercentage.toFixed(2)}% (no threshold configured)`,
        details: {
          consistencyPercentage: consistencyResult.consistencyPercentage.toFixed(2),
          requiredThreshold: consistencyResult.requiredThreshold?.toFixed(2),
          totalProfit: FinancialCalculations.formatMoney(consistencyResult.totalProfit),
          highestProfitableDay: FinancialCalculations.formatMoney(consistencyResult.highestProfitableDay),
          profitableDaysCount: consistencyResult.profitableDaysCount,
          totalTradingDays: consistencyResult.totalTradingDays,
          enforced: isEnforced, // Day 26: Flag enforcement mode
        },
      };
    } catch (error) {
      this.logger.error(`Consistency check failed: ${(error as Error).message}`);

      return {
        checkName: 'CONSISTENCY',
        passed: true, // Don't block on check failure
        required: false,
        message: 'Could not evaluate consistency',
        details: {
          error: (error as Error).message,
        },
      };
    }
  }

  /**
   * Check 8: Payout amount validation
   */
  private async validatePayoutAmount(
    account: any,
    requestedAmount: number,
  ): Promise<PayoutAmountValidation> {
    // Validate requested amount format
    let validatedAmount: Decimal;
    try {
      validatedAmount = DecimalInputValidation.validateMoney(
        requestedAmount,
        'Payout amount',
      );
    } catch (error) {
      return {
        valid: false,
        requestedAmount: new Decimal(0),
        availableProfit: new Decimal(0),
        minimumPayout: null,
        maximumPayout: null,
        profitSplit: null,
        eligibleAmount: new Decimal(0),
        pendingPayouts: new Decimal(0),
        message: `Invalid payout amount: ${(error as Error).message}`,
      };
    }

    // Calculate available profit
    const profit = FinancialCalculations.subtract(
      account.equity,
      account.initialBalance,
    );

    // Get payout configuration from rule snapshot
    const config = this.getPayoutConfiguration(account);

    // Calculate pending payouts
    const pendingPayouts = await this.calculatePendingPayouts(account.id);

    // Calculate eligible amount (profit - pending payouts)
    const eligibleAmount = FinancialCalculations.subtract(profit, pendingPayouts);

    // Validate amount against limits
    if (FinancialCalculations.lessThanOrEqual(validatedAmount, new Decimal(0))) {
      return {
        valid: false,
        requestedAmount: validatedAmount,
        availableProfit: profit,
        minimumPayout: config.minimumPayout,
        maximumPayout: config.maximumPayout,
        profitSplit: config.profitSplit,
        eligibleAmount,
        pendingPayouts,
        message: 'Payout amount must be greater than zero',
      };
    }

    // Check minimum payout
    if (
      config.minimumPayout &&
      FinancialCalculations.lessThan(validatedAmount, config.minimumPayout)
    ) {
      return {
        valid: false,
        requestedAmount: validatedAmount,
        availableProfit: profit,
        minimumPayout: config.minimumPayout,
        maximumPayout: config.maximumPayout,
        profitSplit: config.profitSplit,
        eligibleAmount,
        pendingPayouts,
        message: `Payout amount must be at least ${FinancialCalculations.formatMoney(config.minimumPayout)}`,
      };
    }

    // Check maximum payout
    if (
      config.maximumPayout &&
      FinancialCalculations.greaterThan(validatedAmount, config.maximumPayout)
    ) {
      return {
        valid: false,
        requestedAmount: validatedAmount,
        availableProfit: profit,
        minimumPayout: config.minimumPayout,
        maximumPayout: config.maximumPayout,
        profitSplit: config.profitSplit,
        eligibleAmount,
        pendingPayouts,
        message: `Payout amount cannot exceed ${FinancialCalculations.formatMoney(config.maximumPayout)}`,
      };
    }

    // Check against eligible amount
    if (FinancialCalculations.greaterThan(validatedAmount, eligibleAmount)) {
      return {
        valid: false,
        requestedAmount: validatedAmount,
        availableProfit: profit,
        minimumPayout: config.minimumPayout,
        maximumPayout: config.maximumPayout,
        profitSplit: config.profitSplit,
        eligibleAmount,
        pendingPayouts,
        message: `Requested amount exceeds available profit. Available: ${FinancialCalculations.formatMoney(eligibleAmount)}`,
      };
    }

    // All validations passed
    return {
      valid: true,
      requestedAmount: validatedAmount,
      availableProfit: profit,
      minimumPayout: config.minimumPayout,
      maximumPayout: config.maximumPayout,
      profitSplit: config.profitSplit,
      eligibleAmount,
      pendingPayouts,
      message: `Payout amount ${FinancialCalculations.formatMoney(validatedAmount)} is valid`,
    };
  }

  /**
   * Get payout configuration from rule snapshot
   */
  private getPayoutConfiguration(account: any): {
    minimumPayout: Decimal | null;
    maximumPayout: Decimal | null;
    profitSplit: Decimal | null;
  } {
    // Default configuration
    const config = {
      minimumPayout: null as Decimal | null,
      maximumPayout: null as Decimal | null,
      profitSplit: null as Decimal | null,
    };

    if (!account.ruleSnapshot) {
      return config;
    }

    const rules = account.ruleSnapshot.rules as any[];
    
    if (!Array.isArray(rules)) {
      return config;
    }

    // Look for payout rules
    for (const rule of rules) {
      if (rule.type === 'MIN_PAYOUT' || rule.ruleType === 'MIN_PAYOUT') {
        config.minimumPayout = new Decimal(rule.value || 0);
      }
      
      if (rule.type === 'MAX_PAYOUT' || rule.ruleType === 'MAX_PAYOUT') {
        config.maximumPayout = new Decimal(rule.value || 0);
      }
      
      if (rule.type === 'PROFIT_SPLIT' || rule.ruleType === 'PROFIT_SPLIT') {
        config.profitSplit = new Decimal(rule.value || 100);
      }
    }

    return config;
  }

  /**
   * Calculate pending payouts for account
   */
  private async calculatePendingPayouts(accountId: string): Promise<Decimal> {
    const pendingPayouts = await this.prisma.payout.findMany({
      where: {
        tradingAccountId: accountId,
        status: {
          in: [
            PayoutStatus.PENDING,
            PayoutStatus.APPROVED,
            PayoutStatus.PROCESSING,
          ],
        },
      },
      select: {
        amount: true,
      },
    });

    return pendingPayouts.reduce(
      (total, payout) => FinancialCalculations.add(total, payout.amount),
      new Decimal(0),
    );
  }

  /**
   * Check 9: No concurrent/pending payouts
   */
  private async checkConcurrentPayouts(
    userId: string,
    accountId: string,
  ): Promise<EligibilityCheck> {
    const pendingPayout = await this.prisma.payout.findFirst({
      where: {
        userId,
        tradingAccountId: accountId,
        status: PayoutStatus.PENDING,
      },
    });

    const passed = !pendingPayout;

    return {
      checkName: 'NO_PENDING_PAYOUT',
      passed,
      required: true,
      message: passed
        ? 'No pending payout requests'
        : `Pending payout request exists (ID: ${pendingPayout.id}). Wait for review or cancel existing request.`,
      details: {
        hasPendingPayout: !passed,
        pendingPayoutId: pendingPayout?.id,
      },
    };
  }

  /**
   * Build rejection result
   */
  private buildRejectionResult(
    rejectionCode: string,
    message: string,
    checks: EligibilityCheck[],
    evaluatedAt: Date,
    ruleSnapshotVersion: string | null,
    accountSnapshot?: any,
    amountValidation?: PayoutAmountValidation,
  ): PayoutEligibilityResult {
    return {
      eligible: false,
      rejectionCode,
      safeMessage: message,
      checks,
      amountValidation: amountValidation || null,
      evaluatedAt,
      ruleSnapshotVersion: ruleSnapshotVersion || 'UNKNOWN',
      accountSnapshot: accountSnapshot || {
        accountId: 'unknown',
        accountNumber: 'unknown',
        status: TradingAccountStatus.PENDING,
        balance: '0.00',
        equity: '0.00',
        profit: '0.00',
      },
    };
  }

  /**
   * Create immutable audit log for eligibility evaluation
   */
  async recordEligibilityEvaluation(
    userId: string,
    result: PayoutEligibilityResult,
    context: PayoutRequestContext,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: result.eligible
          ? 'PAYOUT_ELIGIBILITY_PASSED'
          : 'PAYOUT_ELIGIBILITY_FAILED',
        entityType: 'TradingAccount',
        entityId: context.tradingAccountId,
        metadata: {
          eligible: result.eligible,
          rejectionCode: result.rejectionCode,
          message: result.safeMessage,
          requestedAmount: context.requestedAmount,
          ruleSnapshotVersion: result.ruleSnapshotVersion,
          checks: result.checks.map((check) => ({
            checkName: check.checkName,
            passed: check.passed,
            required: check.required,
            message: check.message,
          })),
          accountSnapshot: result.accountSnapshot,
          evaluatedAt: result.evaluatedAt.toISOString(),
        },
      },
    });
  }
}
