import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradingAccountStatus, Prisma, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { RiskCalculationService, RiskCalculationResult } from './risk-calculation.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';
import { RiskWarningService } from './risk-warning.service';

/**
 * Evaluation Trigger Context
 * 
 * Describes what triggered the risk evaluation.
 */
export interface EvaluationTrigger {
  type: 'TRADE_OPEN' | 'TRADE_CLOSE' | 'MARKET_TICK' | 'BALANCE_ADJUSTMENT' | 'DAILY_RESET' | 'STAGE_TRANSITION' | 'MANUAL';
  triggeredBy?: string;  // User ID or system identifier
  metadata?: Record<string, any>;
}

/**
 * Risk Evaluation Result
 * 
 * Result of complete risk evaluation including state changes.
 */
export interface RiskEvaluationResult {
  accountId: string;
  calculation: RiskCalculationResult;
  statusChanged: boolean;
  previousStatus?: TradingAccountStatus;
  newStatus?: TradingAccountStatus;
  stateChangeReason?: string;
  evaluationTimestamp: Date;
}

/**
 * Risk Evaluation Service
 * 
 * Central orchestrator for account risk evaluation.
 * 
 * Responsibilities:
 * - Load account and pinned rules
 * - Execute transaction with row locking
 * - Call RiskCalculationService for pure calculation
 * - Apply precedence rules (DAILY_LOSS > MAX_DRAWDOWN > TARGET)
 * - Persist state changes atomically
 * - Invoke breach/pass lifecycle handlers
 * - Record immutable audit events
 * - Emit events for notifications and WebSocket
 * 
 * CRITICAL RULES:
 * - All calculations happen INSIDE transaction
 * - State changes are ATOMIC
 * - Notifications/WebSocket AFTER successful transaction
 * - Idempotent evaluation (safe to call multiple times)
 * - No duplicate breach/pass transitions
 * 
 * Day 7 Implementation - Trading Risk Engine
 */
@Injectable()
export class RiskEvaluationService {
  private readonly logger = new Logger(RiskEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskCalculation: RiskCalculationService,
    private readonly accountSnapshots: AccountSnapshotsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly riskWarning: RiskWarningService,
  ) {}

  /**
   * Evaluate account risk
   * 
   * This is the CENTRAL EVALUATION ORCHESTRATOR.
   * 
   * Flow:
   * 1. Load account with row lock (in transaction)
   * 2. Validate account is evaluable
   * 3. Get authoritative financial state
   * 4. Call calculateRisk (pure calculation)
   * 5. Apply state changes atomically
   * 6. Invoke lifecycle handlers
   * 7. Record audit events
   * 8. Emit events (AFTER transaction)
   * 
   * @param accountId Trading account ID
   * @param trigger What triggered this evaluation
   * @returns Risk evaluation result
   */
  async evaluateAccount(
    accountId: string,
    trigger: EvaluationTrigger,
  ): Promise<RiskEvaluationResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Load account with row lock
      const account = await tx.tradingAccount.findUnique({
        where: { id: accountId },
        include: {
          ruleSnapshot: true,
          trades: {
            select: {
              openedAt: true,
              status: true,
              unrealizedPnl: true,
            },
          },
        },
      });

      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      // 2. Validate account is evaluable
      const previousStatus = account.status;

      if (this.isTerminalStatus(previousStatus)) {
        this.logger.debug(
          `Account ${accountId} is in terminal status ${previousStatus}, skipping evaluation`,
        );
        
        // Return current state without changes
        const calculation = await this.riskCalculation.calculateRisk({
          id: account.id,
          stage: account.stage,
          initialBalance: new Decimal(account.initialBalance),
          currentBalance: new Decimal(account.currentBalance),
          equity: new Decimal(account.equity),
          highWaterMark: new Decimal(account.highWaterMark),
          dailyStartBalance: new Decimal(account.dailyStartBalance),
          dailyStartEquity: new Decimal(account.dailyStartEquity),
          ruleSnapshot: account.ruleSnapshot ? {
            snapshotVersion: account.ruleSnapshot.snapshotVersion,
            rules: account.ruleSnapshot.rules as any[],
          } : null,
          trades: account.trades,
        });

        return {
          accountId,
          calculation,
          statusChanged: false,
          evaluationTimestamp: new Date(),
        };
      }

