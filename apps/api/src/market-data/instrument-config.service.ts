import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

/**
 * Instrument Configuration
 */
export interface InstrumentConfig {
  symbol: string;
  name: string;
  category: 'FOREX' | 'COMMODITY' | 'CRYPTO' | 'INDEX';
  enabled: boolean;
  minVolume: Decimal;
  maxVolume: Decimal;
  volumeStep: Decimal;
  contractSize: number;
  contractMultiplier: number;
  defaultLeverage: number;
  maxLeverage: number;
  minPrice: Decimal;
  maxPrice: Decimal;
  pipSize: Decimal;
  precision: number;
  marginRequirement: Decimal; // Percentage of position value required as margin
  // Day 13: SL/TP distance validation
  minSlDistance?: number; // Minimum SL distance in pips
  maxSlDistance?: number; // Maximum SL distance in pips
  minTpDistance?: number; // Minimum TP distance in pips
  maxTpDistance?: number; // Maximum TP distance in pips
}

/**
 * Instrument Configuration Service
 * 
 * Single source of truth for trading instrument specifications.
 * Validates volume, leverage, and provides contract specifications.
 */
@Injectable()
export class InstrumentConfigService {
  private readonly instruments: Map<string, InstrumentConfig> = new Map();

  constructor() {
    this.initializeInstruments();
  }

  /**
   * Initialize instrument configurations
   */
  private initializeInstruments(): void {
    const configs: InstrumentConfig[] = [
      // Forex Major Pairs
      {
        symbol: 'EURUSD',
        name: 'Euro vs US Dollar',
        category: 'FOREX',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(100),
        volumeStep: new Decimal(0.01),
        contractSize: 100000, // Standard lot
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
        minPrice: new Decimal(0.8),
        maxPrice: new Decimal(1.5),
        pipSize: new Decimal(0.0001),
        precision: 5,
        marginRequirement: new Decimal(0.01), // 1% = 1:100 leverage
        minSlDistance: 10,  // 10 pips minimum
        maxSlDistance: 1000, // 1000 pips maximum
        minTpDistance: 10,  // 10 pips minimum
        maxTpDistance: 2000, // 2000 pips maximum
      },
      {
        symbol: 'GBPUSD',
        name: 'British Pound vs US Dollar',
        category: 'FOREX',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(100),
        volumeStep: new Decimal(0.01),
        contractSize: 100000,
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
        minPrice: new Decimal(1.0),
        maxPrice: new Decimal(1.8),
        pipSize: new Decimal(0.0001),
        precision: 5,
        marginRequirement: new Decimal(0.01),
      },
      {
        symbol: 'USDJPY',
        name: 'US Dollar vs Japanese Yen',
        category: 'FOREX',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(100),
        volumeStep: new Decimal(0.01),
        contractSize: 100000,
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
        minPrice: new Decimal(90),
        maxPrice: new Decimal(160),
        pipSize: new Decimal(0.01),
        precision: 3,
        marginRequirement: new Decimal(0.01),
      },
      {
        symbol: 'AUDUSD',
        name: 'Australian Dollar vs US Dollar',
        category: 'FOREX',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(100),
        volumeStep: new Decimal(0.01),
        contractSize: 100000,
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
        minPrice: new Decimal(0.5),
        maxPrice: new Decimal(1.0),
        pipSize: new Decimal(0.0001),
        precision: 5,
        marginRequirement: new Decimal(0.01),
      },
      {
        symbol: 'USDCAD',
        name: 'US Dollar vs Canadian Dollar',
        category: 'FOREX',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(100),
        volumeStep: new Decimal(0.01),
        contractSize: 100000,
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
        minPrice: new Decimal(1.0),
        maxPrice: new Decimal(1.6),
        pipSize: new Decimal(0.0001),
        precision: 5,
        marginRequirement: new Decimal(0.01),
      },
      // Commodities
      {
        symbol: 'XAUUSD',
        name: 'Gold',
        category: 'COMMODITY',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(50),
        volumeStep: new Decimal(0.01),
        contractSize: 100, // Troy ounces
        contractMultiplier: 100,
        defaultLeverage: 100,
        maxLeverage: 200,
        minPrice: new Decimal(1000),
        maxPrice: new Decimal(3000),
        pipSize: new Decimal(0.01),
        precision: 2,
        marginRequirement: new Decimal(0.01), // 1%
      },
      {
        symbol: 'XAGUSD',
        name: 'Silver',
        category: 'COMMODITY',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(50),
        volumeStep: new Decimal(0.01),
        contractSize: 5000, // Troy ounces
        contractMultiplier: 5000,
        defaultLeverage: 100,
        maxLeverage: 200,
        minPrice: new Decimal(10),
        maxPrice: new Decimal(50),
        pipSize: new Decimal(0.01),
        precision: 3,
        marginRequirement: new Decimal(0.01),
      },
      {
        symbol: 'WTIUSD',
        name: 'Crude Oil WTI',
        category: 'COMMODITY',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(50),
        volumeStep: new Decimal(0.01),
        contractSize: 1000, // Barrels
        contractMultiplier: 1000,
        defaultLeverage: 50,
        maxLeverage: 100,
        minPrice: new Decimal(30),
        maxPrice: new Decimal(150),
        pipSize: new Decimal(0.01),
        precision: 2,
        marginRequirement: new Decimal(0.02), // 2%
      },
      // Crypto
      {
        symbol: 'BTCUSD',
        name: 'Bitcoin',
        category: 'CRYPTO',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(10),
        volumeStep: new Decimal(0.01),
        contractSize: 1,
        contractMultiplier: 1,
        defaultLeverage: 10,
        maxLeverage: 50,
        minPrice: new Decimal(10000),
        maxPrice: new Decimal(100000),
        pipSize: new Decimal(1),
        precision: 2,
        marginRequirement: new Decimal(0.1), // 10% = 1:10 leverage
      },
      {
        symbol: 'ETHUSD',
        name: 'Ethereum',
        category: 'CRYPTO',
        enabled: true,
        minVolume: new Decimal(0.01),
        maxVolume: new Decimal(50),
        volumeStep: new Decimal(0.01),
        contractSize: 1,
        contractMultiplier: 1,
        defaultLeverage: 10,
        maxLeverage: 50,
        minPrice: new Decimal(500),
        maxPrice: new Decimal(5000),
        pipSize: new Decimal(0.01),
        precision: 2,
        marginRequirement: new Decimal(0.1), // 10%
      },
    ];

    for (const config of configs) {
      this.instruments.set(config.symbol, config);
    }
  }

