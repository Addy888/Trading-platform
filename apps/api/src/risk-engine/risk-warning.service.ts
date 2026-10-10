import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType } from '@prisma/client';
import Decimal from 'decimal.js';
import { RiskCalculationResult } from './risk-calculation.service';

/**
 * Risk Warning Level
 * 
 * Defines progressive warning states before breach.
 */
export enum RiskWarningLevel {
  SAFE = 'SAFE',              // < 50% risk usage
  CAUTION = 'CAUTION',        // 50-75% risk usage
  WARNING = 'WARNING',        // 75-90% risk usage
  CRITICAL = 'CRITICAL',      // 90-100% risk usage
  BREACHED = 'BREACHED',      // >= 100% risk usage (actual breach)
}

/**
 * Risk Warning
 * 
 * Represents a warning about approaching risk limits.
 */
export interface RiskWarning {
  accountId: string;
  warningLevel: RiskWarningLevel;
  ruleType: RuleType;
  message: string;
  usagePercentage: Decimal;
  currentValue: Decimal;
  limitValue: Decimal;
  timestamp: Date;
}

/**
 * Warning State Key
 * 
 * Used for deduplication.
 */
interface WarningStateKey {
  accountId: string;
  ruleType: RuleType;
  level: RiskWarningLevel;
}

/**
 * Day 20: Risk Warning Service
 * 
 * Detects and manages risk warnings before breach occurs.
 * 
 * RESPONSIBILITIES:
 * - Analyze risk calculation results
 * - Detect approaching limits (50%, 75%, 90%)
 * - Generate appropriate warnings
 * - Prevent duplicate warnings
 * - Return warnings for notification system
 * 
 * WARNING THRESHOLDS:
 * - SAFE: 0-49% of limit
 * - CAUTION: 50-74% of limit
 * - WARNING: 75-89% of limit
 * - CRITICAL: 90-99% of limit
 * - BREACHED: 100%+ (actual breach)
 * 
 * DEDUPLICATION:
 * - Tracks last warning level per account+rule
 * - Only notifies on level changes
 * - Prevents spam on every tick
 * 
 * BACKEND AUTHORITY:
 * - Uses authoritative calculation results
 * - Never calculates from frontend values
 * - Respects pinned rule snapshot
 * 
 * Day 20 Implementation - Trading Risk Engine
 */
@Injectable()
export class RiskWarningService {
  private readonly logger = new Logger(RiskWarningService.name);

  // In-memory cache for warning state deduplication
  // Key: "accountId:ruleType", Value: last warning level
  private warningStates = new Map<string, RiskWarningLevel>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyze risk calculation and generate warnings
   * 
   * Examines daily loss, max drawdown, and profit target metrics
   * to detect approaching limits.
   * 
   * @param calculation Risk calculation result
   * @returns Array of warnings (only new or changed warnings)
   */
  analyzeRisk(calculation: RiskCalculationResult): RiskWarning[] {
    const warnings: RiskWarning[] = [];

    // Check daily loss warnings
    if (calculation.dailyLoss) {
      const dailyLossWarning = this.checkDailyLossWarning(
        calculation.accountId,
        calculation.dailyLoss,
        calculation.calculationTimestamp,
      );
      
      if (dailyLossWarning) {
        warnings.push(dailyLossWarning);
      }
    }

    // Check max drawdown warnings
    if (calculation.maxDrawdown) {
      const drawdownWarning = this.checkDrawdownWarning(
        calculation.accountId,
        calculation.maxDrawdown,
        calculation.calculationTimestamp,
      );
      
      if (drawdownWarning) {
        warnings.push(drawdownWarning);
      }
    }

    // Check profit target approaching (optional)
    if (calculation.profitTarget && !calculation.profitTargetReached) {
      const profitWarning = this.checkProfitTargetWarning(
        calculation.accountId,
        calculation.profitTarget,
        calculation.calculationTimestamp,
      );
      
      if (profitWarning) {
        warnings.push(profitWarning);
      }
    }

    return warnings;
  }

