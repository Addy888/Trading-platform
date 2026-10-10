import Decimal from 'decimal.js';
import { TradeSide } from '@prisma/client';

/**
 * Financial Calculations Utility
 * 
 * Centralized, tested, precise decimal calculations for all financial operations.
 * 
 * CRITICAL RULES:
 * 1. NEVER use JavaScript Number for money calculations
 * 2. NEVER use +, -, *, / operators on floating-point money
 * 3. ALWAYS use Decimal.js for precision
 * 4. ALWAYS document rounding rules
 * 5. ALWAYS validate inputs
 * 
 * Precision Policy:
 * - Prices: 8 decimal places (supports crypto)
 * - Volumes: 4 decimal places
 * - Money (Balance, P&L, Equity): 2 decimal places
 * - Percentages: 4 decimal places
 * 
 * Rounding Policy:
 * - All money values: ROUND_HALF_UP (banker's rounding)
 * - Display: Always use toFixed() for consistent formatting
 */

// Configure Decimal.js globally for financial calculations
Decimal.set({
  precision: 20, // Internal precision
  rounding: Decimal.ROUND_HALF_UP, // 0.5 rounds up
  toExpNeg: -9, // Avoid exponential notation for small numbers
  toExpPos: 9, // Avoid exponential notation for large numbers
});

export class FinancialCalculations {
  /**
   * Add two decimal values
   */
  static add(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    return new Decimal(a).plus(new Decimal(b));
  }

  /**
   * Subtract two decimal values
   */
  static subtract(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    return new Decimal(a).minus(new Decimal(b));
  }

  /**
   * Multiply two decimal values
   */
  static multiply(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    return new Decimal(a).times(new Decimal(b));
  }

  /**
   * Divide two decimal values
   */
  static divide(a: Decimal | string | number, b: Decimal | string | number): Decimal {
    const divisor = new Decimal(b);
    
    if (divisor.isZero()) {
      throw new Error('Division by zero');
    }
    
    return new Decimal(a).dividedBy(divisor);
  }

  /**
   * Calculate percentage
   * Example: percentage(50, 100) = 50 (50%)
   */
  static percentage(value: Decimal | string | number, total: Decimal | string | number): Decimal {
    const totalDecimal = new Decimal(total);
    
    if (totalDecimal.isZero()) {
      return new Decimal(0);
    }
    
    return new Decimal(value).dividedBy(totalDecimal).times(100);
  }

  /**
   * Calculate percentage of a value
   * Example: percentageOf(10, 100) = 10 (10% of 100)
   */
  static percentageOf(percent: Decimal | string | number, value: Decimal | string | number): Decimal {
    return new Decimal(value).times(new Decimal(percent)).dividedBy(100);
  }

  /**
   * Safe comparison: greater than
   */
  static greaterThan(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return new Decimal(a).greaterThan(new Decimal(b));
  }

  /**
   * Safe comparison: greater than or equal
   */
  static greaterThanOrEqual(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return new Decimal(a).greaterThanOrEqualTo(new Decimal(b));
  }

  /**
   * Safe comparison: less than
   */
  static lessThan(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return new Decimal(a).lessThan(new Decimal(b));
  }

  /**
   * Safe comparison: less than or equal
   */
  static lessThanOrEqual(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return new Decimal(a).lessThanOrEqualTo(new Decimal(b));
  }

  /**
   * Safe comparison: equals
   */
  static equals(a: Decimal | string | number, b: Decimal | string | number): boolean {
    return new Decimal(a).equals(new Decimal(b));
  }

  /**
   * Get maximum value
   */
  static max(...values: Array<Decimal | string | number>): Decimal {
    if (values.length === 0) {
      throw new Error('Cannot get max of empty array');
    }
    
    return values.reduce((max: Decimal, val) => 
      Decimal.max(max, new Decimal(val)), 
      new Decimal(values[0])
    );
  }

  /**
   * Get minimum value
   */
  static min(...values: Array<Decimal | string | number>): Decimal {
    if (values.length === 0) {
      throw new Error('Cannot get min of empty array');
    }
    
    return values.reduce((min: Decimal, val) => 
      Decimal.min(min, new Decimal(val)), 
      new Decimal(values[0])
    );
  }

