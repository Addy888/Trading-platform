import Decimal from 'decimal.js';
import { BadRequestException } from '@nestjs/common';

/**
 * Decimal Input Validation Utility
 * 
 * Provides safe validation and conversion of user inputs to Decimal values.
 * Prevents NaN, Infinity, invalid strings, and out-of-range values from
 * entering the financial calculation layer.
 * 
 * CRITICAL RULES:
 * 1. NEVER trust client-supplied financial values without validation
 * 2. ALWAYS validate before converting to Decimal
 * 3. ALWAYS specify constraints (min, max, precision)
 * 4. ALWAYS throw clear, actionable errors
 */

export interface DecimalValidationOptions {
  /** Minimum allowed value (inclusive) */
  min?: string | number | Decimal;
  /** Maximum allowed value (inclusive) */
  max?: string | number | Decimal;
  /** Maximum decimal places allowed */
  maxDecimalPlaces?: number;
  /** Field name for error messages */
  fieldName?: string;
  /** Allow negative values */
  allowNegative?: boolean;
  /** Allow zero */
  allowZero?: boolean;
}

export class DecimalInputValidation {
  /**
   * Validate and convert input to Decimal
   * 
   * @throws BadRequestException if validation fails
   */
  static validateAndConvert(
    value: any,
    options: DecimalValidationOptions = {},
  ): Decimal {
    const fieldName = options.fieldName || 'Value';

    // 1. Check for null/undefined
    if (value === null || value === undefined) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    // 2. Check for NaN
    if (typeof value === 'number' && isNaN(value)) {
      throw new BadRequestException(`${fieldName} cannot be NaN`);
    }

    // 3. Check for Infinity
    if (value === Infinity || value === -Infinity) {
      throw new BadRequestException(`${fieldName} cannot be Infinity`);
    }

    // 4. Try to convert to Decimal
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch (error) {
      throw new BadRequestException(
        `${fieldName} must be a valid decimal number`,
      );
    }

    // 5. Check if finite
    if (!decimal.isFinite()) {
      throw new BadRequestException(`${fieldName} must be a finite number`);
    }

    // 6. Check for negative (if not allowed)
    if (!options.allowNegative && decimal.isNegative()) {
      throw new BadRequestException(`${fieldName} cannot be negative`);
    }

    // 7. Check for zero (if not allowed)
    if (!options.allowZero && decimal.isZero()) {
      throw new BadRequestException(`${fieldName} cannot be zero`);
    }

    // 8. Check minimum value
    if (options.min !== undefined) {
      const minDecimal = new Decimal(options.min);
      if (decimal.lessThan(minDecimal)) {
        throw new BadRequestException(
          `${fieldName} must be at least ${minDecimal.toString()}`,
        );
      }
    }

    // 9. Check maximum value
    if (options.max !== undefined) {
      const maxDecimal = new Decimal(options.max);
      if (decimal.greaterThan(maxDecimal)) {
        throw new BadRequestException(
          `${fieldName} must be at most ${maxDecimal.toString()}`,
        );
      }
    }

    // 10. Check decimal places
    if (options.maxDecimalPlaces !== undefined) {
      const decimalPlaces = decimal.decimalPlaces();
      if (decimalPlaces > options.maxDecimalPlaces) {
        throw new BadRequestException(
          `${fieldName} cannot have more than ${options.maxDecimalPlaces} decimal places`,
        );
      }
    }

    return decimal;
  }

  /**
   * Validate money amount (balance, payout, price)
   */
  static validateMoney(
    value: any,
    fieldName: string = 'Amount',
    options: Partial<DecimalValidationOptions> = {},
  ): Decimal {
    return this.validateAndConvert(value, {
      fieldName,
      allowNegative: false,
      allowZero: false,
      min: '0.01',
      max: '999999999999.99', // Max supported by Decimal(12,2)
      maxDecimalPlaces: 2,
      ...options,
    });
  }

  /**
   * Validate price (instrument price, entry, exit, SL, TP)
   */
  static validatePrice(
    value: any,
    fieldName: string = 'Price',
    options: Partial<DecimalValidationOptions> = {},
  ): Decimal {
    return this.validateAndConvert(value, {
      fieldName,
      allowNegative: false,
      allowZero: false,
      min: '0.00000001',
      max: '999999999999999999.99999999', // Max supported by Decimal(18,8)
      maxDecimalPlaces: 8,
      ...options,
    });
  }

