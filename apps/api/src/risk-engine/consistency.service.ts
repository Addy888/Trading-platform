import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * Consistency Check Result
 */
export interface ConsistencyCheckResult {
  tradingAccountId: string;
  ruleSnapshotVersion: string;
  totalProfit: Decimal;
  highestProfitableDay: Decimal;
  highestProfitableDayDate: Date;
  consistencyPercentage: Decimal;
  requiredThreshold: Decimal | null;
  passed: boolean;
  profitableDaysCount: number;
  totalTradingDays: number;
  dailyProfits: Map<string, Decimal>;
  evaluatedAt: Date;
}

/**
 * Day 21/26: Consistency Service
 * 
 * Implements consistency rule calculation for payout eligibility.
 * 
 * CONSISTENCY FORMULA:
 * Consistency % = (Highest Profitable Day / Total Profit) × 100
 * 
 * REQUIREMENTS:
 * - Lower consistency % = better (more evenly distributed profits)
 * - Calculated from closed trades only (realized P&L)
 * - Respects account timezone for daily boundaries
 * - Handles edge cases: zero profit, negative profit, single day
 * - Uses pinned rule snapshot as source of truth
 * 
 * PAYOUT INTEGRATION:
 * - Evaluated at payout request time (Day 21)
 * - Results persisted in ConsistencyCheck model
 * - Creates immutable audit event
 * - Can be enforced or advisory based on configuration (Day 26)
 * 
 * DAY 26 HARDENING:
 * - Authoritative backend calculation (no client trust)
 * - Deterministic edge case handling
 * - Concurrency-safe evaluation
 * - Enhanced audit trail
 * - Boundary condition enforcement
 * 
 * Day 21/26 Implementation - Trading Risk Engine
 */