  /**
   * Get instrument configuration
   */
  getInstrument(symbol: string): InstrumentConfig | undefined {
    return this.instruments.get(symbol.toUpperCase());
  }

  /**
   * Check if instrument exists and is enabled
   */
  isEnabled(symbol: string): boolean {
    const instrument = this.getInstrument(symbol);
    return instrument ? instrument.enabled : false;
  }

  /**
   * Get all enabled instruments
   */
  getEnabledInstruments(): InstrumentConfig[] {
    return Array.from(this.instruments.values()).filter((i) => i.enabled);
  }

  /**
   * Get supported symbols
   */
  getSupportedSymbols(): string[] {
    return Array.from(this.instruments.keys());
  }

  /**
   * Get enabled symbols
   */
  getEnabledSymbols(): string[] {
    return this.getEnabledInstruments().map((i) => i.symbol);
  }

  /**
   * Validate volume
   */
  validateVolume(symbol: string, volume: Decimal): {
    valid: boolean;
    error?: string;
    normalized?: Decimal;
  } {
    const instrument = this.getInstrument(symbol);

    if (!instrument) {
      return { valid: false, error: 'INVALID_SYMBOL' };
    }

    if (!instrument.enabled) {
      return { valid: false, error: 'SYMBOL_DISABLED' };
    }

    // Check for valid number
    if (!volume.isFinite() || volume.isNaN()) {
      return { valid: false, error: 'INVALID_VOLUME_FORMAT' };
    }

    // Check minimum
    if (volume.lessThan(instrument.minVolume)) {
      return {
        valid: false,
        error: `VOLUME_TOO_SMALL_MIN_${instrument.minVolume.toString()}`,
      };
    }

    // Check maximum
    if (volume.greaterThan(instrument.maxVolume)) {
      return {
        valid: false,
        error: `VOLUME_TOO_LARGE_MAX_${instrument.maxVolume.toString()}`,
      };
    }

    // Normalize to volume step
    const remainder = volume.modulo(instrument.volumeStep);
    if (!remainder.isZero()) {
      // Round to nearest step
      const normalized = volume
        .dividedBy(instrument.volumeStep)
        .round()
        .times(instrument.volumeStep);

      return {
        valid: true,
        normalized,
      };
    }

    return { valid: true, normalized: volume };
  }

  /**
   * Calculate margin requirement
   */
  calculateMarginRequirement(
    symbol: string,
    volume: Decimal,
    price: Decimal,
    leverage?: number,
  ): Decimal {
    const instrument = this.getInstrument(symbol);
    if (!instrument) {
      throw new Error('Invalid symbol');
    }

    const effectiveLeverage = leverage || instrument.defaultLeverage;

    // Position value = volume * price * contract size
    const positionValue = volume
      .times(price)
      .times(instrument.contractMultiplier);

    // Margin = position value / leverage
    const margin = positionValue.dividedBy(effectiveLeverage);

    return margin;
  }

  /**
   * Validate leverage
   */
  validateLeverage(symbol: string, leverage: number): {
    valid: boolean;
    error?: string;
  } {
    const instrument = this.getInstrument(symbol);

    if (!instrument) {
      return { valid: false, error: 'INVALID_SYMBOL' };
    }

    if (leverage < 1) {
      return { valid: false, error: 'LEVERAGE_TOO_LOW' };
    }

    if (leverage > instrument.maxLeverage) {
      return {
        valid: false,
        error: `LEVERAGE_TOO_HIGH_MAX_${instrument.maxLeverage}`,
      };
    }

    return { valid: true };
  }
}