  /**
   * Check daily loss warning level
   * 
   * @param accountId Account ID
   * @param dailyLoss Daily loss evaluation
   * @param timestamp Calculation timestamp
   * @returns Warning if level changed, null otherwise
   */
  private checkDailyLossWarning(
    accountId: string,
    dailyLoss: any,
    timestamp: Date,
  ): RiskWarning | null {
    // Calculate usage percentage (0-100+)
    const usagePercentage = dailyLoss.dailyLoss
      .div(dailyLoss.dailyLossLimit)
      .mul(100);

    const level = this.determineWarningLevel(usagePercentage);

    // Check if this is a new or changed warning
    const stateKey = this.getWarningStateKey(accountId, RuleType.DAILY_LOSS);
    const previousLevel = this.warningStates.get(stateKey);

    // Only notify on level changes (prevents duplicate warnings)
    if (previousLevel === level) {
      return null;
    }

    // Update warning state
    this.warningStates.set(stateKey, level);

    // Don't create warnings for SAFE or BREACHED states
    // BREACHED is handled by breach notification
    if (level === RiskWarningLevel.SAFE || level === RiskWarningLevel.BREACHED) {
      return null;
    }

    return {
      accountId,
      warningLevel: level,
      ruleType: RuleType.DAILY_LOSS,
      message: this.getDailyLossWarningMessage(level, usagePercentage),
      usagePercentage,
      currentValue: dailyLoss.dailyLoss,
      limitValue: dailyLoss.dailyLossLimit,
      timestamp,
    };
  }

  /**
   * Check max drawdown warning level
   * 
   * @param accountId Account ID
   * @param maxDrawdown Max drawdown evaluation
   * @param timestamp Calculation timestamp
   * @returns Warning if level changed, null otherwise
   */
  private checkDrawdownWarning(
    accountId: string,
    maxDrawdown: any,
    timestamp: Date,
  ): RiskWarning | null {
    // Calculate usage percentage (0-100+)
    const usagePercentage = maxDrawdown.currentDrawdown
      .div(maxDrawdown.maxDrawdownLimit)
      .mul(100);

    const level = this.determineWarningLevel(usagePercentage);

    // Check if this is a new or changed warning
    const stateKey = this.getWarningStateKey(accountId, RuleType.MAX_DRAWDOWN);
    const previousLevel = this.warningStates.get(stateKey);

    // Only notify on level changes
    if (previousLevel === level) {
      return null;
    }

    // Update warning state
    this.warningStates.set(stateKey, level);

    // Don't create warnings for SAFE or BREACHED states
    if (level === RiskWarningLevel.SAFE || level === RiskWarningLevel.BREACHED) {
      return null;
    }

    return {
      accountId,
      warningLevel: level,
      ruleType: RuleType.MAX_DRAWDOWN,
      message: this.getDrawdownWarningMessage(level, usagePercentage),
      usagePercentage,
      currentValue: maxDrawdown.currentDrawdown,
      limitValue: maxDrawdown.maxDrawdownLimit,
      timestamp,
    };
  }

  /**
   * Check profit target approaching
   * 
   * Only triggers when >= 90% of target reached (optional notification).
   * 
   * @param accountId Account ID
   * @param profitTarget Profit target evaluation
   * @param timestamp Calculation timestamp
   * @returns Warning if approaching target, null otherwise
   */
  private checkProfitTargetWarning(
    accountId: string,
    profitTarget: any,
    timestamp: Date,
  ): RiskWarning | null {
    // For profit target, we notify when CLOSE to success (reversed logic)
    const progressPercentage = profitTarget.progressPercentage;

    // Only notify at 90%+ progress
    if (progressPercentage.lessThan(90)) {
      return null;
    }

    // Check if already notified
    const stateKey = this.getWarningStateKey(accountId, RuleType.PROFIT_TARGET);
    const previousLevel = this.warningStates.get(stateKey);

    // Only notify once when reaching 90%
    if (previousLevel === RiskWarningLevel.CRITICAL) {
      return null;
    }

    // Update state
    this.warningStates.set(stateKey, RiskWarningLevel.CRITICAL);

    return {
      accountId,
      warningLevel: RiskWarningLevel.CRITICAL,
      ruleType: RuleType.PROFIT_TARGET,
      message: `Profit target ${progressPercentage.toFixed(1)}% complete. Keep going!`,
      usagePercentage: progressPercentage,
      currentValue: profitTarget.currentProfit,
      limitValue: profitTarget.profitTargetAmount,
      timestamp,
    };
  }

