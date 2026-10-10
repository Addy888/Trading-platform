import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderGatewayService, OrderRejectionReason } from './order-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService, MarketStatus } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarginService } from './margin.service';
import { DailyLossService } from '../daily-loss/daily-loss.service';
import { MaxDrawdownService } from '../max-drawdown/max-drawdown.service';
import { RiskEvaluationService } from '../risk-engine/risk-evaluation.service';
import { AccountStateService } from '../trading-accounts/account-state.service';
import { TradingAccountStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';

describe('OrderGatewayService - Day 8', () => {
  let service: OrderGatewayService;
  let prisma: PrismaService;
  let marketData: MarketDataEngineService;
  let instrumentConfig: InstrumentConfigService;
  let marginService: MarginService;
  let dailyLossService: DailyLossService;
  let maxDrawdownService: MaxDrawdownService;

  const mockUserId = 'user-123';
  const mockAccountId = 'account-456';
  const mockAccount = {
    id: mockAccountId,
    userId: mockUserId,
    status: TradingAccountStatus.ACTIVE,
    accountNumber: 'TEST-001',
    ruleSnapshot: { id: 'rule-snapshot-1' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderGatewayService,
        {
          provide: PrismaService,
          useValue: {
            tradingAccount: {
              findUnique: jest.fn(),
            },
            auditLog: {
              findFirst: jest.fn(),
              create: jest.fn(),
            },
          },
        },
        {
          provide: MarketDataEngineService,
          useValue: {
            getMarketStatus: jest.fn(),
            isMarketAvailable: jest.fn(),
            getBid: jest.fn(),
            getAsk: jest.fn(),
          },
        },
        {
          provide: InstrumentConfigService,
          useValue: {
            getInstrument: jest.fn(),
            getEnabledSymbols: jest.fn(),
            validateVolume: jest.fn(),
          },
        },
        {
          provide: MarginService,
          useValue: {
            calculateRequiredMargin: jest.fn(),
            hasSufficientMargin: jest.fn(),
          },
        },
        {
          provide: DailyLossService,
          useValue: {
            evaluateDailyLoss: jest.fn(),
          },
        },
        {
          provide: MaxDrawdownService,
          useValue: {
            evaluateMaxDrawdown: jest.fn(),
          },
        },
        {
          provide: RiskEvaluationService,
          useValue: {},
        },
        {
          provide: AccountStateService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<OrderGatewayService>(OrderGatewayService);
    prisma = module.get<PrismaService>(PrismaService);
    marketData = module.get<MarketDataEngineService>(MarketDataEngineService);
    instrumentConfig = module.get<InstrumentConfigService>(InstrumentConfigService);
    marginService = module.get<MarginService>(MarginService);
    dailyLossService = module.get<DailyLossService>(DailyLossService);
    maxDrawdownService = module.get<MaxDrawdownService>(MaxDrawdownService);
  });

  describe('Account Eligibility Validation', () => {
    it('should reject order if account not found', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(null);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject order if account not owned by user', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        ...mockAccount,
        userId: 'different-user',
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject order if account is breached', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        ...mockAccount,
        status: TradingAccountStatus.BREACHED,
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject order if account is suspended', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        ...mockAccount,
        status: TradingAccountStatus.SUSPENDED,
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject order if account has no rule snapshot', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        ...mockAccount,
        ruleSnapshot: null,
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept order if account is active and eligible', async () => {
      // Setup all required mocks for successful validation
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(true);
      jest.spyOn(marketData, 'getAsk').mockReturnValue(new Decimal(1.0850));
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
        defaultLeverage: 100,
        contractMultiplier: 100000,
      } as any);
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: true,
        normalized: new Decimal(0.1),
      });
      jest.spyOn(marginService, 'calculateRequiredMargin').mockReturnValue(new Decimal(108.50));
      jest.spyOn(marginService, 'hasSufficientMargin').mockResolvedValue({
        sufficient: true,
        freeMargin: new Decimal(5000),
      });
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockRejectedValue(
        new Error('No daily loss rule'),
      );
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockRejectedValue(
        new Error('No drawdown rule'),
      );
      jest.spyOn(prisma.auditLog, 'findFirst').mockResolvedValue(null);

      const result = await service.validateOrder(mockUserId, {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: 0.1,
      });

      expect(result).toBeDefined();
      expect(result.accountId).toBe(mockAccountId);
      expect(result.symbol).toBe('EURUSD');
      expect(result.side).toBe(TradeSide.BUY);
    });
  });

  describe('Symbol and Market Validation', () => {
    beforeEach(() => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
    });

    it('should reject order if symbol not supported', async () => {
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue(undefined);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'INVALID',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order if symbol disabled', async () => {
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: false,
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order if market disconnected', async () => {
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.DISCONNECTED);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order if market data stale', async () => {
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(false);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Volume Validation', () => {
    beforeEach(() => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(true);
    });

    it('should reject order if volume too small', async () => {
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: false,
        error: 'VOLUME_TOO_SMALL_MIN_0.01',
      });

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.001,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order if volume too large', async () => {
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: false,
        error: 'VOLUME_TOO_LARGE_MAX_100',
      });

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 200,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SL/TP Validation', () => {
    beforeEach(() => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
        defaultLeverage: 100,
        contractMultiplier: 100000,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(true);
      jest.spyOn(marketData, 'getAsk').mockReturnValue(new Decimal(1.0850));
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: true,
        normalized: new Decimal(0.1),
      });
    });

    it('should reject BUY order if stop loss above entry', async () => {
      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          stopLoss: 1.0900, // Above entry (1.0850)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject SELL order if stop loss below entry', async () => {
      jest.spyOn(marketData, 'getBid').mockReturnValue(new Decimal(1.0850));

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.SELL,
          volume: 0.1,
          stopLoss: 1.0800, // Below entry (1.0850)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject BUY order if take profit below entry', async () => {
      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          takeProfit: 1.0800, // Below entry (1.0850)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid SL/TP for BUY order', async () => {
      jest.spyOn(marginService, 'calculateRequiredMargin').mockReturnValue(new Decimal(108.50));
      jest.spyOn(marginService, 'hasSufficientMargin').mockResolvedValue({
        sufficient: true,
        freeMargin: new Decimal(5000),
      });
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockRejectedValue(
        new Error('No rule'),
      );
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockRejectedValue(
        new Error('No rule'),
      );
      jest.spyOn(prisma.auditLog, 'findFirst').mockResolvedValue(null);

      const result = await service.validateOrder(mockUserId, {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: 0.1,
        stopLoss: 1.0800, // Below entry
        takeProfit: 1.0900, // Above entry
      });

      expect(result.stopLoss?.toNumber()).toBe(1.0800);
      expect(result.takeProfit?.toNumber()).toBe(1.0900);
    });
  });

  describe('Margin Validation', () => {
    beforeEach(() => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
        defaultLeverage: 100,
        contractMultiplier: 100000,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(true);
      jest.spyOn(marketData, 'getAsk').mockReturnValue(new Decimal(1.0850));
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: true,
        normalized: new Decimal(0.1),
      });
      jest.spyOn(marginService, 'calculateRequiredMargin').mockReturnValue(new Decimal(108.50));
    });

    it('should reject order if insufficient margin', async () => {
      jest.spyOn(marginService, 'hasSufficientMargin').mockResolvedValue({
        sufficient: false,
        freeMargin: new Decimal(50),
      });

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Pre-Trade Risk Validation', () => {
    beforeEach(() => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
        defaultLeverage: 100,
        contractMultiplier: 100000,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(true);
      jest.spyOn(marketData, 'getAsk').mockReturnValue(new Decimal(1.0850));
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: true,
        normalized: new Decimal(0.1),
      });
      jest.spyOn(marginService, 'calculateRequiredMargin').mockReturnValue(new Decimal(108.50));
      jest.spyOn(marginService, 'hasSufficientMargin').mockResolvedValue({
        sufficient: true,
        freeMargin: new Decimal(5000),
      });
      jest.spyOn(prisma.auditLog, 'findFirst').mockResolvedValue(null);
    });

    it('should reject order if daily loss already breached', async () => {
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockResolvedValue({
        breached: true,
        usagePercentage: new Decimal(105),
        remainingDailyLossBudget: new Decimal(-50),
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order if worst-case loss exceeds daily budget', async () => {
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockResolvedValue({
        breached: false,
        usagePercentage: new Decimal(50),
        remainingDailyLossBudget: new Decimal(100), // Only $100 remaining
      } as any);
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockRejectedValue(
        new Error('No rule'),
      );

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          stopLoss: 1.0700, // Worst-case loss ~$150 (more than remaining budget)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order if max drawdown already breached', async () => {
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockRejectedValue(
        new Error('No rule'),
      );
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockResolvedValue({
        breached: true,
        usagePercentage: new Decimal(102),
        remainingDrawdownBuffer: new Decimal(-100),
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept order if risk budgets sufficient', async () => {
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockResolvedValue({
        breached: false,
        usagePercentage: new Decimal(30),
        remainingDailyLossBudget: new Decimal(500),
      } as any);
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockResolvedValue({
        breached: false,
        usagePercentage: new Decimal(25),
        remainingDrawdownBuffer: new Decimal(800),
      } as any);

      const result = await service.validateOrder(mockUserId, {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: 0.1,
        stopLoss: 1.0800, // Worst-case loss ~$50
      });

      expect(result).toBeDefined();
    });
  });

  describe('Idempotency', () => {
    beforeEach(() => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
        defaultLeverage: 100,
        contractMultiplier: 100000,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(true);
      jest.spyOn(marketData, 'getAsk').mockReturnValue(new Decimal(1.0850));
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: true,
        normalized: new Decimal(0.1),
      });
      jest.spyOn(marginService, 'calculateRequiredMargin').mockReturnValue(new Decimal(108.50));
      jest.spyOn(marginService, 'hasSufficientMargin').mockResolvedValue({
        sufficient: true,
        freeMargin: new Decimal(5000),
      });
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockRejectedValue(
        new Error('No rule'),
      );
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockRejectedValue(
        new Error('No rule'),
      );
    });

    it('should reject duplicate order with same idempotency key', async () => {
      jest.spyOn(prisma.auditLog, 'findFirst').mockResolvedValue({
        id: 'audit-1',
        actorId: mockUserId,
        action: 'ORDER_SUBMITTED',
        createdAt: new Date(),
      } as any);

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          idempotencyKey: 'order-key-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept order with new idempotency key', async () => {
      jest.spyOn(prisma.auditLog, 'findFirst').mockResolvedValue(null);

      const result = await service.validateOrder(mockUserId, {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: 0.1,
        idempotencyKey: 'order-key-456',
      });

      expect(result).toBeDefined();
      expect(result.idempotencyKey).toBe('order-key-456');
    });
  });
});


  describe('SL/TP Distance Validation - Day 13', () => {
    beforeEach(() => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(instrumentConfig, 'getInstrument').mockReturnValue({
        symbol: 'EURUSD',
        enabled: true,
        defaultLeverage: 100,
        contractMultiplier: 100000,
        pipSize: new Decimal(0.0001),
        minSlDistance: 10,
        maxSlDistance: 1000,
        minTpDistance: 10,
        maxTpDistance: 2000,
      } as any);
      jest.spyOn(marketData, 'getMarketStatus').mockReturnValue(MarketStatus.CONNECTED);
      jest.spyOn(marketData, 'isMarketAvailable').mockReturnValue(true);
      jest.spyOn(marketData, 'getAsk').mockReturnValue(new Decimal(1.1000));
      jest.spyOn(instrumentConfig, 'validateVolume').mockReturnValue({
        valid: true,
        normalized: new Decimal(0.1),
      });
    });

    it('should reject BUY order if SL too close to entry', async () => {
      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          stopLoss: 1.0995, // Only 5 pips away (min is 10)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject BUY order if SL too far from entry', async () => {
      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          stopLoss: 1.0000, // 1000 pips away (max is 1000, but this exceeds)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept BUY order with valid SL distance', async () => {
      jest.spyOn(marginService, 'calculateRequiredMargin').mockReturnValue(new Decimal(110));
      jest.spyOn(marginService, 'hasSufficientMargin').mockResolvedValue({
        sufficient: true,
        freeMargin: new Decimal(5000),
      });
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockRejectedValue(new Error('No rule'));
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockRejectedValue(new Error('No rule'));
      jest.spyOn(prisma.auditLog, 'findFirst').mockResolvedValue(null);

      const result = await service.validateOrder(mockUserId, {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: 0.1,
        stopLoss: 1.0950, // 50 pips (valid range: 10-1000)
      });

      expect(result.stopLoss?.toNumber()).toBe(1.0950);
    });

    it('should reject BUY order if TP too close to entry', async () => {
      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          takeProfit: 1.1005, // Only 5 pips away (min is 10)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept SELL order with valid SL distance', async () => {
      jest.spyOn(marketData, 'getBid').mockReturnValue(new Decimal(1.1000));
      jest.spyOn(marginService, 'calculateRequiredMargin').mockReturnValue(new Decimal(110));
      jest.spyOn(marginService, 'hasSufficientMargin').mockResolvedValue({
        sufficient: true,
        freeMargin: new Decimal(5000),
      });
      jest.spyOn(dailyLossService, 'evaluateDailyLoss').mockRejectedValue(new Error('No rule'));
      jest.spyOn(maxDrawdownService, 'evaluateMaxDrawdown').mockRejectedValue(new Error('No rule'));
      jest.spyOn(prisma.auditLog, 'findFirst').mockResolvedValue(null);

      const result = await service.validateOrder(mockUserId, {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.SELL,
        volume: 0.1,
        stopLoss: 1.1050, // 50 pips (valid range: 10-1000)
      });

      expect(result.stopLoss?.toNumber()).toBe(1.1050);
    });

    it('should reject order if SL and TP conflict for BUY', async () => {
      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 0.1,
          stopLoss: 1.0950,
          takeProfit: 1.0940, // TP below SL (invalid)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order if SL and TP conflict for SELL', async () => {
      jest.spyOn(marketData, 'getBid').mockReturnValue(new Decimal(1.1000));

      await expect(
        service.validateOrder(mockUserId, {
          tradingAccountId: mockAccountId,
          symbol: 'EURUSD',
          side: TradeSide.SELL,
          volume: 0.1,
          stopLoss: 1.1050,
          takeProfit: 1.1060, // TP above SL (invalid)
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
