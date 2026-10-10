import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Inactivity Evaluation Result
 */
export interface InactivityEvaluation {
  accountId: string;
  inactivityEnabled: boolean;
  inactivityDays: number | null;
  lastTradeAt: Date | null;
  daysSinceLastTrade: number | null;
  isInactive: boolean;
  timezone: string;
  evaluatedAt: Date;
}

/**
 * Day 23: Inactivity Service
 * 
 * Implements configurable backend-authoritative inactivity tracking.
 * 
 * KEY PRINCIPLES:
 * - Configuration from pinned rule snapshot
 * - Only enforces when explicitly configured
 * - Uses authoritative lastTradeAt timestamp
 * - Timezone-aware calculation
 * - No enforcement on terminal statuses (BREACHED, PASSED, CLOSED)
 * 
 * QUALIFYING ACTIVITY:
 * ✅ Trade opened (updates lastTradeAt)
 * ❌ Rejected orders
 * ❌ Canceled orders
 * ❌ Frontend activity
 * ❌ Dashboard login
 * ❌ WebSocket connection
 * 
 * INACTIVITY CALCULATION:
 * - Days since lastTradeAt
 * - Uses account timezone
 * - Compares against configured threshold
 * 
 * ACCOUNT LIFECYCLE:
 * - ACTIVE → (inactivity threshold reached) → SUSPENDED
 * - Does NOT mark as BREACHED (uses SUSPENDED status)
 * - Only evaluates ACTIVE accounts
 * 
 * Day 23 Implementation - Trading Risk Engine
 */
@Injectable()
export class InactivityService {
  private readonly logger = new Logger(InactivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate inactivity for an account
   * 
   * Checks if account has exceeded configured inactivity period.
   * 
   * @param accountId Trading account ID
   * @returns Inactivity evaluation result
   */
  async evaluateInactivity(accountId: string): Promise<InactivityEvaluation> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        ruleSnapshot: true,
      },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    const evaluatedAt = new Date();
    const timezone = account.timezone || 'UTC';

    // Get inactivity configuration from rule snapshot
    const config = this.getInactivityConfiguration(account);

    // If inactivity not enabled, return early
    if (!config.enabled) {
      return {
        accountId,
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: account.lastTradeAt,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone,
        evaluatedAt,
      };
    }

    // Calculate days since last trade
    const daysSinceLastTrade = this.calculateDaysSinceLastTrade(
      account.lastTradeAt,
      timezone,
      evaluatedAt,
    );

    // Determine if inactive (>= threshold)
    const isInactive = daysSinceLastTrade !== null && 
                       daysSinceLastTrade >= config.inactivityDays;

