import { DecimalInputValidation } from './decimal-input-validation.util';
import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';

describe('DecimalInputValidation - Day 4 Tests', () => {
  describe('Basic Validation', () => {
    it('should accept valid decimal string', () => {
      const result = DecimalInputValidation.validateAndConvert('123.45');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('123.45');
    });

    it('should accept valid number', () => {
      const result = DecimalInputValidation.validateAndConvert(123.45);
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('123.45');
    });

    it('should accept Decimal instance', () => {
      const input = new Decimal('123.45');
      const result = DecimalInputValidation.validateAndConvert(input);
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('123.45');
    });

    it('should reject null', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert(null);
      }).toThrow(BadRequestException);
    });

    it('should reject undefined', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert(undefined);
      }).toThrow(BadRequestException);
    });

    it('should reject NaN', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert(NaN);
      }).toThrow(BadRequestException);
    });

    it('should reject Infinity', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert(Infinity);
      }).toThrow(BadRequestException);
    });

    it('should reject -Infinity', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert(-Infinity);
      }).toThrow(BadRequestException);
    });

    it('should reject invalid string', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert('not-a-number');
      }).toThrow(BadRequestException);
    });
  });

  describe('Negative Value Validation', () => {
    it('should reject negative when not allowed', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert('-100', {
          allowNegative: false,
        });
      }).toThrow(BadRequestException);
    });

    it('should accept negative when allowed', () => {
      const result = DecimalInputValidation.validateAndConvert('-100', {
        allowNegative: true,
      });
      expect(result.toString()).toBe('-100');
    });
  });

  describe('Zero Value Validation', () => {
    it('should reject zero when not allowed', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert('0', {
          allowZero: false,
        });
      }).toThrow(BadRequestException);
    });

    it('should accept zero when allowed', () => {
      const result = DecimalInputValidation.validateAndConvert('0', {
        allowZero: true,
      });
      expect(result.toString()).toBe('0');
    });
  });

  describe('Min/Max Validation', () => {
    it('should enforce minimum value', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert('5', {
          min: '10',
        });
      }).toThrow(BadRequestException);
    });

    it('should accept value at minimum', () => {
      const result = DecimalInputValidation.validateAndConvert('10', {
        min: '10',
      });
      expect(result.toString()).toBe('10');
    });

    it('should enforce maximum value', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert('15', {
          max: '10',
        });
      }).toThrow(BadRequestException);
    });

    it('should accept value at maximum', () => {
      const result = DecimalInputValidation.validateAndConvert('10', {
        max: '10',
      });
      expect(result.toString()).toBe('10');
    });

    it('should accept value in range', () => {
      const result = DecimalInputValidation.validateAndConvert('50', {
        min: '10',
        max: '100',
      });
      expect(result.toString()).toBe('50');
    });
  });

  describe('Decimal Places Validation', () => {
    it('should enforce maximum decimal places', () => {
      expect(() => {
        DecimalInputValidation.validateAndConvert('123.456', {
          maxDecimalPlaces: 2,
        });
      }).toThrow(BadRequestException);
    });

    it('should accept value with exact decimal places', () => {
      const result = DecimalInputValidation.validateAndConvert('123.45', {
        maxDecimalPlaces: 2,
      });
      expect(result.toString()).toBe('123.45');
    });

    it('should accept value with fewer decimal places', () => {
      const result = DecimalInputValidation.validateAndConvert('123.4', {
        maxDecimalPlaces: 2,
      });
      expect(result.toString()).toBe('123.4');
    });

    it('should accept integer when decimal places limited', () => {
      const result = DecimalInputValidation.validateAndConvert('123', {
        maxDecimalPlaces: 2,
      });
      expect(result.toString()).toBe('123');
    });
  });

  describe('Money Validation', () => {
    it('should validate money correctly', () => {
      const result = DecimalInputValidation.validateMoney('1000.50', 'Balance');
      expect(result.toString()).toBe('1000.50');
    });

    it('should reject money with too many decimals', () => {
      expect(() => {
        DecimalInputValidation.validateMoney('1000.505', 'Balance');
      }).toThrow(BadRequestException);
    });

    it('should reject negative money', () => {
      expect(() => {
        DecimalInputValidation.validateMoney('-100', 'Balance');
      }).toThrow(BadRequestException);
    });

    it('should reject zero money', () => {
      expect(() => {
        DecimalInputValidation.validateMoney('0', 'Balance');
      }).toThrow(BadRequestException);
    });

    it('should reject money exceeding max', () => {
      expect(() => {
        DecimalInputValidation.validateMoney('9999999999999.99', 'Balance');
      }).toThrow(BadRequestException);
    });
  });

  describe('Price Validation', () => {
    it('should validate price correctly', () => {
      const result = DecimalInputValidation.validatePrice('1.09512345', 'Entry Price');
      expect(result.toString()).toBe('1.09512345');
    });

    it('should reject price with too many decimals', () => {
      expect(() => {
        DecimalInputValidation.validatePrice('1.095123456', 'Entry Price');
      }).toThrow(BadRequestException);
    });

    it('should reject negative price', () => {
      expect(() => {
        DecimalInputValidation.validatePrice('-1.095', 'Entry Price');
      }).toThrow(BadRequestException);
    });

    it('should reject zero price', () => {
      expect(() => {
        DecimalInputValidation.validatePrice('0', 'Entry Price');
      }).toThrow(BadRequestException);
    });
  });

  describe('Volume Validation', () => {
    it('should validate volume correctly', () => {
      const result = DecimalInputValidation.validateVolume('1.2500', 'Lot Size');
      expect(result.toString()).toBe('1.25');
    });

    it('should reject volume with too many decimals', () => {
      expect(() => {
        DecimalInputValidation.validateVolume('1.25005', 'Lot Size');
      }).toThrow(BadRequestException);
    });

    it('should reject negative volume', () => {
      expect(() => {
        DecimalInputValidation.validateVolume('-1.25', 'Lot Size');
      }).toThrow(BadRequestException);
    });

    it('should reject zero volume', () => {
      expect(() => {
        DecimalInputValidation.validateVolume('0', 'Lot Size');
      }).toThrow(BadRequestException);
    });
  });

  describe('Percentage Validation', () => {
    it('should validate percentage correctly', () => {
      const result = DecimalInputValidation.validatePercentage('45.50', 'Drawdown');
      expect(result.toString()).toBe('45.5');
    });

    it('should accept zero percentage', () => {
      const result = DecimalInputValidation.validatePercentage('0', 'Drawdown');
      expect(result.toString()).toBe('0');
    });

    it('should reject percentage above 100', () => {
      expect(() => {
        DecimalInputValidation.validatePercentage('101', 'Drawdown');
      }).toThrow(BadRequestException);
    });

    it('should reject negative percentage', () => {
      expect(() => {
        DecimalInputValidation.validatePercentage('-5', 'Drawdown');
      }).toThrow(BadRequestException);
    });
  });

  describe('Leverage Validation', () => {
    it('should validate leverage correctly', () => {
      const result = DecimalInputValidation.validateLeverage('100', 'Leverage');
      expect(result.toString()).toBe('100');
    });

    it('should reject fractional leverage', () => {
      expect(() => {
        DecimalInputValidation.validateLeverage('100.5', 'Leverage');
      }).toThrow(BadRequestException);
    });

    it('should reject leverage below 1', () => {
      expect(() => {
        DecimalInputValidation.validateLeverage('0.5', 'Leverage');
      }).toThrow(BadRequestException);
    });

    it('should reject leverage above 500', () => {
      expect(() => {
        DecimalInputValidation.validateLeverage('501', 'Leverage');
      }).toThrow(BadRequestException);
    });
  });

  describe('P&L Validation', () => {
    it('should validate positive P&L', () => {
      const result = DecimalInputValidation.validatePnl('500.50', 'Profit');
      expect(result.toString()).toBe('500.5');
    });

    it('should validate negative P&L', () => {
      const result = DecimalInputValidation.validatePnl('-500.50', 'Loss');
      expect(result.toString()).toBe('-500.5');
    });

    it('should validate zero P&L', () => {
      const result = DecimalInputValidation.validatePnl('0', 'Break Even');
      expect(result.toString()).toBe('0');
    });

    it('should reject P&L with too many decimals', () => {
      expect(() => {
        DecimalInputValidation.validatePnl('500.505', 'P&L');
      }).toThrow(BadRequestException);
    });
  });

  describe('Batch Validation', () => {
    it('should validate array of values', () => {
      const results = DecimalInputValidation.validateBatch(
        ['10', '20', '30'],
        { min: '5', max: '50' },
      );
      expect(results).toHaveLength(3);
      expect(results[0].toString()).toBe('10');
      expect(results[1].toString()).toBe('20');
      expect(results[2].toString()).toBe('30');
    });

    it('should reject batch if any value invalid', () => {
      expect(() => {
        DecimalInputValidation.validateBatch(
          ['10', '20', '60'],
          { min: '5', max: '50' },
        );
      }).toThrow(BadRequestException);
    });
  });

  describe('Optional Validation', () => {
    it('should return null for null input', () => {
      const result = DecimalInputValidation.validateOptional(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = DecimalInputValidation.validateOptional(undefined);
      expect(result).toBeNull();
    });

    it('should validate non-null value', () => {
      const result = DecimalInputValidation.validateOptional('123.45');
      expect(result).toBeInstanceOf(Decimal);
      expect(result!.toString()).toBe('123.45');
    });
  });

  describe('Integer Validation', () => {
    it('should validate integer correctly', () => {
      const result = DecimalInputValidation.validateInteger('42', 'Count');
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should reject fractional number', () => {
      expect(() => {
        DecimalInputValidation.validateInteger('42.5', 'Count');
      }).toThrow(BadRequestException);
    });
  });

  describe('isValid Check', () => {
    it('should return true for valid decimal', () => {
      expect(DecimalInputValidation.isValid('123.45')).toBe(true);
      expect(DecimalInputValidation.isValid(123.45)).toBe(true);
      expect(DecimalInputValidation.isValid(new Decimal('123.45'))).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(DecimalInputValidation.isValid(null)).toBe(false);
      expect(DecimalInputValidation.isValid(undefined)).toBe(false);
      expect(DecimalInputValidation.isValid(NaN)).toBe(false);
      expect(DecimalInputValidation.isValid(Infinity)).toBe(false);
      expect(DecimalInputValidation.isValid('invalid')).toBe(false);
    });
  });

  describe('Formatting Functions', () => {
    it('should format money correctly', () => {
      expect(DecimalInputValidation.formatMoney('1000.5')).toBe('1000.50');
      expect(DecimalInputValidation.formatMoney('1000.505')).toBe('1000.51');
      expect(DecimalInputValidation.formatMoney(new Decimal('1000'))).toBe('1000.00');
    });

    it('should format price correctly', () => {
      expect(DecimalInputValidation.formatPrice('1.095')).toBe('1.09500000');
      expect(DecimalInputValidation.formatPrice('1.09512345')).toBe('1.09512345');
    });

    it('should format percentage correctly', () => {
      expect(DecimalInputValidation.formatPercentage('45.5')).toBe('45.50');
      expect(DecimalInputValidation.formatPercentage('45.555')).toBe('45.56');
    });

    it('should handle invalid values gracefully', () => {
      expect(DecimalInputValidation.formatMoney('invalid')).toBe('0.00');
      expect(DecimalInputValidation.formatPrice('invalid')).toBe('0.00000000');
      expect(DecimalInputValidation.formatPercentage('invalid')).toBe('0.00');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small positive values', () => {
      const result = DecimalInputValidation.validateAndConvert('0.00000001');
      expect(result.toString()).toBe('0.00000001');
    });

    it('should handle very large values', () => {
      const result = DecimalInputValidation.validateAndConvert('999999999999.99');
      expect(result.toString()).toBe('999999999999.99');
    });

    it('should handle scientific notation', () => {
      const result = DecimalInputValidation.validateAndConvert('1e5');
      expect(result.toString()).toBe('100000');
    });

    it('should handle negative scientific notation', () => {
      const result = DecimalInputValidation.validateAndConvert('1e-5', {
        allowNegative: false,
      });
      expect(result.toString()).toBe('0.00001');
    });
  });

  describe('Custom Field Names in Errors', () => {
    it('should include field name in error message', () => {
      try {
        DecimalInputValidation.validateMoney('0', 'Payout Amount');
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Payout Amount');
      }
    });

    it('should use default field name when not provided', () => {
      try {
        DecimalInputValidation.validateAndConvert(null);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Value');
      }
    });
  });

  describe('Database and API Conversion', () => {
    it('should convert to database Decimal', () => {
      const result = DecimalInputValidation.toDatabase('123.45');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('123.45');
    });

    it('should handle Decimal input for database', () => {
      const input = new Decimal('123.45');
      const result = DecimalInputValidation.toDatabase(input);
      expect(result).toBe(input);
    });

    it('should convert to API string', () => {
      const result = DecimalInputValidation.toApiString(new Decimal('123.45'));
      expect(typeof result).toBe('string');
      expect(result).toBe('123.45');
    });
  });
});