  /**
   * Round to money precision (2 decimal places)
   */
  static roundMoney(value: Decimal | string | number): Decimal {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Round to price precision (8 decimal places)
   */
  static roundPrice(value: Decimal | string | number): Decimal {
    return new Decimal(value).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  }

  /**
   * Round to volume precision (4 decimal places)
   */
  static roundVolume(value: Decimal | string | number): Decimal {
    return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  /**
   * Round to percentage precision (4 decimal places)
   */
  static roundPercentage(value: Decimal | string | number): Decimal {
    return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  /**
   * Format money for display (always 2 decimals)
   */
  static formatMoney(value: Decimal | string | number): string {
    return new Decimal(value).toFixed(2);
  }

  /**
   * Format price for display (8 decimals, trim trailing zeros)
   */
  static formatPrice(value: Decimal | string | number): string {
    return new Decimal(value).toFixed(8);
  }

  /**
   * Format percentage for display
   */
  static formatPercentage(value: Decimal | string | number): string {
    return new Decimal(value).toFixed(2);
  }

  /**
   * Check if value is zero (within precision tolerance)
   */
  static isZero(value: Decimal | string | number): boolean {
    return new Decimal(value).isZero();
  }

  /**
   * Check if value is positive
   */
  static isPositive(value: Decimal | string | number): boolean {
    return new Decimal(value).greaterThan(0);
  }

  /**
   * Check if value is negative
   */
  static isNegative(value: Decimal | string | number): boolean {
    return new Decimal(value).lessThan(0);
  }

  /**
   * Get absolute value
   */
  static abs(value: Decimal | string | number): Decimal {
    return new Decimal(value).abs();
  }

  /**
   * Negate value
   */
  static negate(value: Decimal | string | number): Decimal {
    return new Decimal(value).negated();
  }

  /**
   * Calculate unrealized P&L for a position
   * 
   * @param side - BUY or SELL
   * @param entryPrice - Entry price
   * @param currentPrice - Current market price
   * @param volume - Position volume
   * @param contractMultiplier - Contract size multiplier
   * @returns Unrealized P&L
   */
  static calculateUnrealizedPnl(
    side: TradeSide,
    entryPrice: Decimal,
    currentPrice: Decimal,
    volume: Decimal,
    contractMultiplier: number = 1,
  ): Decimal {
    let pnl: Decimal;

    if (side === TradeSide.BUY) {
      // LONG: P&L = (CurrentPrice - EntryPrice) * Volume * Multiplier
      pnl = currentPrice
        .minus(entryPrice)
        .times(volume)
        .times(contractMultiplier);
    } else {
      // SHORT: P&L = (EntryPrice - CurrentPrice) * Volume * Multiplier
      pnl = entryPrice
        .minus(currentPrice)
        .times(volume)
        .times(contractMultiplier);
    }

    return this.roundMoney(pnl);
  }

  /**
   * Calculate realized P&L on position close
   * 
   * @param side - BUY or SELL
   * @param entryPrice - Entry price
   * @param exitPrice - Exit price
   * @param volume - Position volume
   * @param contractMultiplier - Contract size multiplier
   * @returns Realized P&L
   */
  static calculateRealizedPnl(
    side: TradeSide,
    entryPrice: Decimal,
    exitPrice: Decimal,
    volume: Decimal,
    contractMultiplier: number = 1,
  ): Decimal {
    // Same calculation as unrealized, but using exit price
    return this.calculateUnrealizedPnl(side, entryPrice, exitPrice, volume, contractMultiplier);
  }

  /**
   * Calculate account equity
   * Equity = Balance + Total Unrealized P&L
   */
  static calculateEquity(balance: Decimal, unrealizedPnl: Decimal): Decimal {
    return this.roundMoney(balance.plus(unrealizedPnl));
  }

  /**
   * Calculate drawdown from high water mark
   * Drawdown% = (HWM - CurrentEquity) / HWM * 100
   */
  static calculateDrawdownFromHWM(highWaterMark: Decimal, currentEquity: Decimal): Decimal {
    if (highWaterMark.isZero() || highWaterMark.lessThanOrEqualTo(0)) {
      return new Decimal(0);
    }

    const drawdown = highWaterMark
      .minus(currentEquity)
      .dividedBy(highWaterMark)
      .times(100);

    return this.roundPercentage(Decimal.max(drawdown, 0)); // Drawdown cannot be negative
  }

  /**
   * Calculate daily P&L
   * Daily P&L = Current Equity - Daily Start Equity
   */
  static calculateDailyPnl(currentEquity: Decimal, dailyStartEquity: Decimal): Decimal {
    return this.roundMoney(currentEquity.minus(dailyStartEquity));
  }

  /**
   * Calculate daily P&L percentage
   */
  static calculateDailyPnlPercentage(currentEquity: Decimal, dailyStartEquity: Decimal): Decimal {
    if (dailyStartEquity.isZero()) {
      return new Decimal(0);
    }

    return this.roundPercentage(
      currentEquity
        .minus(dailyStartEquity)
        .dividedBy(dailyStartEquity)
        .times(100)
    );
  }

  /**
   * Validate decimal value
   */
  static isValid(value: any): boolean {
    try {
      const decimal = new Decimal(value);
      return decimal.isFinite();
    } catch {
      return false;
    }
  }

  /**
   * Safe conversion from Decimal to string for API serialization
   */
  static toApiString(value: Decimal | string | number): string {
    return new Decimal(value).toString();
  }

  /**
   * Safe conversion from string/number to Decimal
   */
  static toDecimal(value: string | number | Decimal): Decimal {
    return new Decimal(value);
  }
}
