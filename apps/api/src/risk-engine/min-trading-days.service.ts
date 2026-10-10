import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TradeStatus, AccountStage } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Trading Day Record
 * 
 * Represents a unique trading day for an account.
 */
export interface TradingDayRecord {
  tradingAccountId: string;
  tradingDate: Date;
  timezone: string;
  tradeCount: number;
  stage: AccountStage;
}

/**
 * Min Trading Days Progress
 */
export interface MinTradingDaysProgress {
  accountId: string;
  requiredDays: number;
  completedDays: number;
  remainingDays: number;
  progressPercentage: Decimal;
  reached: boolean;
  lastTradingDay: Date | null;
  qualifyingDates: string[];
  evaluatedAt: Date;
}

/**
 * Day 22: Minimum Trading Days Service
 * 
 * Implements authoritative tracking of trading days for account lifecycle.
 * 
 * DEFINITION OF TRADING DAY:
 * - Unique calendar date (in account timezone)
 * - Where account had qualifying trading activity
 * - One date = one trading day (regardless of trade count)
 * 
 * KEY FEATURES:
 * - Timezone-aware date calculation
 * - Stage-specific tracking
 * - Prevents duplicate counting
 * - Uses authoritative trade records only
 * - Maintains lastTradeAt for inactivity foundation
 * 
 * WHAT COUNTS:
 * ✅ Opened trade (any status)
 * ❌ Rejected order
 * ❌ Canceled order  
 * ❌ Frontend activity
 * ❌ Dashboard login
 * 
 * INTEGRATION:
 * - Day 17 Automatic PASS (profit target + min days)
 * - Day 21 Consistency (totalTradingDays)
 * - Future payout eligibility
 * - Future inactivity detection (via lastTradeAt)
 * 
 * Day 22 Implementation - Trading Risk Engine
 */
@Injectable()
export class MinTradingDaysService {
  private readonly logger = new Logger(MinTradingDaysService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate minimum trading days progress
   * 
   * Counts unique trading dates from all trades in account timezone.
   * Respects account stage for multi-stage challenges.
   * 
   * @param accountId Trading account ID
   * @returns Min trading days progress
   */
  async calculateProgress(accountId: string): Promise<MinTradingDaysProgress> {
    // Load account with trades and rule snapshot
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        ruleSnapshot: true,
        trades: {
          where: {
            // Only count opened trades (exclude rejected/canceled orders)
            openedAt: { not: null },
          },
          select: {
            openedAt: true,
          },
          orderBy: { openedAt: 'asc' },
        },
      },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    const timezone = account.timezone || 'UTC';
    const evaluatedAt = new Date();

    // Get required days from rule snapshot
    const requiredDays = this.getRequiredTradingDays(account);

    // Calculate unique trading dates
    const qualifyingDates = this.extractQualifyingDates(
      account.trades,
      timezone,
    );

    const completedDays = qualifyingDates.length;
    const remainingDays = Math.max(0, requiredDays - completedDays);
    
    const progressPercentage = requiredDays === 0
      ? new Decimal(100)
      : new Decimal((completedDays / requiredDays) * 100);

    const reached = completedDays >= requiredDays;

    // Get last trading day
    const lastTradingDay = qualifyingDates.length > 0
      ? new Date(qualifyingDates[qualifyingDates.length - 1])
      : null;

    return {
      accountId,
      requiredDays,
      completedDays,
      remainingDays,
      progressPercentage,
      reached,
      lastTradingDay,
      qualifyingDates,
      evaluatedAt,
    };
  }

  /**
   * Record trading day for account
   * 
   * Called when trade is opened. Updates lastTradeAt and
   * creates audit trail if needed.
   * 
   * @param accountId Trading account ID
   * @param tradeOpenedAt Trade opened timestamp
   * @param tx Optional transaction client
   */
  async recordTradingDay(
    accountId: string,
    tradeOpenedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const prisma = tx || this.prisma;

    // Update lastTradeAt for inactivity tracking (Day 22 foundation)
    await prisma.tradingAccount.update({
      where: { id: accountId },
      data: {
        lastTradeAt: tradeOpenedAt,
      },
    });

    this.logger.debug(
      `Recorded trading day for account ${accountId}: ${tradeOpenedAt.toISOString()}`,
    );
  }

