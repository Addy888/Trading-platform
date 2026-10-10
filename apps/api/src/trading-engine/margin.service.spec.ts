import { Test, TestingModule } from '@nestjs/testing';
import { MarginService, MarginCalculationResult, AccountMargin } from './margin.service';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { TradeStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';

describe('MarginService - Day 10 Enhanced Tests', () => {
  let service: MarginService;
  let prisma: PrismaService;
  let instrumentConfig: InstrumentConfigService;
  let marketData: MarketDataEngineService;

  const mockPrisma = {
    tradingAccount: {
      findUnique: jest.fn(),
    },
    trade: {
      count: jest.fn(),
    },
  };

  const mockInstrumentConfig = {
    getInstrument: jest.fn(),
  };

  const mockMarketData = {
    getMidPrice: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarginService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InstrumentConfigService, useValue: mockInstrumentConfig },
        { provide: MarketDataEngineService, useValue: mockMarketData },
      ],
    }).compile();

    service = module.get<MarginService>(MarginService);
    prisma = module.get<PrismaService>(PrismaService);
    instrumentConfig = module.get<InstrumentConfigService>(InstrumentConfigService);
    marketData = module.get<MarketDataEngineService>(MarketDataEngineService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('calculateRequiredMargin - Day 10 Enhanced', () => {
    it('should calculate margin for FOREX with correct formula', () => {
      // EURUSD: 0.01 lot at 1.1000 with 100:1 leverage
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
      });

      const result: MarginCalculationResult = service.calculateRequiredMargin(
        'EURUSD',
        new Decimal(0.01),
        new Decimal(1.1000),
        100,
      );

      // Notional = 0.01 * 1.1000 * 100000 = 1100
      // Margin = 1100 / 100 = 11.00
      expect(result.requiredMargin.toFixed(2)).toBe('11.00');
      expect(result.notionalValue.toString()).toBe('1100');
      expect(result.leverage).toBe(100);
      expect(result.effectiveLeverage).toBe(100);
      expect(result.contractMultiplier).toBe(100000);
    });

    it('should calculate margin for GOLD (XAUUSD) with correct formula', () => {
      // Gold: 0.1 lot at 2000 with 100:1 leverage
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'XAUUSD',
        contractMultiplier: 100,
        defaultLeverage: 100,
        maxLeverage: 200,
      });

      const result = service.calculateRequiredMargin(
        'XAUUSD',
        new Decimal(0.1),
        new Decimal(2000),
        100,
      );

      // Notional = 0.1 * 2000 * 100 = 20000
      // Margin = 20000 / 100 = 200.00
      expect(result.requiredMargin.toFixed(2)).toBe('200.00');
      expect(result.notionalValue.toString()).toBe('20000');
      expect(result.effectiveLeverage).toBe(100);
    });

    it('should calculate margin for CRYPTO (BTCUSD) with correct formula', () => {
      // Bitcoin: 0.01 BTC at 50000 with 10:1 leverage
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'BTCUSD',
        contractMultiplier: 1,
        defaultLeverage: 10,
        maxLeverage: 50,
      });

      const result = service.calculateRequiredMargin(
        'BTCUSD',
        new Decimal(0.01),
        new Decimal(50000),
        10,
      );

      // Notional = 0.01 * 50000 * 1 = 500
      // Margin = 500 / 10 = 50.00
      expect(result.requiredMargin.toFixed(2)).toBe('50.00');
      expect(result.notionalValue.toString()).toBe('500');
      expect(result.effectiveLeverage).toBe(10);
    });

    it('should calculate margin for OIL (WTIUSD) with correct formula', () => {
      // Oil: 1 lot at 80 with 50:1 leverage
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'WTIUSD',
        contractMultiplier: 1000,
        defaultLeverage: 50,
        maxLeverage: 100,
      });

      const result = service.calculateRequiredMargin(
        'WTIUSD',
        new Decimal(1),
        new Decimal(80),
        50,
      );

      // Notional = 1 * 80 * 1000 = 80000
      // Margin = 80000 / 50 = 1600.00
      expect(result.requiredMargin.toFixed(2)).toBe('1600.00');
      expect(result.notionalValue.toString()).toBe('80000');
      expect(result.effectiveLeverage).toBe(50);
    });

    it('should use default leverage when not specified', () => {
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
      });

      const result = service.calculateRequiredMargin(
        'EURUSD',
        new Decimal(0.01),
        new Decimal(1.1000),
        undefined, // No leverage specified
      );

      expect(result.effectiveLeverage).toBe(100); // Default leverage
      expect(result.requiredMargin.toFixed(2)).toBe('11.00');
    });

    it('should cap requested leverage at instrument max', () => {
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
      });

      const result = service.calculateRequiredMargin(
        'EURUSD',
        new Decimal(0.01),
        new Decimal(1.1000),
        1000, // Requesting 1000:1, but max is 500:1
      );

      // Should cap at 500
      expect(result.effectiveLeverage).toBe(500);
      expect(result.leverage).toBe(1000); // Original requested
      
      // Notional = 0.01 * 1.1000 * 100000 = 1100
      // Margin = 1100 / 500 = 2.20
      expect(result.requiredMargin.toFixed(2)).toBe('2.20');
    });

    it('should reject leverage less than 1', () => {
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
      });

      expect(() =>
        service.calculateRequiredMargin(
          'EURUSD',
          new Decimal(0.01),
          new Decimal(1.1000),
          0.5, // Invalid
        ),
      ).toThrow('Leverage must be at least 1');
    });

    it('should reject invalid symbol', () => {
      mockInstrumentConfig.getInstrument.mockReturnValue(undefined);

      expect(() =>
        service.calculateRequiredMargin(
          'INVALID',
          new Decimal(0.01),
          new Decimal(1.0),
          100,
        ),
      ).toThrow('Invalid symbol: INVALID');
    });

    it('should round margin to 2 decimal places', () => {
      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
      });

      const result = service.calculateRequiredMargin(
        'EURUSD',
        new Decimal(0.017), // Unusual volume
        new Decimal(1.12345),
        100,
      );

      // Result should be rounded to 2 decimal places
      expect(result.requiredMargin.decimalPlaces()).toBeLessThanOrEqual(2);
    });
  });

  describe('calculateAccountMargin - Day 10 Enhanced', () => {
    it('should calculate used margin from open positions', async () => {
      const accountId = 'account-1';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-001',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(0.1),
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
          {
            id: 'trade-2',
            symbol: 'GBPUSD',
            side: TradeSide.SELL,
            volume: new Decimal(0.05),
            entryPrice: new Decimal(1.2500),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument
        .mockReturnValueOnce({
          symbol: 'EURUSD',
          contractMultiplier: 100000,
          defaultLeverage: 100,
        })
        .mockReturnValueOnce({
          symbol: 'GBPUSD',
          contractMultiplier: 100000,
          defaultLeverage: 100,
        });

      mockMarketData.getMidPrice
        .mockReturnValueOnce(new Decimal(1.1050)) // EURUSD current price
        .mockReturnValueOnce(new Decimal(1.2480)); // GBPUSD current price

      const result: AccountMargin = await service.calculateAccountMargin(accountId);

      // EURUSD: 0.1 * 1.1050 * 100000 / 100 = 110.50
      // GBPUSD: 0.05 * 1.2480 * 100000 / 100 = 62.40
      // Total used margin: 110.50 + 62.40 = 172.90
      expect(result.usedMargin.toFixed(2)).toBe('172.90');
      expect(result.openPositions).toBe(2);
      expect(result.accountId).toBe(accountId);
      expect(result.accountNumber).toBe('TEST-001');
    });

    it('should handle zero used margin correctly', async () => {
      const accountId = 'account-no-positions';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-002',
        currentBalance: new Decimal(10000),
        trades: [], // No open positions
      });

      const result = await service.calculateAccountMargin(accountId);

      expect(result.usedMargin.toFixed(2)).toBe('0.00');
      expect(result.freeMargin.toFixed(2)).toBe('10000.00');
      expect(result.marginLevel.toFixed(2)).toBe('0.00'); // Zero margin level when no positions
      expect(result.openPositions).toBe(0);
    });

    it('should calculate free margin correctly', async () => {
      const accountId = 'account-3';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-003',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(0.1),
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
      });

      mockMarketData.getMidPrice.mockReturnValue(new Decimal(1.1100)); // +100 pips profit

      const result = await service.calculateAccountMargin(accountId);

      // Used margin: 0.1 * 1.1100 * 100000 / 100 = 111.00
      // Unrealized P&L: (1.1100 - 1.1000) * 0.1 * 100000 = +100
      // Equity: 10000 + 100 = 10100
      // Free margin: 10100 - 111.00 = 9989.00
      expect(result.usedMargin.toFixed(2)).toBe('111.00');
      expect(result.unrealizedPnl.toFixed(2)).toBe('100.00');
      expect(result.equity.toFixed(2)).toBe('10100.00');
      expect(result.freeMargin.toFixed(2)).toBe('9989.00');
    });

    it('should calculate margin level correctly', async () => {
      const accountId = 'account-4';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-004',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(1.0),
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
      });

      mockMarketData.getMidPrice.mockReturnValue(new Decimal(1.1000)); // No P&L

      const result = await service.calculateAccountMargin(accountId);

      // Used margin: 1.0 * 1.1000 * 100000 / 100 = 1100.00
      // Equity: 10000 (no unrealized P&L)
      // Margin level: (10000 / 1100) * 100 = 909.09%
      expect(result.usedMargin.toFixed(2)).toBe('1100.00');
      expect(result.equity.toFixed(2)).toBe('10000.00');
      expect(parseFloat(result.marginLevel.toFixed(2))).toBeCloseTo(909.09, 1);
    });

    it('should handle negative equity (losing position)', async () => {
      const accountId = 'account-5';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-005',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(1.0),
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
      });

      mockMarketData.getMidPrice.mockReturnValue(new Decimal(1.0950)); // -50 pips = -500 loss

      const result = await service.calculateAccountMargin(accountId);

      // Unrealized P&L: (1.0950 - 1.1000) * 1.0 * 100000 = -500
      // Equity: 10000 - 500 = 9500
      expect(result.unrealizedPnl.toFixed(2)).toBe('-500.00');
      expect(result.equity.toFixed(2)).toBe('9500.00');
    });

    it('should skip unknown instruments gracefully', async () => {
      const accountId = 'account-6';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-006',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'UNKNOWN',
            side: TradeSide.BUY,
            volume: new Decimal(0.1),
            entryPrice: new Decimal(1.0),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument.mockReturnValue(undefined);

      const result = await service.calculateAccountMargin(accountId);

      // Should skip unknown instrument and return zero margin
      expect(result.usedMargin.toFixed(2)).toBe('0.00');
      expect(result.openPositions).toBe(1); // Trade exists but not counted
    });

    it('should use entry price when market data unavailable', async () => {
      const accountId = 'account-7';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-007',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(0.1),
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
      });

      mockMarketData.getMidPrice.mockReturnValue(null); // No market data

      const result = await service.calculateAccountMargin(accountId);

      // Should use entry price for margin calculation
      // 0.1 * 1.1000 * 100000 / 100 = 110.00
      expect(result.usedMargin.toFixed(2)).toBe('110.00');
      expect(result.unrealizedPnl.toFixed(2)).toBe('0.00'); // No P&L calculation without price
    });
  });

  describe('hasSufficientMargin', () => {
    it('should return true when free margin is sufficient', async () => {
      const accountId = 'account-8';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-008',
        currentBalance: new Decimal(10000),
        trades: [],
      });

      const result = await service.hasSufficientMargin(
        accountId,
        new Decimal(1000),
      );

      expect(result.sufficient).toBe(true);
      expect(result.freeMargin.toFixed(2)).toBe('10000.00');
    });

    it('should return false when free margin is insufficient', async () => {
      const accountId = 'account-9';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-009',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(9.0), // Large position
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
      });

      mockMarketData.getMidPrice.mockReturnValue(new Decimal(1.1000));

      const result = await service.hasSufficientMargin(
        accountId,
        new Decimal(2000), // Requesting more margin
      );

      // Used margin: 9.0 * 1.1000 * 100000 / 100 = 9900
      // Free margin: 10000 - 9900 = 100
      // Required: 2000
      expect(result.sufficient).toBe(false);
      expect(parseFloat(result.freeMargin.toFixed(2))).toBeCloseTo(100, 0);
    });
  });

  describe('validateMarginForNewPosition', () => {
    it('should validate sufficient margin', async () => {
      const accountId = 'account-10';

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
      });

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-010',
        currentBalance: new Decimal(10000),
        trades: [],
      });

      const result = await service.validateMarginForNewPosition(
        accountId,
        'EURUSD',
        new Decimal(0.1),
        new Decimal(1.1000),
        100,
      );

      expect(result.valid).toBe(true);
      expect(result.requiredMargin).toBe('110.00');
      expect(result.effectiveLeverage).toBe(100);
    });

    it('should reject insufficient margin', async () => {
      const accountId = 'account-11';

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
        maxLeverage: 500,
      });

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-011',
        currentBalance: new Decimal(50), // Very low balance
        trades: [],
      });

      const result = await service.validateMarginForNewPosition(
        accountId,
        'EURUSD',
        new Decimal(1.0),
        new Decimal(1.1000),
        100,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_MARGIN');
    });

    it('should enforce leverage cap', async () => {
      const accountId = 'account-12';

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'BTCUSD',
        contractMultiplier: 1,
        defaultLeverage: 10,
        maxLeverage: 50,
      });

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-012',
        currentBalance: new Decimal(10000),
        trades: [],
      });

      const result = await service.validateMarginForNewPosition(
        accountId,
        'BTCUSD',
        new Decimal(0.1),
        new Decimal(50000),
        100, // Requesting 100:1, but max is 50:1
      );

      expect(result.valid).toBe(true);
      expect(result.effectiveLeverage).toBe(50); // Capped
    });
  });

  describe('calculateProjectedMargin', () => {
    it('should project margin state after new position', async () => {
      const accountId = 'account-13';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-013',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(0.1),
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument.mockReturnValue({
        symbol: 'EURUSD',
        contractMultiplier: 100000,
        defaultLeverage: 100,
      });

      mockMarketData.getMidPrice.mockReturnValue(new Decimal(1.1000));

      const projection = await service.calculateProjectedMargin(
        accountId,
        new Decimal(200), // New position requires 200 margin
      );

      // Current used: 0.1 * 1.1000 * 100000 / 100 = 110.00
      // Projected used: 110.00 + 200.00 = 310.00
      // Free margin: 10000 - 310 = 9690
      expect(projection.currentUsedMargin.toFixed(2)).toBe('110.00');
      expect(projection.projectedUsedMargin.toFixed(2)).toBe('310.00');
      expect(projection.currentFreeMargin.toFixed(2)).toBe('9890.00');
      expect(projection.projectedFreeMargin.toFixed(2)).toBe('9690.00');
    });

    it('should handle projection with zero current margin', async () => {
      const accountId = 'account-14';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-014',
        currentBalance: new Decimal(10000),
        trades: [],
      });

      const projection = await service.calculateProjectedMargin(
        accountId,
        new Decimal(500),
      );

      expect(projection.currentUsedMargin.toFixed(2)).toBe('0.00');
      expect(projection.projectedUsedMargin.toFixed(2)).toBe('500.00');
      expect(projection.currentMarginLevel.toFixed(2)).toBe('0.00');
      // Projected margin level: 10000 / 500 * 100 = 2000%
      expect(parseFloat(projection.projectedMarginLevel.toFixed(2))).toBeCloseTo(2000, 0);
    });
  });

  describe('getPositionMarginDetails', () => {
    it('should return detailed margin breakdown per position', async () => {
      const accountId = 'account-15';

      mockPrisma.tradingAccount.findUnique.mockResolvedValue({
        id: accountId,
        accountNumber: 'TEST-015',
        currentBalance: new Decimal(10000),
        trades: [
          {
            id: 'trade-1',
            symbol: 'EURUSD',
            side: TradeSide.BUY,
            volume: new Decimal(0.1),
            entryPrice: new Decimal(1.1000),
            status: TradeStatus.OPEN,
          },
          {
            id: 'trade-2',
            symbol: 'GBPUSD',
            side: TradeSide.SELL,
            volume: new Decimal(0.2),
            entryPrice: new Decimal(1.2500),
            status: TradeStatus.OPEN,
          },
        ],
      });

      mockInstrumentConfig.getInstrument
        .mockReturnValueOnce({
          symbol: 'EURUSD',
          contractMultiplier: 100000,
          defaultLeverage: 100,
        })
        .mockReturnValueOnce({
          symbol: 'GBPUSD',
          contractMultiplier: 100000,
          defaultLeverage: 100,
        });

      mockMarketData.getMidPrice
        .mockReturnValueOnce(new Decimal(1.1050))
        .mockReturnValueOnce(new Decimal(1.2450));

      const details = await service.getPositionMarginDetails(accountId);

      expect(details).toHaveLength(2);
      expect(details[0].tradeId).toBe('trade-1');
      expect(details[0].symbol).toBe('EURUSD');
      expect(details[0].requiredMargin.toFixed(2)).toBe('110.50');
      expect(details[1].tradeId).toBe('trade-2');
      expect(details[1].symbol).toBe('GBPUSD');
      expect(details[1].requiredMargin.toFixed(2)).toBe('249.00');
    });
  });
});
