import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradeSide, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * Symbol Exposure
 */
export interface SymbolExposure {
  symbol: string;
  netVolume: Decimal;        // Net position (buy - sell)
  grossVolume: Decimal;      // Total volume (buy + sell)
  buyVolume: Decimal;
  sellVolume: Decimal;
  netExposure: Decimal;      // Net notional value
  grossExposure: Decimal;    // Total notional value
  openPositions: number;
}

/**
 * Account Exposure Summary
 */
export interface AccountExposure {
  accountId: string;
  accountNumber: string;
  symbols: Map<string, SymbolExposure>;
  totalGrossExposure: Decimal;
  totalNetExposure: Decimal;
  totalOpenPositions: number;
  timestamp: Date;
}

/**
 * Exposure Book Summary
 */
export interface ExposureBookSummary {
  exposureBookId: string;
  accounts: string[];
  symbols: Map<string, SymbolExposure>;
  totalGrossExposure: Decimal;
  totalNetExposure: Decimal;
  totalOpenPositions: number;
  timestamp: Date;
}

/**
 * Projected Exposure (after order)
 */
export interface ProjectedExposure {
  symbol: string;
  currentNetVolume: Decimal;
  projectedNetVolume: Decimal;
  currentGrossVolume: Decimal;
  projectedGrossVolume: Decimal;
  currentNetExposure: Decimal;
  projectedNetExposure: Decimal;
  exceedsLimit: boolean;
  exposureLimit?: Decimal;
}

/**
 * Day 21: Aggregate Exposure Service
 * 
 * Implements symbol-level and account-level exposure calculation.
 * 
 * EXPOSURE TYPES:
 * - Net Exposure: BUY volume - SELL volume (directional risk)
 * - Gross Exposure: BUY volume + SELL volume (total market exposure)
 * 
 * AGGREGATION LEVELS:
 * - Account: Single trading account
 * - Book: Multiple accounts in same exposure group
 * 
 * PRE-TRADE INTEGRATION:
 * - Calculate projected exposure after order
 * - Check against configured limits
 * - Reject order if limit exceeded
 * 
 * BACKEND AUTHORITY:
 * - Uses open trades only (authoritative)
 * - Never trusts frontend positions
 * - Real-time calculation on demand
 * 
 * Day 21 Implementation - Trading Risk Engine
 */