  /**
   * Extract qualifying trading dates
   * 
   * Converts trade timestamps to trading dates in account timezone.
   * Deduplicates to ensure one date = one trading day.
   * 
   * @param trades List of trades with openedAt
   * @param timezone Account timezone
   * @returns Array of unique trading dates (YYYY-MM-DD)
   */
  private extractQualifyingDates(
    trades: Array<{ openedAt: Date | null }>,
    timezone: string,
  ): string[] {
    const uniqueDates = new Set<string>();

    for (const trade of trades) {
      if (!trade.openedAt) continue;

      const tradingDate = this.getTradingDate(trade.openedAt, timezone);
      uniqueDates.add(tradingDate);
    }

    // Return sorted array
    return Array.from(uniqueDates).sort();
  }

  /**
   * Get trading date in account timezone
   * 
   * Converts UTC timestamp to account timezone and extracts date.
   * Respects DST transitions.
   * 
   * @param utcTimestamp UTC timestamp
   * @param timezone Account timezone
   * @returns Trading date string (YYYY-MM-DD)
   */
  private getTradingDate(utcTimestamp: Date, timezone: string): string {
    try {
      // Convert to timezone using Intl API (handles DST)
      const dateStr = utcTimestamp.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      // Parse MM/DD/YYYY format
      const [month, day, year] = dateStr.split('/');
      
      // Return YYYY-MM-DD format
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch (error) {
      // Fallback to UTC if timezone conversion fails
      this.logger.warn(
        `Failed to convert to timezone ${timezone}, using UTC: ${(error as Error).message}`,
      );
      return utcTimestamp.toISOString().split('T')[0];
    }
  }

  /**
   * Get required trading days from rule snapshot
   * 
   * Looks for MIN_TRADING_DAYS rule in pinned account rules.
   * Returns 0 if no rule configured (no requirement).
   * 
   * @param account Trading account with rule snapshot
   * @returns Required trading days count
   */
  private getRequiredTradingDays(account: any): number {
    if (!account.ruleSnapshot) {
      return 0; // No rule snapshot = no requirement
    }

    const rules = account.ruleSnapshot.rules as any[];
    
    if (!Array.isArray(rules)) {
      return 0;
    }

    // Find MIN_TRADING_DAYS rule
    const minTradingDaysRule = rules.find(
      (rule: any) => rule.type === 'MIN_TRADING_DAYS' && rule.isActive !== false,
    );

    if (!minTradingDaysRule) {
      return 0; // No rule configured = no requirement
    }

    // Get value
    const value = minTradingDaysRule.value || minTradingDaysRule.requiredTradingDays;
    
    if (value === undefined || value === null) {
      return 0;
    }

    return typeof value === 'number' ? value : new Decimal(value).toNumber();
  }

  /**
   * Check if minimum trading days requirement is met
   * 
   * Quick check without full progress calculation.
   * 
   * @param accountId Trading account ID
   * @returns True if requirement met or no requirement
   */
  async isRequirementMet(accountId: string): Promise<boolean> {
    const progress = await this.calculateProgress(accountId);
    return progress.reached;
  }

  /**
   * Get trading days count (fast query)
   * 
   * Counts unique trading dates without loading all trade data.
   * 
   * @param accountId Trading account ID
   * @param timezone Account timezone
   * @returns Completed trading days count
   */
  async getCompletedDaysCount(
    accountId: string,
    timezone: string = 'UTC',
  ): Promise<number> {
    const trades = await this.prisma.trade.findMany({
      where: {
        tradingAccountId: accountId,
        openedAt: { not: null },
      },
      select: { openedAt: true },
    });

    const qualifyingDates = this.extractQualifyingDates(trades, timezone);
    return qualifyingDates.length;
  }

  /**
   * Get last trading activity timestamp
   * 
   * Foundation for future inactivity detection (not implemented in Day 22).
   * 
   * @param accountId Trading account ID
   * @returns Last trade timestamp or null
   */
  async getLastTradingActivity(accountId: string): Promise<Date | null> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: { lastTradeAt: true },
    });

    return account?.lastTradeAt || null;
  }

  /**
   * Get trading days by stage (for multi-stage challenges)
   * 
   * NOTE: Current implementation counts all trades.
   * Stage-specific tracking requires trade.stage field or
   * filtering by date ranges. Not implemented as no explicit
   * requirement found.
   * 
   * @param accountId Trading account ID
   * @param stage Account stage
   * @returns Trading days count for stage
   */
  async getTradingDaysByStage(
    accountId: string,
    stage: AccountStage,
  ): Promise<number> {
    this.logger.warn(
      `Stage-specific trading days not implemented. ` +
      `Returning total for account ${accountId}.`,
    );

    // For now, return total count
    // Future: filter trades by stage transition dates
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: { timezone: true },
    });

    return this.getCompletedDaysCount(
      accountId,
      account?.timezone || 'UTC',
    );
  }
}