@Injectable()
export class ConsistencyService {
  private readonly logger = new Logger(ConsistencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate consistency for payout request
   * 
   * @param tradingAccountId Trading account ID
   * @param payoutId Payout request ID (for linking)
   * @returns Consistency check result
   */
  async calculateConsistency(
    tradingAccountId: string,
    payoutId?: string,
  ): Promise<ConsistencyCheckResult> {
    // Load account with rule snapshot
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        ruleSnapshot: true,
      },
    });

    if (!account) {
      throw new Error(`Trading account ${tradingAccountId} not found`);
    }

    if (!account.ruleSnapshot) {
      throw new Error(`Account ${tradingAccountId} has no rule snapshot`);
    }

    const timezone = account.timezone || 'UTC';
    const evaluatedAt = new Date();

    // Get all closed trades
    const closedTrades = await this.prisma.trade.findMany({
      where: {
        tradingAccountId,
        status: TradeStatus.CLOSED,
        closedAt: { not: null },
      },
      orderBy: { closedAt: 'asc' },
    });

    this.logger.debug(
      `Calculating consistency for account ${account.accountNumber}: ${closedTrades.length} closed trades`,
    );

    // Calculate daily profits
    const dailyProfits = this.calculateDailyProfits(closedTrades, timezone);

    // Calculate total profit
    const totalProfit = Array.from(dailyProfits.values()).reduce(
      (sum, profit) => FinancialCalculations.add(sum, profit),
      new Decimal(0),
    );

    // Find highest profitable day
    let highestProfitableDay = new Decimal(0);
    let highestProfitableDayDate: Date | null = null;
    let profitableDaysCount = 0;

    for (const [dateStr, profit] of dailyProfits.entries()) {
      if (profit.greaterThan(0)) {
        profitableDaysCount++;
        
        if (profit.greaterThan(highestProfitableDay)) {
          highestProfitableDay = profit;
          highestProfitableDayDate = new Date(dateStr);
        }
      }
    }

    // Calculate consistency percentage
    let consistencyPercentage: Decimal;
    let passed = false;

      // Day 26: Enhanced edge case handling
    if (totalProfit.lessThanOrEqualTo(0)) {
      // Edge Case 1: Zero or Negative Profit
      // Payout should not be eligible with no profit
      // Consistency not applicable - fail automatically
      consistencyPercentage = new Decimal(0);
      passed = false;
      
      this.logger.debug(
        `Account ${account.accountNumber}: Zero/negative profit (${FinancialCalculations.formatMoney(totalProfit)}) - consistency check N/A`,
      );
    } else if (highestProfitableDay.equals(0)) {
      // Edge Case 2: No profitable days (shouldn't happen if totalProfit > 0, but handle defensively)
      consistencyPercentage = new Decimal(0);
      passed = false;
      
      this.logger.warn(
        `Account ${account.accountNumber}: Positive total profit but no profitable days detected`,
      );
    } else {
      // Standard calculation: (Highest Day / Total Profit) × 100
      consistencyPercentage = highestProfitableDay
        .div(totalProfit)
        .mul(100);

      // Day 26: Strict threshold enforcement
      const rules = account.ruleSnapshot.rules as any;
      const requiredThreshold = this.getConsistencyThreshold(rules);

      if (requiredThreshold !== null) {
        // Lower percentage = better consistency (more evenly distributed)
        // Use lessThanOrEqualTo for exact threshold boundary (inclusive)
        passed = consistencyPercentage.lessThanOrEqualTo(requiredThreshold);
        
        this.logger.debug(
          `Account ${account.accountNumber}: Consistency ${consistencyPercentage.toFixed(2)}% ` +
          `vs threshold ${requiredThreshold.toFixed(2)}% - ${passed ? 'PASS' : 'FAIL'}`,
        );
      } else {
        // No threshold configured - informational only, pass by default
        passed = true;
        
        this.logger.debug(
          `Account ${account.accountNumber}: Consistency ${consistencyPercentage.toFixed(2)}% (no threshold)`,
        );
      }
    }

    const result: ConsistencyCheckResult = {
      tradingAccountId,
      ruleSnapshotVersion: account.ruleSnapshot.snapshotVersion,
      totalProfit,
      highestProfitableDay,
      highestProfitableDayDate: highestProfitableDayDate || evaluatedAt,
      consistencyPercentage,
      requiredThreshold: this.getConsistencyThreshold(account.ruleSnapshot.rules as any),
      passed,
      profitableDaysCount,
      totalTradingDays: dailyProfits.size,
      dailyProfits,
      evaluatedAt,
    };

    // Persist consistency check if payoutId provided
    if (payoutId) {
      await this.persistConsistencyCheck(payoutId, result);
    }

    this.logger.log(
      `Consistency check for account ${account.accountNumber}: ` +
      `${consistencyPercentage.toFixed(2)}% (threshold: ${result.requiredThreshold?.toFixed(2) || 'N/A'}%) - ${passed ? 'PASSED' : 'FAILED'}`,
    );

    return result;
  }

  /**
   * Calculate daily profits from closed trades
   * 
   * Groups trades by trading day (respecting timezone) and sums realized P&L.
   * Handles:
   * - Multiple trades per day
   * - Partial closes (single realizedPnl value per trade)
   * - Commission/swap (already included in realizedPnl)
   * 
   * @param closedTrades List of closed trades
   * @param timezone Account timezone
   * @returns Map of date string (YYYY-MM-DD) to profit
   */
  private calculateDailyProfits(
    closedTrades: any[],
    timezone: string,
  ): Map<string, Decimal> {
    const dailyProfits = new Map<string, Decimal>();

    for (const trade of closedTrades) {
      if (!trade.closedAt) continue;

      // Get trading day in account timezone
      const tradingDay = this.getTradingDay(trade.closedAt, timezone);
      const dateKey = tradingDay.toISOString().split('T')[0]; // YYYY-MM-DD

      // Add realized P&L to daily total
      const currentProfit = dailyProfits.get(dateKey) || new Decimal(0);
      const newProfit = FinancialCalculations.add(
        currentProfit,
        new Decimal(trade.realizedPnl),
      );

      dailyProfits.set(dateKey, newProfit);
    }

    return dailyProfits;
  }

  /**
   * Get trading day in account timezone
   * 
   * Converts UTC timestamp to account timezone and extracts date.
   * 
   * @param utcDate UTC date
   * @param timezone Account timezone
   * @returns Date at start of day in timezone
   */
  private getTradingDay(utcDate: Date, timezone: string): Date {
    // Convert to timezone
    const dateStr = utcDate.toLocaleString('en-US', { timeZone: timezone });
    const localDate = new Date(dateStr);

    // Get start of day
    const tradingDay = new Date(localDate);
    tradingDay.setHours(0, 0, 0, 0);

    return tradingDay;
  }

  /**
   * Get consistency threshold from rule snapshot
   * 
   * Looks for consistency rule in pinned rules.
   * Returns null if no threshold configured.
   * 
   * @param rules Rule snapshot rules
   * @returns Consistency threshold percentage or null
   */
  private getConsistencyThreshold(rules: any): Decimal | null {
    if (!rules || !Array.isArray(rules)) {
      return null;
    }

    // Look for consistency rule
    const consistencyRule = rules.find(
      (rule: any) => rule.ruleType === 'CONSISTENCY' && rule.isActive,
    );

    if (!consistencyRule) {
      return null;
    }

    // Get threshold value
    if (consistencyRule.value !== undefined) {
      return new Decimal(consistencyRule.value);
    }

    if (consistencyRule.maxDailyProfitPercentage !== undefined) {
      return new Decimal(consistencyRule.maxDailyProfitPercentage);
    }

    return null;
  }

  /**
   * Check if consistency rule is enforced (blocking) or advisory
   * 
   * Day 26: Determines if consistency failure blocks payout request.
   * 
   * @param rules Rule snapshot rules
   * @returns True if consistency is enforced (blocking)
   */
  getConsistencyEnforcement(rules: any): boolean {
    if (!rules || !Array.isArray(rules)) {
      return false; // No rule = not enforced
    }

    const consistencyRule = rules.find(
      (rule: any) => rule.ruleType === 'CONSISTENCY' && rule.isActive,
    );

    if (!consistencyRule) {
      return false; // No rule = not enforced
    }

    // Check if rule has enforcement flag
    // Default to advisory (false) for backward compatibility
    return consistencyRule.enforced === true || consistencyRule.blocking === true;
  }

  /**
   * Create immutable audit event for consistency check
   * 
   * Day 26: Enhanced audit trail with complete evaluation details.
   * 
   * @param userId User ID
   * @param result Consistency check result
   * @param payoutId Optional payout ID
   */
  async createConsistencyAuditEvent(
    userId: string,
    result: ConsistencyCheckResult,
    payoutId?: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: result.passed 
          ? 'PAYOUT_CONSISTENCY_CHECK_PASSED' 
          : 'PAYOUT_CONSISTENCY_CHECK_FAILED',
        entityType: 'TradingAccount',
        entityId: result.tradingAccountId,
        metadata: {
          payoutId,
          ruleSnapshotVersion: result.ruleSnapshotVersion,
          totalProfit: FinancialCalculations.formatMoney(result.totalProfit),
          highestProfitableDay: FinancialCalculations.formatMoney(result.highestProfitableDay),
          highestProfitableDayDate: result.highestProfitableDayDate.toISOString(),
          consistencyPercentage: result.consistencyPercentage.toFixed(4), // 4 decimals for precision
          requiredThreshold: result.requiredThreshold?.toFixed(4),
          passed: result.passed,
          profitableDaysCount: result.profitableDaysCount,
          totalTradingDays: result.totalTradingDays,
          evaluatedAt: result.evaluatedAt.toISOString(),
        },
      },
    });

    this.logger.debug(
      `Created consistency audit event: ${result.passed ? 'PASSED' : 'FAILED'}`,
    );
  }

  /**
   * Persist consistency check result
   * 
   * Creates ConsistencyCheck record linked to payout request.
   * 
   * @param payoutId Payout request ID
   * @param result Consistency check result
   */
  private async persistConsistencyCheck(
    payoutId: string,
    result: ConsistencyCheckResult,
  ): Promise<void> {
    await this.prisma.consistencyCheck.create({
      data: {
        payoutId,
        tradingAccountId: result.tradingAccountId,
        ruleSnapshotVersion: result.ruleSnapshotVersion,
        totalProfit: result.totalProfit,
        highestProfitableDay: result.highestProfitableDay,
        highestProfitableDayDate: result.highestProfitableDayDate,
        consistencyPercentage: result.consistencyPercentage,
        requiredThreshold: result.requiredThreshold,
        passed: result.passed,
        profitableDaysCount: result.profitableDaysCount,
        totalTradingDays: result.totalTradingDays,
        evaluatedAt: result.evaluatedAt,
        metadata: {
          dailyProfits: Object.fromEntries(
            Array.from(result.dailyProfits.entries()).map(([date, profit]) => [
              date,
              FinancialCalculations.formatMoney(profit),
            ]),
          ),
        },
      },
    });

    this.logger.debug(
      `Persisted consistency check for payout ${payoutId}: ${result.passed ? 'PASSED' : 'FAILED'}`,
    );
  }

  /**
   * Get consistency check by payout ID
   * 
   * @param payoutId Payout request ID
   * @returns Consistency check or null
   */
  async getConsistencyCheckByPayoutId(payoutId: string) {
    return this.prisma.consistencyCheck.findUnique({
      where: { payoutId },
    });
  }

  /**
   * Get consistency checks by account
   * 
   * @param tradingAccountId Trading account ID
   * @param limit Number of results
   * @returns List of consistency checks
   */
  async getConsistencyChecksByAccount(
    tradingAccountId: string,
    limit: number = 10,
  ) {
    return this.prisma.consistencyCheck.findMany({
      where: { tradingAccountId },
      orderBy: { evaluatedAt: 'desc' },
      take: limit,
    });
  }
}