@Injectable()
export class AggregateExposureService {
  private readonly logger = new Logger(AggregateExposureService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate account exposure
   * 
   * Calculates symbol-level exposure for single trading account.
   * 
   * @param accountId Trading account ID
   * @returns Account exposure summary
   */
  async calculateAccountExposure(accountId: string): Promise<AccountExposure> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountNumber: true,
        trades: {
          where: { status: TradeStatus.OPEN },
          select: {
            symbol: true,
            side: true,
            volume: true,
            entryPrice: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error(`Trading account ${accountId} not found`);
    }

    // Group positions by symbol
    const symbolExposures = new Map<string, SymbolExposure>();

    for (const trade of account.trades) {
      const symbol = trade.symbol;
      
      if (!symbolExposures.has(symbol)) {
        symbolExposures.set(symbol, {
          symbol,
          netVolume: new Decimal(0),
          grossVolume: new Decimal(0),
          buyVolume: new Decimal(0),
          sellVolume: new Decimal(0),
          netExposure: new Decimal(0),
          grossExposure: new Decimal(0),
          openPositions: 0,
        });
      }

      const exposure = symbolExposures.get(symbol)!;
      const volume = new Decimal(trade.volume);
      const notional = volume.mul(trade.entryPrice);

      // Update volumes
      if (trade.side === TradeSide.BUY) {
        exposure.buyVolume = FinancialCalculations.add(exposure.buyVolume, volume);
        exposure.netVolume = FinancialCalculations.add(exposure.netVolume, volume);
      } else {
        exposure.sellVolume = FinancialCalculations.add(exposure.sellVolume, volume);
        exposure.netVolume = FinancialCalculations.subtract(exposure.netVolume, volume);
      }

      exposure.grossVolume = FinancialCalculations.add(
        exposure.buyVolume,
        exposure.sellVolume,
      );

      // Update exposures (notional values)
      if (trade.side === TradeSide.BUY) {
        exposure.netExposure = FinancialCalculations.add(exposure.netExposure, notional);
      } else {
        exposure.netExposure = FinancialCalculations.subtract(exposure.netExposure, notional);
      }

      exposure.grossExposure = FinancialCalculations.add(exposure.grossExposure, notional);
      exposure.openPositions++;
    }

    // Calculate totals
    let totalGrossExposure = new Decimal(0);
    let totalNetExposure = new Decimal(0);
    let totalOpenPositions = 0;

    for (const exposure of symbolExposures.values()) {
      totalGrossExposure = FinancialCalculations.add(totalGrossExposure, exposure.grossExposure);
      totalNetExposure = FinancialCalculations.add(totalNetExposure, exposure.netExposure.abs());
      totalOpenPositions += exposure.openPositions;
    }

    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      symbols: symbolExposures,
      totalGrossExposure,
      totalNetExposure,
      totalOpenPositions,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate exposure book summary
   * 
   * Aggregates exposure across multiple accounts in same book.
   * 
   * NOTE: Exposure book grouping should be configured in account metadata.
   * Currently not implemented - returns single account exposure.
   * 
   * @param exposureBookId Exposure book ID
   * @returns Exposure book summary
   */
  async calculateExposureBookSummary(
    exposureBookId: string,
  ): Promise<ExposureBookSummary> {
    // Get accounts in exposure book
    // NOTE: This requires exposure book configuration in TradingAccount model
    // For now, treat as single-account book
    
    this.logger.warn(
      `Exposure book aggregation not fully implemented. ` +
      `Book ID ${exposureBookId} treated as single account.`,
    );

    const accountExposure = await this.calculateAccountExposure(exposureBookId);

    return {
      exposureBookId,
      accounts: [accountExposure.accountId],
      symbols: accountExposure.symbols,
      totalGrossExposure: accountExposure.totalGrossExposure,
      totalNetExposure: accountExposure.totalNetExposure,
      totalOpenPositions: accountExposure.totalOpenPositions,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate projected exposure after order
   * 
   * Simulates exposure after proposed order execution.
   * Used in pre-trade risk validation.
   * 
   * @param accountId Trading account ID
   * @param symbol Symbol
   * @param side Order side
   * @param volume Order volume
   * @param price Order price
   * @returns Projected exposure
   */
  async calculateProjectedExposure(
    accountId: string,
    symbol: string,
    side: TradeSide,
    volume: Decimal,
    price: Decimal,
  ): Promise<ProjectedExposure> {
    // Get current exposure
    const accountExposure = await this.calculateAccountExposure(accountId);
    const currentExposure = accountExposure.symbols.get(symbol);

    const currentNetVolume = currentExposure?.netVolume || new Decimal(0);
    const currentGrossVolume = currentExposure?.grossVolume || new Decimal(0);
    const currentNetExposure = currentExposure?.netExposure || new Decimal(0);

    // Project new exposure
    const orderNotional = volume.mul(price);
    
    let projectedNetVolume: Decimal;
    let projectedNetExposure: Decimal;

    if (side === TradeSide.BUY) {
      projectedNetVolume = FinancialCalculations.add(currentNetVolume, volume);
      projectedNetExposure = FinancialCalculations.add(currentNetExposure, orderNotional);
    } else {
      projectedNetVolume = FinancialCalculations.subtract(currentNetVolume, volume);
      projectedNetExposure = FinancialCalculations.subtract(currentNetExposure, orderNotional);
    }

    const projectedGrossVolume = FinancialCalculations.add(currentGrossVolume, volume);

    // Check against limit (if configured)
    // NOTE: Exposure limits should be configured in rule snapshot
    // For now, no limit check
    const exposureLimit = await this.getExposureLimitForSymbol(accountId, symbol);
    const exceedsLimit = exposureLimit 
      ? projectedNetExposure.abs().greaterThan(exposureLimit)
      : false;

    return {
      symbol,
      currentNetVolume,
      projectedNetVolume,
      currentGrossVolume,
      projectedGrossVolume,
      currentNetExposure,
      projectedNetExposure,
      exceedsLimit,
      exposureLimit,
    };
  }

  /**
   * Get exposure limit for symbol
   * 
   * Looks for symbol-specific or global exposure limit in rule snapshot.
   * Returns null if no limit configured.
   * 
   * @param accountId Trading account ID
   * @param symbol Symbol
   * @returns Exposure limit or null
   */
  private async getExposureLimitForSymbol(
    accountId: string,
    symbol: string,
  ): Promise<Decimal | null> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: { ruleSnapshot: true },
    });

    if (!account?.ruleSnapshot) {
      return null;
    }

    const rules = account.ruleSnapshot.rules as any;
    
    if (!rules || !Array.isArray(rules)) {
      return null;
    }

    // Look for exposure limit rule
    const exposureRule = rules.find(
      (rule: any) => rule.ruleType === 'MAX_EXPOSURE' && rule.isActive,
    );

    if (!exposureRule) {
      return null;
    }

    // Symbol-specific limit (if configured)
    if (exposureRule.symbolLimits && exposureRule.symbolLimits[symbol]) {
      return new Decimal(exposureRule.symbolLimits[symbol]);
    }

    // Global limit
    if (exposureRule.maxExposure !== undefined) {
      return new Decimal(exposureRule.maxExposure);
    }

    return null;
  }

  /**
   * Create exposure snapshot
   * 
   * Persists current exposure state for historical tracking.
   * 
   * @param accountId Trading account ID
   * @returns Created snapshot count
   */
  async createExposureSnapshot(accountId: string): Promise<number> {
    const exposure = await this.calculateAccountExposure(accountId);
    let count = 0;

    for (const symbolExposure of exposure.symbols.values()) {
      await this.prisma.exposureSnapshot.create({
        data: {
          tradingAccountId: accountId,
          symbol: symbolExposure.symbol,
          netVolume: symbolExposure.netVolume,
          grossVolume: symbolExposure.grossVolume,
          buyVolume: symbolExposure.buyVolume,
          sellVolume: symbolExposure.sellVolume,
          netExposure: symbolExposure.netExposure,
          grossExposure: symbolExposure.grossExposure,
          openPositions: symbolExposure.openPositions,
        },
      });
      count++;
    }

    this.logger.debug(
      `Created ${count} exposure snapshots for account ${exposure.accountNumber}`,
    );

    return count;
  }

  /**
   * Get exposure history
   * 
   * @param accountId Trading account ID
   * @param symbol Symbol (optional)
   * @param limit Number of results
   * @returns List of exposure snapshots
   */
  async getExposureHistory(
    accountId: string,
    symbol?: string,
    limit: number = 100,
  ) {
    const where: any = { tradingAccountId: accountId };
    
    if (symbol) {
      where.symbol = symbol;
    }

    return this.prisma.exposureSnapshot.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }
}