    return {
      accountId,
      inactivityEnabled: true,
      inactivityDays: config.inactivityDays,
      lastTradeAt: account.lastTradeAt,
      daysSinceLastTrade,
      isInactive,
      timezone,
      evaluatedAt,
    };
  }

  /**
   * Get inactivity configuration from rule snapshot
   * 
   * Looks for inactivity rule in pinned account rules.
   * Returns disabled if no rule configured.
   * 
   * @param account Trading account with rule snapshot
   * @returns Inactivity configuration
   */
  private getInactivityConfiguration(account: any): {
    enabled: boolean;
    inactivityDays: number;
  } {
    if (!account.ruleSnapshot) {
      return { enabled: false, inactivityDays: 0 };
    }

    const rules = account.ruleSnapshot.rules as any[];
    
    if (!Array.isArray(rules)) {
      return { enabled: false, inactivityDays: 0 };
    }

    // Find INACTIVITY rule
    const inactivityRule = rules.find(
      (rule: any) => 
        (rule.type === 'INACTIVITY' || rule.type === 'INACTIVITY_DAYS') && 
        rule.isActive !== false,
    );

    if (!inactivityRule) {
      return { enabled: false, inactivityDays: 0 };
    }

    // Get days value
    const days = inactivityRule.value || 
                 inactivityRule.inactivityDays || 
                 inactivityRule.days;
    
    if (days === undefined || days === null || days === 0) {
      return { enabled: false, inactivityDays: 0 };
    }

    return {
      enabled: true,
      inactivityDays: typeof days === 'number' ? days : new Decimal(days).toNumber(),
    };
  }

  /**
   * Calculate days since last trading activity
   * 
   * Uses timezone-aware calculation with date boundaries.
   * Returns null if no trading activity.
   * 
   * @param lastTradeAt Last trade timestamp
   * @param timezone Account timezone
   * @param now Current timestamp
   * @returns Days since last trade or null
   */
  private calculateDaysSinceLastTrade(
    lastTradeAt: Date | null,
    timezone: string,
    now: Date = new Date(),
  ): number | null {
    if (!lastTradeAt) {
      return null; // No trading activity yet
    }

    try {
      // Get current date in account timezone
      const currentDate = this.getTimezoneDate(now, timezone);
      
      // Get last trade date in account timezone
      const lastTradeDate = this.getTimezoneDate(lastTradeAt, timezone);

      // Calculate day difference
      const msPerDay = 1000 * 60 * 60 * 24;
      const diffMs = currentDate.getTime() - lastTradeDate.getTime();
      const diffDays = Math.floor(diffMs / msPerDay);

      return Math.max(0, diffDays);
    } catch (error) {
      this.logger.warn(
        `Failed to calculate days since last trade for timezone ${timezone}: ${(error as Error).message}`,
      );
      
      // Fallback to UTC calculation
      const msPerDay = 1000 * 60 * 60 * 24;
      const diffMs = now.getTime() - lastTradeAt.getTime();
      const diffDays = Math.floor(diffMs / msPerDay);
      
      return Math.max(0, diffDays);
    }
  }

  /**
   * Get date in account timezone (midnight)
   * 
   * Converts timestamp to date boundary in timezone.
   * 
   * @param timestamp UTC timestamp
   * @param timezone Account timezone
   * @returns Date at midnight in timezone
   */
  private getTimezoneDate(timestamp: Date, timezone: string): Date {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(timestamp);
      const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
      const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');

      // Return date at midnight in the timezone
      return new Date(year, month, day, 0, 0, 0, 0);
    } catch (error) {
      this.logger.warn(
        `Failed to convert to timezone ${timezone}, using UTC: ${(error as Error).message}`,
      );
      
      // Fallback to UTC
      const year = timestamp.getUTCFullYear();
      const month = timestamp.getUTCMonth();
      const day = timestamp.getUTCDate();
      
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }
  }

  /**
   * Check if account status is evaluable for inactivity
   * 
   * Terminal statuses should not be evaluated:
   * - BREACHED (already failed)
   * - PASSED (already succeeded)
   * - CLOSED (account closed)
   * 
   * Evaluable statuses:
   * - ACTIVE (normal trading)
   * - PENDING (waiting to start)
   * - SUSPENDED (may become inactive)
   * 
   * @param status Account status
   * @returns True if evaluable
   */
  isStatusEvaluable(status: TradingAccountStatus): boolean {
    const terminalStatuses: TradingAccountStatus[] = [
      TradingAccountStatus.BREACHED,
      TradingAccountStatus.PASSED,
      TradingAccountStatus.CLOSED,
    ];

    return !terminalStatuses.includes(status);
  }

  /**
   * Get accounts eligible for inactivity evaluation
   * 
   * Returns accounts that:
   * - Have evaluable status (ACTIVE, PENDING, SUSPENDED)
   * - Have inactivity rule configured
   * - Have not been evaluated recently (within last hour)
   * 
   * @param limit Maximum accounts to return
   * @returns List of account IDs
   */
  async getAccountsForEvaluation(limit: number = 100): Promise<string[]> {
    // Query accounts with evaluable status
    const accounts = await this.prisma.tradingAccount.findMany({
      where: {
        status: {
          in: [
            TradingAccountStatus.ACTIVE,
            TradingAccountStatus.PENDING,
            TradingAccountStatus.SUSPENDED,
          ],
        },
        ruleSnapshot: {
          isNot: null,
        },
      },
      select: {
        id: true,
        ruleSnapshot: {
          select: {
            rules: true,
          },
        },
      },
      take: limit * 2, // Get more to filter
    });

    // Filter accounts with inactivity rule enabled
    const eligibleAccounts = accounts.filter((account) => {
      const config = this.getInactivityConfiguration(account as any);
      return config.enabled;
    });

    // Return limited account IDs
    return eligibleAccounts.slice(0, limit).map((account) => account.id);
  }

  /**
   * Mark account as inactive (suspended)
   * 
   * Transitions account to SUSPENDED status.
   * Creates immutable audit event.
   * 
   * @param accountId Trading account ID
   * @param evaluation Inactivity evaluation result
   * @param tx Optional transaction client
   * @returns Updated account
   */
  async markAccountInactive(
    accountId: string,
    evaluation: InactivityEvaluation,
    tx?: Prisma.TransactionClient,
  ) {
    const prisma = tx || this.prisma;

    // Re-fetch account with lock to prevent race conditions
    const account = await prisma.tradingAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    // Verify status is still evaluable
    if (!this.isStatusEvaluable(account.status)) {
      this.logger.warn(
        `Account ${accountId} status ${account.status} is not evaluable for inactivity`,
      );
      return account;
    }

    // Update account status to SUSPENDED
    const updatedAccount = await prisma.tradingAccount.update({
      where: { id: accountId },
      data: {
        status: TradingAccountStatus.SUSPENDED,
        updatedAt: new Date(),
      },
    });

    // Create immutable audit event
    await prisma.auditLog.create({
      data: {
        actorId: null, // System action
        action: 'ACCOUNT_SUSPENDED_INACTIVITY',
        entityType: 'TradingAccount',
        entityId: accountId,
        metadata: {
          accountNumber: account.accountNumber,
          previousStatus: account.status,
          newStatus: TradingAccountStatus.SUSPENDED,
          reason: 'INACTIVITY',
          inactivityDays: evaluation.inactivityDays,
          daysSinceLastTrade: evaluation.daysSinceLastTrade,
          lastTradeAt: evaluation.lastTradeAt?.toISOString(),
          timezone: evaluation.timezone,
          evaluatedAt: evaluation.evaluatedAt.toISOString(),
        },
      },
    });

    this.logger.log(
      `Account ${accountId} suspended due to inactivity: ` +
      `${evaluation.daysSinceLastTrade} days since last trade ` +
      `(threshold: ${evaluation.inactivityDays} days)`,
    );

    return updatedAccount;
  }

  /**
   * Check if account should receive inactivity warning
   * 
   * Warns at 80% of inactivity threshold.
   * 
   * @param evaluation Inactivity evaluation
   * @returns True if warning should be sent
   */
  shouldWarn(evaluation: InactivityEvaluation): boolean {
    if (!evaluation.inactivityEnabled || !evaluation.inactivityDays) {
      return false;
    }

    if (evaluation.daysSinceLastTrade === null) {
      return false;
    }

    // Warn at 80% threshold
    const warningThreshold = Math.floor(evaluation.inactivityDays * 0.8);
    
    return evaluation.daysSinceLastTrade >= warningThreshold && 
           !evaluation.isInactive;
  }

  /**
   * Get inactivity warning days remaining
   * 
   * @param evaluation Inactivity evaluation
   * @returns Days until inactivity or null
   */
  getDaysUntilInactive(evaluation: InactivityEvaluation): number | null {
    if (!evaluation.inactivityEnabled || !evaluation.inactivityDays) {
      return null;
    }

    if (evaluation.daysSinceLastTrade === null) {
      return evaluation.inactivityDays;
    }

    const remaining = evaluation.inactivityDays - evaluation.daysSinceLastTrade;
    return Math.max(0, remaining);
  }
}
