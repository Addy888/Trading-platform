import { FinancialCalculations } from './financial-calculations.util';
import Decimal from 'decimal.js';
import { TradeSide } from '@prisma/client';

describe('FinancialCalculations - Day 3 Decimal Precision Tests', () => {
  describe('Basic Arithmetic Operations', () => {
    it('should add two decimals precisely', () => {
      const result = FinancialCalculations.add('0.1', '0.2');
      expect(result.toString()).toBe('0.3'); // Not 0.30000000000000004
    });

    it('should subtract decimals precisely', () => {
      const result = FinancialCalculations.subtract('1.0', '0.9');
      expect(result.toString()).toBe('0.1'); // Not 0.09999999999999998
    });

    it('should multiply decimals precisely', () => {
      const result = FinancialCalculations.multiply('0.1', '0.2');
      expect(result.toString()).toBe('0.02'); // Not 0.020000000000000004
    });

    it('should divide decimals precisely', () => {
      const result = FinancialCalculations.divide('1', '3');
      expect(result.toString()).toBe('0.33333333333333333333'); // Internal precision
    });

    it('should handle large numbers precisely', () => {
      const result = FinancialCalculations.add('999999999.99', '0.01');
      expect(result.toString()).toBe('1000000000');
    });

    it('should handle small numbers precisely', () => {
      const result = FinancialCalculations.add('0.00000001', '0.00000002');
      expect(result.toString()).toBe('0.00000003');
    });
  });

  describe('Comparison Operations', () => {
    it('should compare decimals precisely', () => {
      expect(FinancialCalculations.greaterThan('0.3', '0.2')).toBe(true);
      expect(FinancialCalculations.greaterThan('0.1', '0.2')).toBe(false);
    });

    it('should handle floating-point comparison edge cases', () => {
      // JavaScript: 0.1 + 0.2 !== 0.3 (false)
      // Decimal:   0.1 + 0.2 === 0.3 (true)
      const sum = FinancialCalculations.add('0.1', '0.2');
      expect(FinancialCalculations.equals(sum, '0.3')).toBe(true);
    });

    it('should compare negative values correctly', () => {
      expect(FinancialCalculations.greaterThan('-0.1', '-0.2')).toBe(true);
      expect(FinancialCalculations.lessThan('-0.2', '-0.1')).toBe(true);
    });
  });

  describe('Rounding Operations', () => {
    it('should round money to 2 decimal places', () => {
      const value = new Decimal('123.456789');
      const rounded = FinancialCalculations.roundMoney(value);
      expect(rounded.toString()).toBe('123.46');
      expect(rounded.decimalPlaces()).toBe(2);
    });

    it('should round price to 8 decimal places', () => {
      const value = new Decimal('1.095123456789');
      const rounded = FinancialCalculations.roundPrice(value);
      expect(rounded.toString()).toBe('1.09512346');
      expect(rounded.decimalPlaces()).toBe(8);
    });

    it('should round volume to 4 decimal places', () => {
      const value = new Decimal('1.123456789');
      const rounded = FinancialCalculations.roundVolume(value);
      expect(rounded.toString()).toBe('1.1235');
      expect(rounded.decimalPlaces()).toBe(4);
    });

    it('should round percentage to 4 decimal places', () => {
      const value = new Decimal('12.3456789');
      const rounded = FinancialCalculations.roundPercentage(value);
      expect(rounded.toString()).toBe('12.3457');
    });

    it('should use ROUND_HALF_UP (banker rounding)', () => {
      // 0.5 rounds up
      expect(FinancialCalculations.roundMoney('1.005').toString()).toBe('1.01');
      expect(FinancialCalculations.roundMoney('1.015').toString()).toBe('1.02');
      expect(FinancialCalculations.roundMoney('1.025').toString()).toBe('1.03');
    });
  });

  describe('Formatting Operations', () => {
    it('should format money consistently', () => {
      expect(FinancialCalculations.formatMoney('100')).toBe('100.00');
      expect(FinancialCalculations.formatMoney('100.5')).toBe('100.50');
      expect(FinancialCalculations.formatMoney('100.123')).toBe('100.12');
    });

    it('should format negative money correctly', () => {
      expect(FinancialCalculations.formatMoney('-100')).toBe('-100.00');
      expect(FinancialCalculations.formatMoney('-100.5')).toBe('-100.50');
    });

    it('should format price with 8 decimals', () => {
      expect(FinancialCalculations.formatPrice('1.095')).toBe('1.09500000');
      expect(FinancialCalculations.formatPrice('1.09512345')).toBe('1.09512345');
    });
  });

  describe('Percentage Calculations', () => {
    it('should calculate percentage correctly', () => {
      const result = FinancialCalculations.percentage('50', '100');
      expect(result.toString()).toBe('50');
    });

    it('should calculate percentage of a value correctly', () => {
      const result = FinancialCalculations.percentageOf('10', '100');
      expect(result.toString()).toBe('10');
    });

    it('should handle zero total in percentage calculation', () => {
      const result = FinancialCalculations.percentage('50', '0');
      expect(result.toString()).toBe('0');
    });
  });

  describe('Unrealized P&L Calculations', () => {
    it('should calculate BUY unrealized P&L correctly', () => {
      const pnl = FinancialCalculations.calculateUnrealizedPnl(
        TradeSide.BUY,
        new Decimal('1.09500'),
        new Decimal('1.09750'),
        new Decimal('1.0'),
        100000,
      );

      // (1.09750 - 1.09500) * 1.0 * 100000 = 250.00
      expect(pnl.toString()).toBe('250.00');
    });

    it('should calculate SELL unrealized P&L correctly', () => {
      const pnl = FinancialCalculations.calculateUnrealizedPnl(
        TradeSide.SELL,
        new Decimal('1.09500'),
        new Decimal('1.09250'),
        new Decimal('1.0'),
        100000,
      );

      // (1.09500 - 1.09250) * 1.0 * 100000 = 250.00
      expect(pnl.toString()).toBe('250.00');
    });

    it('should calculate negative BUY unrealized P&L correctly', () => {
      const pnl = FinancialCalculations.calculateUnrealizedPnl(
        TradeSide.BUY,
        new Decimal('1.09500'),
        new Decimal('1.09250'),
        new Decimal('1.0'),
        100000,
      );

      // (1.09250 - 1.09500) * 1.0 * 100000 = -250.00
      expect(pnl.toString()).toBe('-250.00');
    });

    it('should calculate negative SELL unrealized P&L correctly', () => {
      const pnl = FinancialCalculations.calculateUnrealizedPnl(
        TradeSide.SELL,
        new Decimal('1.09500'),
        new Decimal('1.09750'),
        new Decimal('1.0'),
        100000,
      );

      // (1.09500 - 1.09750) * 1.0 * 100000 = -250.00
      expect(pnl.toString()).toBe('-250.00');
    });

    it('should handle fractional volumes in P&L calculation', () => {
      const pnl = FinancialCalculations.calculateUnrealizedPnl(
        TradeSide.BUY,
        new Decimal('1.09500'),
        new Decimal('1.09750'),
        new Decimal('0.5'),
        100000,
      );

      // (1.09750 - 1.09500) * 0.5 * 100000 = 125.00
      expect(pnl.toString()).toBe('125.00');
    });

    it('should handle different contract multipliers', () => {
      const pnl = FinancialCalculations.calculateUnrealizedPnl(
        TradeSide.BUY,
        new Decimal('1000'),
        new Decimal('1100'),
        new Decimal('1.0'),
        1, // Contract multiplier = 1 (e.g., crypto)
      );

      // (1100 - 1000) * 1.0 * 1 = 100.00
      expect(pnl.toString()).toBe('100.00');
    });
  });

  describe('Realized P&L Calculations', () => {
    it('should calculate realized P&L same as unrealized', () => {
      const unrealizedPnl = FinancialCalculations.calculateUnrealizedPnl(
        TradeSide.BUY,
        new Decimal('1.09500'),
        new Decimal('1.09750'),
        new Decimal('1.0'),
        100000,
      );

      const realizedPnl = FinancialCalculations.calculateRealizedPnl(
        TradeSide.BUY,
        new Decimal('1.09500'),
        new Decimal('1.09750'),
        new Decimal('1.0'),
        100000,
      );

      expect(realizedPnl.toString()).toBe(unrealizedPnl.toString());
    });
  });

  describe('Equity Calculations', () => {
    it('should calculate equity correctly', () => {
      const balance = new Decimal('100000.00');
      const unrealizedPnl = new Decimal('500.00');
      
      const equity = FinancialCalculations.calculateEquity(balance, unrealizedPnl);
      
      expect(equity.toString()).toBe('100500.00');
    });

    it('should calculate equity with negative unrealized P&L', () => {
      const balance = new Decimal('100000.00');
      const unrealizedPnl = new Decimal('-500.00');
      
      const equity = FinancialCalculations.calculateEquity(balance, unrealizedPnl);
      
      expect(equity.toString()).toBe('99500.00');
    });
  });

  describe('Drawdown Calculations', () => {
    it('should calculate drawdown from HWM correctly', () => {
      const hwm = new Decimal('110000.00');
      const equity = new Decimal('105000.00');
      
      const drawdown = FinancialCalculations.calculateDrawdownFromHWM(hwm, equity);
      
      // (110000 - 105000) / 110000 * 100 = 4.5455%
      expect(drawdown.toString()).toBe('4.5455');
    });

    it('should return 0% drawdown when equity equals HWM', () => {
      const hwm = new Decimal('100000.00');
      const equity = new Decimal('100000.00');
      
      const drawdown = FinancialCalculations.calculateDrawdownFromHWM(hwm, equity);
      
      expect(drawdown.toString()).toBe('0.0000');
    });

    it('should return 0% drawdown when equity exceeds HWM', () => {
      const hwm = new Decimal('100000.00');
      const equity = new Decimal('105000.00');
      
      const drawdown = FinancialCalculations.calculateDrawdownFromHWM(hwm, equity);
      
      expect(drawdown.toString()).toBe('0.0000');
    });

    it('should handle 100% drawdown (equity = 0)', () => {
      const hwm = new Decimal('100000.00');
      const equity = new Decimal('0.00');
      
      const drawdown = FinancialCalculations.calculateDrawdownFromHWM(hwm, equity);
      
      expect(drawdown.toString()).toBe('100.0000');
    });

    it('should handle zero HWM gracefully', () => {
      const hwm = new Decimal('0.00');
      const equity = new Decimal('100.00');
      
      const drawdown = FinancialCalculations.calculateDrawdownFromHWM(hwm, equity);
      
      expect(drawdown.toString()).toBe('0.0000');
    });
  });

  describe('Daily P&L Calculations', () => {
    it('should calculate daily P&L correctly', () => {
      const currentEquity = new Decimal('105000.00');
      const dailyStartEquity = new Decimal('100000.00');
      
      const dailyPnl = FinancialCalculations.calculateDailyPnl(currentEquity, dailyStartEquity);
      
      expect(dailyPnl.toString()).toBe('5000.00');
    });

    it('should calculate negative daily P&L correctly', () => {
      const currentEquity = new Decimal('95000.00');
      const dailyStartEquity = new Decimal('100000.00');
      
      const dailyPnl = FinancialCalculations.calculateDailyPnl(currentEquity, dailyStartEquity);
      
      expect(dailyPnl.toString()).toBe('-5000.00');
    });

    it('should calculate daily P&L percentage correctly', () => {
      const currentEquity = new Decimal('105000.00');
      const dailyStartEquity = new Decimal('100000.00');
      
      const dailyPnlPercentage = FinancialCalculations.calculateDailyPnlPercentage(
        currentEquity,
        dailyStartEquity,
      );
      
      // (105000 - 100000) / 100000 * 100 = 5%
      expect(dailyPnlPercentage.toString()).toBe('5.0000');
    });
  });

  describe('Validation and Safety', () => {
    it('should validate decimal values', () => {
      expect(FinancialCalculations.isValid('123.45')).toBe(true);
      expect(FinancialCalculations.isValid(123.45)).toBe(true);
      expect(FinancialCalculations.isValid(new Decimal('123.45'))).toBe(true);
      expect(FinancialCalculations.isValid('invalid')).toBe(false);
      expect(FinancialCalculations.isValid(NaN)).toBe(false);
      expect(FinancialCalculations.isValid(Infinity)).toBe(false);
    });

    it('should throw error on division by zero', () => {
      expect(() => {
        FinancialCalculations.divide('100', '0');
      }).toThrow('Division by zero');
    });

    it('should check if value is zero', () => {
      expect(FinancialCalculations.isZero('0')).toBe(true);
      expect(FinancialCalculations.isZero('0.00')).toBe(true);
      expect(FinancialCalculations.isZero('0.01')).toBe(false);
    });

    it('should check if value is positive', () => {
      expect(FinancialCalculations.isPositive('1')).toBe(true);
      expect(FinancialCalculations.isPositive('0.01')).toBe(true);
      expect(FinancialCalculations.isPositive('0')).toBe(false);
      expect(FinancialCalculations.isPositive('-1')).toBe(false);
    });

    it('should check if value is negative', () => {
      expect(FinancialCalculations.isNegative('-1')).toBe(true);
      expect(FinancialCalculations.isNegative('-0.01')).toBe(true);
      expect(FinancialCalculations.isNegative('0')).toBe(false);
      expect(FinancialCalculations.isNegative('1')).toBe(false);
    });
  });

  describe('Min/Max Operations', () => {
    it('should find maximum value', () => {
      const max = FinancialCalculations.max('10', '20', '15');
      expect(max.toString()).toBe('20');
    });

    it('should find minimum value', () => {
      const min = FinancialCalculations.min('10', '20', '15');
      expect(min.toString()).toBe('10');
    });

    it('should handle negative values in min/max', () => {
      const max = FinancialCalculations.max('-10', '-20', '-5');
      expect(max.toString()).toBe('-5');
      
      const min = FinancialCalculations.min('-10', '-20', '-5');
      expect(min.toString()).toBe('-20');
    });
  });

  describe('Absolute and Negation', () => {
    it('should calculate absolute value', () => {
      expect(FinancialCalculations.abs('-100').toString()).toBe('100');
      expect(FinancialCalculations.abs('100').toString()).toBe('100');
      expect(FinancialCalculations.abs('0').toString()).toBe('0');
    });

    it('should negate value', () => {
      expect(FinancialCalculations.negate('100').toString()).toBe('-100');
      expect(FinancialCalculations.negate('-100').toString()).toBe('100');
      expect(FinancialCalculations.negate('0').toString()).toBe('0');
    });
  });

  describe('API Serialization', () => {
    it('should convert Decimal to string safely', () => {
      const decimal = new Decimal('123.456789');
      const str = FinancialCalculations.toApiString(decimal);
      expect(typeof str).toBe('string');
      expect(str).toBe('123.456789');
    });

    it('should convert string to Decimal safely', () => {
      const decimal = FinancialCalculations.toDecimal('123.456789');
      expect(decimal).toBeInstanceOf(Decimal);
      expect(decimal.toString()).toBe('123.456789');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle very large numbers', () => {
      const large = new Decimal('999999999999999999.99');
      const result = FinancialCalculations.add(large, '0.01');
      expect(result.toString()).toBe('1000000000000000000');
    });

    it('should handle very small numbers', () => {
      const small = new Decimal('0.00000001');
      const result = FinancialCalculations.multiply(small, '1000000');
      expect(result.toString()).toBe('0.01');
    });

    it('should handle mixed precision inputs', () => {
      const result = FinancialCalculations.add('100', 0.1);
      expect(result.toString()).toBe('100.1');
    });

    it('should handle string and Decimal mixing', () => {
      const result = FinancialCalculations.add(new Decimal('100'), '50');
      expect(result.toString()).toBe('150');
    });
  });

  describe('Real-World Trading Scenarios', () => {
    it('should calculate EUR/USD standard lot P&L correctly', () => {
      // Standard lot: 100,000 units
      // Entry: 1.09500, Exit: 1.09550
      // Volume: 1.0 lot
      const pnl = FinancialCalculations.calculateRealizedPnl(
        TradeSide.BUY,
        new Decimal('1.09500'),
        new Decimal('1.09550'),
        new Decimal('1.0'),
        100000,
      );

      // (1.09550 - 1.09500) * 1.0 * 100000 = 50 USD
      expect(pnl.toString()).toBe('50.00');
    });

    it('should calculate GBP/USD mini lot P&L correctly', () => {
      // Mini lot: 10,000 units
      // Entry: 1.27000, Exit: 1.27050
      // Volume: 1.0 mini lot
      const pnl = FinancialCalculations.calculateRealizedPnl(
        TradeSide.BUY,
        new Decimal('1.27000'),
        new Decimal('1.27050'),
        new Decimal('1.0'),
        10000,
      );

      // (1.27050 - 1.27000) * 1.0 * 10000 = 5 USD
      expect(pnl.toString()).toBe('5.00');
    });

    it('should calculate crypto (BTC/USD) P&L with contract multiplier = 1', () => {
      // Entry: 50000, Exit: 51000
      // Volume: 0.1 BTC
      const pnl = FinancialCalculations.calculateRealizedPnl(
        TradeSide.BUY,
        new Decimal('50000'),
        new Decimal('51000'),
        new Decimal('0.1'),
        1,
      );

      // (51000 - 50000) * 0.1 * 1 = 100 USD
      expect(pnl.toString()).toBe('100.00');
    });
  });
});