  /**
   * Determine warning level from usage percentage
   * 
   * @param usagePercentage Percentage of limit used (0-100+)
   * @returns Warning level
   */
  private determineWarningLevel(usagePercentage: Decimal): RiskWarningLevel {
    const usage = usagePercentage.toNumber();

    if (usage >= 100) return RiskWarningLevel.BREACHED;
    if (usage >= 90) return RiskWarningLevel.CRITICAL;
    if (usage >= 75) return RiskWarningLevel.WARNING;
    if (usage >= 50) return RiskWarningLevel.CAUTION;
    return RiskWarningLevel.SAFE;
  }

  /**
   * Get daily loss warning message
   */
  private getDailyLossWarningMessage(
    level: RiskWarningLevel,
    usagePercentage: Decimal,
  ): string {
    const usage = usagePercentage.toFixed(1);

    switch (level) {
      case RiskWarningLevel.CRITICAL:
        return `⚠️ Daily loss critical: ${usage}% of limit used. Close to breach!`;
      case RiskWarningLevel.WARNING:
        return `⚠️ Daily loss warning: ${usage}% of limit used. Manage risk carefully.`;
      case RiskWarningLevel.CAUTION:
        return `Daily loss caution: ${usage}% of limit used. Monitor your trades.`;
      default:
        return `Daily loss: ${usage}% of limit used.`;
    }
  }

  /**
   * Get drawdown warning message
   */
  private getDrawdownWarningMessage(
    level: RiskWarningLevel,
    usagePercentage: Decimal,
  ): string {
    const usage = usagePercentage.toFixed(1);

    switch (level) {
      case RiskWarningLevel.CRITICAL:
        return `⚠️ Drawdown critical: ${usage}% of limit used. Close to breach!`;
      case RiskWarningLevel.WARNING:
        return `⚠️ Drawdown warning: ${usage}% of limit used. Reduce exposure.`;
      case RiskWarningLevel.CAUTION:
        return `Drawdown caution: ${usage}% of limit used. Monitor positions.`;
      default:
        return `Drawdown: ${usage}% of limit used.`;
    }
  }

  /**
   * Get warning state key for deduplication
   */
  private getWarningStateKey(accountId: string, ruleType: RuleType): string {
    return `${accountId}:${ruleType}`;
  }

  /**
   * Clear warning state for an account
   * 
   * Called when account status changes (breached, passed, reset).
   * 
   * @param accountId Account ID
   */
  clearWarningState(accountId: string): void {
    // Remove all warning states for this account
    const keysToDelete: string[] = [];
    
    for (const key of this.warningStates.keys()) {
      if (key.startsWith(accountId + ':')) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.warningStates.delete(key);
    }

    this.logger.debug(`Cleared warning states for account ${accountId}`);
  }

  /**
   * Get current warning level for account+rule
   * 
   * @param accountId Account ID
   * @param ruleType Rule type
   * @returns Current warning level or SAFE if no warnings
   */
  getCurrentWarningLevel(
    accountId: string,
    ruleType: RuleType,
  ): RiskWarningLevel {
    const key = this.getWarningStateKey(accountId, ruleType);
    return this.warningStates.get(key) || RiskWarningLevel.SAFE;
  }
}