      // 3. Get authoritative financial state
      const accountSnapshot = {
        id: account.id,
        stage: account.stage,
        initialBalance: new Decimal(account.initialBalance),
        currentBalance: new Decimal(account.currentBalance),
        equity: new Decimal(account.equity),
        highWaterMark: new Decimal(account.highWaterMark),
        dailyStartBalance: new Decimal(account.dailyStartBalance),
        dailyStartEquity: new Decimal(account.dailyStartEquity),
        ruleSnapshot: account.ruleSnapshot ? {
          snapshotVersion: account.ruleSnapshot.snapshotVersion,
          rules: account.ruleSnapshot.rules as any[],
        } : null,
        trades: account.trades,
      };

      // 4. Calculate risk (PURE CALCULATION, NO SIDE EFFECTS)
      const calculation = await this.riskCalculation.calculateRisk(accountSnapshot);

      this.logger.debug(
        `Risk calculated for ${accountId}: ` +
        `Breach=${calculation.canBreach}, ` +
        `Pass=${calculation.canPass}, ` +
        `DailyLoss=${calculation.dailyLossBreached}, ` +
        `MaxDD=${calculation.maxDrawdownBreached}, ` +
        `Target=${calculation.profitTargetReached}`,
      );

      // 5. Apply state changes atomically
      let statusChanged = false;
      let newStatus = previousStatus;
      let stateChangeReason: string | undefined;

      if (calculation.canBreach) {
        // BREACH - Apply immediately
        const breachResult = await this.handleBreach(
          accountId,
          calculation,
          trigger,
          tx,
        );
        
        statusChanged = true;
        newStatus = TradingAccountStatus.BREACHED;
        stateChangeReason = breachResult.reason;

      } else if (calculation.canPass) {
        // PASS - Apply if eligible
        const passResult = await this.handlePass(
          accountId,
          calculation,
          trigger,
          tx,
        );
        
        if (passResult.statusChanged) {
          statusChanged = true;
          newStatus = TradingAccountStatus.PASSED;
          stateChangeReason = passResult.reason;
        }
      }

      // 6. Update risk metrics (non-status fields)
      await this.updateRiskMetrics(accountId, calculation, tx);

      // 7. Create snapshot if status changed
      if (statusChanged) {
        await this.createStateChangeSnapshot(accountId, calculation, tx);
      }

      // 8. Prepare result
      const result: RiskEvaluationResult = {
        accountId,
        calculation,
        statusChanged,
        previousStatus: statusChanged ? previousStatus : undefined,
        newStatus: statusChanged ? newStatus : undefined,
        stateChangeReason,
        evaluationTimestamp: new Date(),
      };

