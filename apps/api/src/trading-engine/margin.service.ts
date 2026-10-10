import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * Account Margin Information
 * 
 * Day 10 - Enhanced with precise calculations
 */
export interface AccountMargin {
  accountId: string;
  accountNumber: string;
  
  // Financial State
  balance: Decimal;
  equity: Decimal;
  unrealizedPnl: Decimal;
  
  // Margin Calculations
  usedMargin: Decimal;
  freeMargin: Decimal;
  marginLevel: Decimal; // Equity / Used Margin × 100 (null if zero used margin)
  
  // Position Information
  openPositions: number;
  totalExposure: Decimal; // Sum of notional values
  
  // Timestamp
  calculatedAt: Date;
}

/**
 * Position Margin Details
 */
export interface PositionMarginDetail {
  tradeId: string;
  symbol: string;
  side: string;
  volume: Decimal;
  entryPrice: Decimal;
  currentPrice: Decimal;
  leverage: number;
  notionalValue: Decimal;
  requiredMargin: Decimal;
  unrealizedPnl: Decimal;
}

/**
 * Margin Calculation Result
 */
export interface MarginCalculationResult {
  requiredMargin: Decimal;
  notionalValue: Decimal;
  leverage: number;
  effectiveLeverage: number;
  contractMultiplier: number;
}

/**
 * Margin Service
 * 
 * Day 10 - Margin + Leverage + Free Margin Engine
 * 
 * RESPONSIBILITIES:
 * 1. Calculate required margin for new positions
 * 2. Calculate used margin from open positions
 * 3. Calculate free margin and margin level
 * 4. Validate margin sufficiency
 * 5. Enforce leverage limits
 * 6. Handle zero used margin cases
 * 7. Provide detailed margin breakdowns
 * 
 * FORMULAS:
 * - Notional Value = Volume × Price × Contract Multiplier
 * - Required Margin = Notional Value / Leverage
 * - Used Margin = Sum(margin for all open positions)
 * - Free Margin = Equity - Used Margin
 * - Margin Level (%) = (Equity / Used Margin) × 100
 * 
 * PRECISION:
 * - All calculations use Decimal.js
 * - Rounding applied only at output boundary
 * - Backend-authoritative prices
 * - No client-supplied leverage accepted
 */
@Injectable()
export class MarginService {
  private readonly logger = new Logger(MarginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instrumentConfig: InstrumentConfigService,
    private readonly marketData: MarketDataEngineService,
  ) {}

  /**
   * Calculate required margin for a new position
   * 
   * Day 10 - Enhanced with detailed calculation result
   * 
   * Formula:
   *   Notional Value = Volume × Price × Contract Multiplier
   *   Required Margin = Notional Value / Effective Leverage
   * 
   * @param symbol Trading symbol
   * @param volume Position volume in lots
   * @param price Entry/current price
   * @param requestedLeverage Optional leverage (validated against limits)
   * @returns Detailed margin calculation result
   */
  calculateRequiredMargin(
    symbol: string,
    volume: Decimal,
    price: Decimal,
    requestedLeverage?: number,
  ): MarginCalculationResult {
    const instrument = this.instrumentConfig.getInstrument(symbol);
    
    if (!instrument) {
      throw new Error(`Invalid symbol: ${symbol}`);
    }

    // Determine effective leverage (enforce limits)
    const effectiveLeverage = this.determineEffectiveLeverage(
      symbol,
      requestedLeverage,
    );

    // Calculate notional value
    const notionalValue = FinancialCalculations.multiply(
      FinancialCalculations.multiply(volume, price),
      instrument.contractMultiplier,
    );

    // Calculate required margin
    const requiredMargin = FinancialCalculations.roundMoney(
      FinancialCalculations.divide(notionalValue, effectiveLeverage),
    );

    return {
      requiredMargin,
      notionalValue,
      leverage: requestedLeverage || instrument.defaultLeverage,
      effectiveLeverage,
      contractMultiplier: instrument.contractMultiplier,
    };
  }

  /**
   * Determine effective leverage with limit enforcement
   * 
   * Applies the strictest of:
   * - Instrument max leverage
   * - Requested leverage (if provided)
   * - Instrument default leverage (fallback)
   */
  private determineEffectiveLeverage(
    symbol: string,
    requestedLeverage?: number,
  ): number {
    const instrument = this.instrumentConfig.getInstrument(symbol);
    
    if (!instrument) {
      throw new Error(`Invalid symbol: ${symbol}`);
    }

    // Start with default
    let effectiveLeverage = instrument.defaultLeverage;

    // If requested, validate and cap at instrument max
    if (requestedLeverage !== undefined) {
      if (requestedLeverage < 1) {
        throw new Error('Leverage must be at least 1');
      }

      if (requestedLeverage > instrument.maxLeverage) {
        this.logger.warn(
          `Requested leverage ${requestedLeverage} exceeds max ${instrument.maxLeverage} for ${symbol}, capping`,
        );
        effectiveLeverage = instrument.maxLeverage;
      } else {
        effectiveLeverage = requestedLeverage;
      }
    }

    return effectiveLeverage;
  }