  /**
   * Validate volume (lot size)
   */
  static validateVolume(
    value: any,
    fieldName: string = 'Volume',
    options: Partial<DecimalValidationOptions> = {},
  ): Decimal {
    return this.validateAndConvert(value, {
      fieldName,
      allowNegative: false,
      allowZero: false,
      min: '0.0001',
      max: '9999999.9999', // Max supported by Decimal(10,4)
      maxDecimalPlaces: 4,
      ...options,
    });
  }

  /**
   * Validate percentage (0-100 range)
   */
  static validatePercentage(
    value: any,
    fieldName: string = 'Percentage',
    options: Partial<DecimalValidationOptions> = {},
  ): Decimal {
    return this.validateAndConvert(value, {
      fieldName,
      allowNegative: false,
      allowZero: true,
      min: '0',
      max: '100',
      maxDecimalPlaces: 4,
      ...options,
    });
  }

  /**
   * Validate leverage (1-500 range typical)
   */
  static validateLeverage(
    value: any,
    fieldName: string = 'Leverage',
    options: Partial<DecimalValidationOptions> = {},
  ): Decimal {
    return this.validateAndConvert(value, {
      fieldName,
      allowNegative: false,
      allowZero: false,
      min: '1',
      max: '500',
      maxDecimalPlaces: 0,
      ...options,
    });
  }

  /**
   * Validate P&L (can be negative)
   */
  static validatePnl(
    value: any,
    fieldName: string = 'P&L',
    options: Partial<DecimalValidationOptions> = {},
  ): Decimal {
    return this.validateAndConvert(value, {
      fieldName,
      allowNegative: true,
      allowZero: true,
      min: '-999999999999.99',
      max: '999999999999.99',
      maxDecimalPlaces: 2,
      ...options,
    });
  }

  /**
   * Batch validate array of decimals
   */
  static validateBatch(
    values: any[],
    options: DecimalValidationOptions = {},
  ): Decimal[] {
    return values.map((value, index) => {
      const fieldName = options.fieldName
        ? `${options.fieldName}[${index}]`
        : `Value[${index}]`;
      return this.validateAndConvert(value, { ...options, fieldName });
    });
  }

  /**
   * Safe conversion for optional values
   */
  static validateOptional(
    value: any,
    options: DecimalValidationOptions = {},
  ): Decimal | null {
    if (value === null || value === undefined) {
      return null;
    }
    return this.validateAndConvert(value, options);
  }

  /**
   * Validate integer (no decimal places)
   */
  static validateInteger(
    value: any,
    fieldName: string = 'Value',
    options: Partial<DecimalValidationOptions> = {},
  ): number {
    const decimal = this.validateAndConvert(value, {
      fieldName,
      maxDecimalPlaces: 0,
      ...options,
    });
    return decimal.toNumber();
  }

  /**
   * Check if value is valid decimal without throwing
   */
  static isValid(value: any): boolean {
    try {
      if (value === null || value === undefined) return false;
      if (typeof value === 'number' && !isFinite(value)) return false;
      const decimal = new Decimal(value);
      return decimal.isFinite();
    } catch {
      return false;
    }
  }

  /**
   * Safe conversion for database Decimal columns
   */
  static toDatabase(value: Decimal | string | number): Decimal {
    if (value instanceof Decimal) {
      return value;
    }
    try {
      return new Decimal(value);
    } catch {
      throw new Error('Cannot convert value to database Decimal');
    }
  }

  /**
   * Safe conversion for API response
   */
  static toApiString(value: Decimal | string | number): string {
    try {
      return new Decimal(value).toString();
    } catch {
      throw new Error('Cannot convert value to API string');
    }
  }

  /**
   * Format for money display (2 decimal places)
   */
  static formatMoney(value: Decimal | string | number): string {
    try {
      return new Decimal(value).toFixed(2);
    } catch {
      return '0.00';
    }
  }

  /**
   * Format for price display (8 decimal places)
   */
  static formatPrice(value: Decimal | string | number): string {
    try {
      return new Decimal(value).toFixed(8);
    } catch {
      return '0.00000000';
    }
  }

  /**
   * Format for percentage display (2 decimal places)
   */
  static formatPercentage(value: Decimal | string | number): string {
    try {
      return new Decimal(value).toFixed(2);
    } catch {
      return '0.00';
    }
  }
}