      return result;
    }, {
      timeout: 15000, // 15 second timeout
      maxWait: 5000,  // Wait max 5 seconds for transaction to start
    });
  }

  /**
   * Handle breach lifecycle
   * 
   * DAY 16: AUTOMATIC BREACH ENGINE
   * 
   * Steps:
   * 1. Check idempotency (prevent duplicate breach)
   * 2. Mark account as BREACHED
   * 3. Persist breach time and reason
   * 4. Record immutable audit event
   * 5. Return breach information
   * 
   * Note: Notifications and WebSocket events emitted AFTER transaction
   * 
   * CRITICAL RULES:
   * - Only ONE breach transition allowed
   * - Historical breach data preserved
   * - No duplicate breach events
   * - Transaction-safe atomic operation
   */
  private async handleBreach(
    accountId: string,
    calculation: RiskCalculationResult,
    trigger: EvaluationTrigger,
    tx: Prisma.TransactionClient,
  ): Promise<{ reason: string }> {
    // Day 16: Re-check account status for idempotency
    const currentAccount = await tx.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        status: true,
        breachedAt: true,
        breachReason: true,
      },
    });

    if (!currentAccount) {
      throw new Error(`Account ${accountId} not found during breach handling`);
    }

    // Idempotency: If already breached, preserve original breach data
    if (currentAccount.status === TradingAccountStatus.BREACHED) {
      this.logger.debug(
        `Account ${accountId} already BREACHED at ${currentAccount.breachedAt}, ` +
        `skipping duplicate breach transition`,
      );
      
      return {
        reason: currentAccount.breachReason || 'Already breached',
      };
    }

    const breachTime = new Date();
    const breachReason = calculation.breachReason || 'Risk limit exceeded';

    // Update account status to BREACHED
    await tx.tradingAccount.update({
      where: { id: accountId },
      data: {
        status: TradingAccountStatus.BREACHED,
        breachedAt: breachTime,
        breachReason,
      },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        actorId: trigger.triggeredBy || null,
        action: 'ACCOUNT_BREACHED',
        entityType: 'TradingAccount',
        entityId: accountId,
        metadata: {
          breachReason,
          breachRuleType: calculation.breachRuleType,
          trigger: trigger.type,
          calculationSnapshot: {
            currentBalance: FinancialCalculations.formatMoney(calculation.currentBalance),
            currentEquity: FinancialCalculations.formatMoney(calculation.currentEquity),
            highWaterMark: FinancialCalculations.formatMoney(calculation.highWaterMark),
            dailyLossBreached: calculation.dailyLossBreached,
            maxDrawdownBreached: calculation.maxDrawdownBreached,
            // Day 16: Include detailed breach information
            dailyLoss: calculation.dailyLoss ? {
              current: FinancialCalculations.formatMoney(calculation.dailyLoss.dailyLoss),
              limit: FinancialCalculations.formatMoney(calculation.dailyLoss.dailyLossLimit),
              percentage: FinancialCalculations.formatPercentage(calculation.dailyLoss.dailyLossPercentage),
            } : null,
            maxDrawdown: calculation.maxDrawdown ? {
              current: FinancialCalculations.formatMoney(calculation.maxDrawdown.currentDrawdown),
              limit: FinancialCalculations.formatMoney(calculation.maxDrawdown.maxDrawdownLimit),
              percentage: FinancialCalculations.formatPercentage(calculation.maxDrawdown.currentDrawdownPercentage),
            } : null,
          },
        },
      },
    });

    this.logger.warn(
      `Account ${accountId} BREACHED: ${breachReason} (triggered by ${trigger.type})`,
    );

    return { reason: breachReason };
  }

  /**
   * Handle pass lifecycle
   * 
   * DAY 17: AUTOMATIC PASS ENGINE
   * 
   * Steps:
   * 1. Verify ALL requirements met (profit target + min trading days)
   * 2. Check idempotency (prevent duplicate pass)
   * 3. Mark current stage as PASSED
   * 4. Record pass time
   * 5. Record immutable audit event with complete snapshot
   * 6. Return pass information
   * 
   * CRITICAL RULES:
   * - Profit target alone is NOT sufficient
   * - ALL configured requirements must be satisfied
   * - Only ONE pass transition allowed (idempotency)
   * - Historical pass data preserved
   * - No duplicate pass events
   * 
   * Note: Stage advancement and notifications happen AFTER transaction
   */
  private async handlePass(
    accountId: string,
    calculation: RiskCalculationResult,
    trigger: EvaluationTrigger,
    tx: Prisma.TransactionClient,
  ): Promise<{ statusChanged: boolean; reason?: string }> {
    // Day 17: Verify ALL requirements met
    // Profit target alone is NOT sufficient
    if (!calculation.profitTargetReached) {
      this.logger.debug(
        `Account ${accountId} profit target not reached, cannot pass`,
      );
      return { statusChanged: false };
    }

    if (!calculation.minTradingDaysReached) {
      this.logger.debug(
        `Account ${accountId} minimum trading days not reached, cannot pass ` +
        `(profit target met but still incomplete)`,
      );
      return { statusChanged: false };
    }

    // Day 17: Re-check account status for idempotency
    const currentAccount = await tx.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        status: true,
        passedAt: true,
        stage: true,
      },
    });

    if (!currentAccount) {
      throw new Error(`Account ${accountId} not found during pass handling`);
    }

    // Idempotency: If already passed, preserve original pass data
    if (currentAccount.status === TradingAccountStatus.PASSED) {
      this.logger.debug(
        `Account ${accountId} already PASSED at ${currentAccount.passedAt}, ` +
        `skipping duplicate pass transition`,
      );
      
      return {
        statusChanged: false,
        reason: 'Already passed',
      };
    }

    const passTime = new Date();
    const passReason = calculation.passReason || 'All requirements met: profit target and minimum trading days achieved';

    // Update account status to PASSED
    await tx.tradingAccount.update({
      where: { id: accountId },
      data: {
        status: TradingAccountStatus.PASSED,
        passedAt: passTime,
      },
    });

    // Day 17: Create comprehensive audit log with complete pass snapshot
    await tx.auditLog.create({
      data: {
        actorId: trigger.triggeredBy || null,
        action: 'ACCOUNT_PASSED',
        entityType: 'TradingAccount',
        entityId: accountId,
        metadata: {
          passReason,
          stage: calculation.accountStage,
          trigger: trigger.type,
          calculationSnapshot: {
            currentBalance: FinancialCalculations.formatMoney(calculation.currentBalance),
            currentEquity: FinancialCalculations.formatMoney(calculation.currentEquity),
            initialBalance: FinancialCalculations.formatMoney(calculation.initialBalance),
            highWaterMark: FinancialCalculations.formatMoney(calculation.highWaterMark),
            profitTargetReached: calculation.profitTargetReached,
            minTradingDaysReached: calculation.minTradingDaysReached,
            // Day 17: Include detailed pass information
            profitTarget: calculation.profitTarget ? {
              targetAmount: FinancialCalculations.formatMoney(calculation.profitTarget.profitTargetAmount),
              currentProfit: FinancialCalculations.formatMoney(calculation.profitTarget.currentProfit),
              profitPercentage: FinancialCalculations.formatPercentage(calculation.profitTarget.currentProfitPercentage),
              threshold: FinancialCalculations.formatMoney(calculation.profitTarget.profitTargetThreshold),
            } : null,
            minTradingDays: calculation.minTradingDays ? {
              required: calculation.minTradingDays.requiredDays,
              completed: calculation.minTradingDays.completedDays,
              remaining: calculation.minTradingDays.remainingDays,
              progressPercentage: FinancialCalculations.formatPercentage(calculation.minTradingDays.progressPercentage),
            } : null,
          },
        },
      },
    });

    this.logger.log(
      `Account ${accountId} PASSED: ${passReason} (stage: ${calculation.accountStage}, triggered by ${trigger.type})`,
    );

    return { statusChanged: true, reason: passReason };
  }

  /**
   * Update risk metrics in account
   * 
   * Updates non-status fields like current drawdown percentage.
   */
  private async updateRiskMetrics(
    accountId: string,
    calculation: RiskCalculationResult,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // Update current drawdown percentage if available
    if (calculation.maxDrawdown) {
      await tx.tradingAccount.update({
        where: { id: accountId },
        data: {
          currentDrawdown: calculation.maxDrawdown.currentDrawdownPercentage,
        },
      });
    }
  }

  /**
   * Create snapshot on state change
   */
  private async createStateChangeSnapshot(
    accountId: string,
    calculation: RiskCalculationResult,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // Calculate P&L values
    const closedTrades = await tx.trade.findMany({
      where: {
        tradingAccountId: accountId,
        status: TradeStatus.CLOSED,
      },
      select: { realizedPnl: true },
    });

    const realizedPnl = closedTrades.reduce(
      (sum, t) => FinancialCalculations.add(sum, t.realizedPnl),
      new Decimal(0),
    );

    const unrealizedPnl = FinancialCalculations.subtract(
      calculation.currentEquity,
      calculation.currentBalance,
    );

    await this.accountSnapshots.createSnapshot(
      accountId,
      calculation.currentBalance,
      calculation.currentEquity,
      realizedPnl,
      unrealizedPnl,
      tx,
    );
  }

  /**
   * Check if status is terminal (no further evaluation needed)
   */
  private isTerminalStatus(status: TradingAccountStatus): boolean {
    return (
      status === TradingAccountStatus.BREACHED ||
      status === TradingAccountStatus.PASSED ||
      status === TradingAccountStatus.CLOSED
    );
  }

  /**
   * Emit post-transaction events
   * 
   * Called AFTER successful transaction commit.
   * Triggers notifications and WebSocket updates.
   * 
   * DAY 20: Added risk warning analysis
   */
  emitPostEvaluationEvents(result: RiskEvaluationResult): void {
    // Day 20: Analyze risk warnings (only if account is ACTIVE)
    if (result.newStatus === TradingAccountStatus.ACTIVE || !result.statusChanged) {
      const warnings = this.riskWarning.analyzeRisk(result.calculation);
      
      if (warnings.length > 0) {
        // Emit risk warnings for notification system
        for (const warning of warnings) {
          this.eventEmitter.emit('risk.warning.detected', {
            accountId: result.accountId,
            warning,
            calculation: result.calculation,
          });
        }
      }
    }

    if (!result.statusChanged) {
      return;
    }

    // Day 20: Clear warning state on status changes
    if (result.newStatus === TradingAccountStatus.BREACHED ||
        result.newStatus === TradingAccountStatus.PASSED) {
      this.riskWarning.clearWarningState(result.accountId);
    }

    // Emit account status changed event
    this.eventEmitter.emit('account.status.changed', {
      accountId: result.accountId,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      reason: result.stateChangeReason,
      calculation: result.calculation,
    });

    this.logger.debug(
      `Status change event emitted for account ${result.accountId}: ` +
      `${result.previousStatus} → ${result.newStatus}`,
    );
  }
}