  /**
   * Calculate comprehensive account margin information
   * 
   * Day 10 - Enhanced with detailed breakdown and zero handling
   * 
   * @param accountId Trading account ID
   * @returns Complete margin information
   */
  async calculateAccountMargin(accountId: string): Promise<AccountMargin> {
    // Get account with open trades
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        trades: {
          where: { status: TradeStatus.OPEN },
        },
      },
    });

    if (!account) {
      throw new Error('Trading account not found');
    }

    // Calculate used margin and unrealized P&L from open positions
    let usedMargin = new Decimal(0);
    let unrealizedPnl = new Decimal(0);
    let totalExposure = new Decimal(0);

    for (const trade of account.trades) {
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      if (!instrument) {
        this.logger.warn(`Unknown instrument: ${trade.symbol}, skipping in margin calculation`);
        continue;
      }

      // Get current price for mark-to-market
      const currentPrice = this.marketData.getMidPrice(trade.symbol);
      if (!currentPrice) {
        this.logger.warn(`No price available for: ${trade.symbol}, using entry price`);
        // Fallback to entry price if market data unavailable
        const marginCalc = this.calculateRequiredMargin(
          trade.symbol,
          trade.volume,
          trade.entryPrice,
          instrument.defaultLeverage,
        );
        usedMargin = usedMargin.plus(marginCalc.requiredMargin);
        totalExposure = totalExposure.plus(marginCalc.notionalValue);
        continue;
      }

      // Calculate margin for this position at current price
      const marginCalc = this.calculateRequiredMargin(
        trade.symbol,
        trade.volume,
        currentPrice,
        instrument.defaultLeverage,
      );

      usedMargin = usedMargin.plus(marginCalc.requiredMargin);
      totalExposure = totalExposure.plus(marginCalc.notionalValue);

      // Calculate unrealized P&L
      const pnl = this.calculateUnrealizedPnl(trade, currentPrice, instrument);
      unrealizedPnl = unrealizedPnl.plus(pnl);
    }

    // Round used margin
    usedMargin = FinancialCalculations.roundMoney(usedMargin);

    // Calculate equity
    const balance = new Decimal(account.currentBalance);
    const equity = FinancialCalculations.calculateEquity(balance, unrealizedPnl);

    // Calculate free margin
    const freeMargin = FinancialCalculations.roundMoney(
      FinancialCalculations.subtract(equity, usedMargin),
    );

    // Calculate margin level (handle zero used margin)
    let marginLevel: Decimal;
    if (FinancialCalculations.isZero(usedMargin)) {
      // No open positions = infinite margin level (represent as 0 for safety)
      marginLevel = new Decimal(0);
    } else {
      marginLevel = FinancialCalculations.roundPercentage(
        FinancialCalculations.multiply(
          FinancialCalculations.divide(equity, usedMargin),
          100,
        ),
      );
    }

    return {
      accountId,
      accountNumber: account.accountNumber,
      balance,
      equity,
      unrealizedPnl,
      usedMargin,
      freeMargin,
      marginLevel,
      openPositions: account.trades.length,
      totalExposure: FinancialCalculations.roundMoney(totalExposure),
      calculatedAt: new Date(),
    };
  }

  /**
   * Get detailed margin breakdown by position
   * 
   * Day 10 - New method for detailed analysis
   */
  async getPositionMarginDetails(accountId: string): Promise<PositionMarginDetail[]> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        trades: {
          where: { status: TradeStatus.OPEN },
        },
      },
    });

    if (!account) {
      throw new Error('Trading account not found');
    }

    const details: PositionMarginDetail[] = [];

    for (const trade of account.trades) {
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      if (!instrument) {
        continue;
      }

      const currentPrice = this.marketData.getMidPrice(trade.symbol) || trade.entryPrice;
      
      const marginCalc = this.calculateRequiredMargin(
        trade.symbol,
        trade.volume,
        currentPrice,
        instrument.defaultLeverage,
      );

      const unrealizedPnl = this.calculateUnrealizedPnl(trade, currentPrice, instrument);

      details.push({
        tradeId: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        volume: trade.volume,
        entryPrice: trade.entryPrice,
        currentPrice,
        leverage: instrument.defaultLeverage,
        notionalValue: marginCalc.notionalValue,
        requiredMargin: marginCalc.requiredMargin,
        unrealizedPnl,
      });
    }

    return details;
  }

  /**
   * Calculate unrealized P&L for a trade
   * 
   * Day 10 - Uses FinancialCalculations utility
   */
  private calculateUnrealizedPnl(
    trade: any,
    currentPrice: Decimal,
    instrument: any,
  ): Decimal {
    return FinancialCalculations.calculateUnrealizedPnl(
      trade.side,
      trade.entryPrice,
      currentPrice,
      trade.volume,
      instrument.contractMultiplier,
    );
  }

  /**
   * Check if account has sufficient margin
   * 
   * Day 10 - Enhanced with detailed result
   */
  async hasSufficientMargin(
    accountId: string,
    requiredMargin: Decimal,
  ): Promise<{ sufficient: boolean; freeMargin: Decimal; marginLevel: Decimal }> {
    const marginInfo = await this.calculateAccountMargin(accountId);

    return {
      sufficient: FinancialCalculations.greaterThanOrEqual(
        marginInfo.freeMargin,
        requiredMargin,
      ),
      freeMargin: marginInfo.freeMargin,
      marginLevel: marginInfo.marginLevel,
    };
  }

  /**
   * Validate margin before opening position
   * 
   * Day 10 - Enhanced validation with leverage enforcement
   */
  async validateMarginForNewPosition(
    accountId: string,
    symbol: string,
    volume: Decimal,
    price: Decimal,
    requestedLeverage?: number,
  ): Promise<{
    valid: boolean;
    error?: string;
    requiredMargin?: string;
    freeMargin?: string;
    marginLevel?: string;
    effectiveLeverage?: number;
  }> {
    try {
      // Calculate required margin with leverage validation
      const marginCalc = this.calculateRequiredMargin(
        symbol,
        volume,
        price,
        requestedLeverage,
      );

      // Check if sufficient
      const { sufficient, freeMargin, marginLevel } = await this.hasSufficientMargin(
        accountId,
        marginCalc.requiredMargin,
      );

      if (!sufficient) {
        return {
          valid: false,
          error: 'INSUFFICIENT_MARGIN',
          requiredMargin: FinancialCalculations.formatMoney(marginCalc.requiredMargin),
          freeMargin: FinancialCalculations.formatMoney(freeMargin),
          marginLevel: FinancialCalculations.formatPercentage(marginLevel),
          effectiveLeverage: marginCalc.effectiveLeverage,
        };
      }

      return {
        valid: true,
        requiredMargin: FinancialCalculations.formatMoney(marginCalc.requiredMargin),
        freeMargin: FinancialCalculations.formatMoney(freeMargin),
        marginLevel: FinancialCalculations.formatPercentage(marginLevel),
        effectiveLeverage: marginCalc.effectiveLeverage,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate projected margin state after opening a new position
   * 
   * Day 10 - New method for pre-trade projection
   */
  async calculateProjectedMargin(
    accountId: string,
    newPositionMargin: Decimal,
  ): Promise<{
    currentUsedMargin: Decimal;
    projectedUsedMargin: Decimal;
    currentFreeMargin: Decimal;
    projectedFreeMargin: Decimal;
    currentMarginLevel: Decimal;
    projectedMarginLevel: Decimal;
  }> {
    const current = await this.calculateAccountMargin(accountId);

    const projectedUsedMargin = FinancialCalculations.add(
      current.usedMargin,
      newPositionMargin,
    );

    const projectedFreeMargin = FinancialCalculations.subtract(
      current.equity,
      projectedUsedMargin,
    );

    let projectedMarginLevel: Decimal;
    if (FinancialCalculations.isZero(projectedUsedMargin)) {
      projectedMarginLevel = new Decimal(0);
    } else {
      projectedMarginLevel = FinancialCalculations.roundPercentage(
        FinancialCalculations.multiply(
          FinancialCalculations.divide(current.equity, projectedUsedMargin),
          100,
        ),
      );
    }

    return {
      currentUsedMargin: current.usedMargin,
      projectedUsedMargin: FinancialCalculations.roundMoney(projectedUsedMargin),
      currentFreeMargin: current.freeMargin,
      projectedFreeMargin: FinancialCalculations.roundMoney(projectedFreeMargin),
      currentMarginLevel: current.marginLevel,
      projectedMarginLevel,
    };
  }
}
