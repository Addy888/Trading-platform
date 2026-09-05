import { Test, TestingModule } from '@nestjs/testing';
import { TradingEngineV2Service, TradingErrorCode } from './trading-engine-v2.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService, MarketStatus } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarginService } from './margin.service';
import { RuleEvaluatorService } from '../rule-evaluator/rule-evaluator.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradingAccountStatus, TradeSide, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('TradingEngineV2Service', () => {
  let service: TradingEngineV2Service;
  let prismaService: PrismaService;
  let marketDataService: MarketDataEngineService;
  let instrumentConfigService: InstrumentConfigService;
  let marginService: MarginService;

  const mockAccount = {
    id: 'account-1',
    userId: 'user-1',
    status: TradingAccountStatus.ACTIVE,
    currentBalance: new Decimal(100000),
    equity: new Decimal(100000),
    initialBalance: new Decimal(100000),
    accountNumber: 'TEST-001',
  };

  const mockTrade = {
    id: 'trade-1',
    tradingAccountId: 'account-1',
    symbol: 'EURUSD',
    side: TradeSide.BUY,
    volume: new Decimal(1.0),
    entryPrice: new Decimal(1.0850),
    exitPrice: null,
    stopLoss: new Decimal(1.0800),
    takeProfit: new Decimal(1.0900),
    status: TradeStatus.OPEN,
    realizedPnl: new Decimal(0),
    openedAt: new Date(),
    closedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingEngineV2Service,
        {
          provide: PrismaService,
          useValue: {
            tradingAccount: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            trade: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: MarketDataEngineService,
          useValue: {
            getMarketStatus: jest.fn().mockReturnValue(MarketStatus.CONNECTED),
            isMarketAvailable: jest.fn().mockReturnValue(true),
            getAsk: jest.fn().mockReturnValue(new Decimal(1.0851)),
            getBid: jest.fn().mockReturnValue(new Decimal(1.0849)),
            getMidPrice: jest.fn().mockReturnValue(new Decimal(1.0850)),
          },
        },
        {
          provide: InstrumentConfigService,
          useValue: {
            getInstrument: jest.fn().mockReturnValue({
              symbol: 'EURUSD',
              enabled: true,
              contractMultiplier: 100000,
              defaultLeverage: 100,
            }),
            validateVolume: jest.fn().mockReturnValue({
              valid: true,
              normalized: new Decimal(1.0),
            }),
            validateLeverage: jest.fn().mockReturnValue({ valid: true }),
          },
        },
        {
          provide: MarginService,
          useValue: {
            validateMarginForNewPosition: jest.fn().mockResolvedValue({
              valid: true,
              requiredMargin: '1085',
              freeMargin: '98915',
            }),
          },
        },
        {
          provide: RuleEvaluatorService,
          useValue: {
            evaluateRules: jest.fn().mockResolvedValue({
              passed: false,
              breached: false,
            }),
            updateAccountStatus: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AccountSnapshotsService,
          useValue: {
            createSnapshot: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TradingEngineV2Service>(TradingEngineV2Service);
    prismaService = module.get<PrismaService>(PrismaService);
    marketDataService = module.get<MarketDataEngineService>(MarketDataEngineService);
    instrumentConfigService = module.get<InstrumentConfigService>(InstrumentConfigService);
    marginService = module.get<MarginService>(MarginService);
  });

  describe('openTrade', () => {
    it('should successfully open a BUY trade', async () => {
      // Mock transaction
      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn().mockResolvedValue({ ...mockAccount, equity: new Decimal(100000) }),
          },
          trade: {
            create: jest.fn().mockResolvedValue(mockTrade),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.openTrade('account-1', 'user-1', {
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: 1.0,
        stopLoss: 1.0800,
        takeProfit: 1.0900,
      });

      expect(result).toBeDefined();
      expect(result.symbol).toBe('EURUSD');
      expect(result.side).toBe(TradeSide.BUY);
    });

    it('should reject trade if account not found', async () => {
      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      });

      await expect(
        service.openTrade('account-1', 'user-1', {
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 1.0,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject trade if account not owned by user', async () => {
      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
          },
        };
        return callback(tx);
      });

      await expect(
        service.openTrade('account-1', 'user-2', {
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 1.0,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject trade if account is breached', async () => {
      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue({
              ...mockAccount,
              status: TradingAccountStatus.BREACHED,
            }),
          },
        };
        return callback(tx);
      });

      await expect(
        service.openTrade('account-1', 'user-1', {
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 1.0,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject trade if market data is stale', async () => {
      jest.spyOn(marketDataService, 'isMarketAvailable').mockReturnValue(false);

      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
          },
        };
        return callback(tx);
      });

      await expect(
        service.openTrade('account-1', 'user-1', {
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 1.0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject trade with insufficient margin', async () => {
      jest.spyOn(marginService, 'validateMarginForNewPosition').mockResolvedValue({
        valid: false,
        error: 'INSUFFICIENT_MARGIN',
        requiredMargin: '100000',
        freeMargin: '50000',
      });

      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
          },
        };
        return callback(tx);
      });

      await expect(
        service.openTrade('account-1', 'user-1', {
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: 100.0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use ASK price for BUY execution', async () => {
      const askPrice = new Decimal(1.0851);
      jest.spyOn(marketDataService, 'getAsk').mockReturnValue(askPrice);

      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn().mockResolvedValue(mockAccount),
          },
          trade: {
            create: jest.fn().mockImplementation((data) => {
              expect(data.data.entryPrice).toEqual(askPrice);
              return Promise.resolve({ ...mockTrade, entryPrice: askPrice });
            }),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      await service.openTrade('account-1', 'user-1', {
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: 1.0,
      });

      expect(marketDataService.getAsk).toHaveBeenCalledWith('EURUSD');
    });

    it('should use BID price for SELL execution', async () => {
      const bidPrice = new Decimal(1.0849);
      jest.spyOn(marketDataService, 'getBid').mockReturnValue(bidPrice);

      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn().mockResolvedValue(mockAccount),
          },
          trade: {
            create: jest.fn().mockImplementation((data) => {
              expect(data.data.entryPrice).toEqual(bidPrice);
              return Promise.resolve({
                ...mockTrade,
                side: TradeSide.SELL,
                entryPrice: bidPrice,
              });
            }),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      await service.openTrade('account-1', 'user-1', {
        symbol: 'EURUSD',
        side: TradeSide.SELL,
        volume: 1.0,
      });

      expect(marketDataService.getBid).toHaveBeenCalledWith('EURUSD');
    });
  });

  describe('closeTrade', () => {
    it('should successfully close a BUY trade at BID price', async () => {
      const bidPrice = new Decimal(1.0900);
      jest.spyOn(marketDataService, 'getBid').mockReturnValue(bidPrice);

      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn().mockResolvedValue(mockAccount),
          },
          trade: {
            findUnique: jest.fn().mockResolvedValue(mockTrade),
            update: jest.fn().mockResolvedValue({
              ...mockTrade,
              status: TradeStatus.CLOSED,
              exitPrice: bidPrice,
              closedAt: new Date(),
            }),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.closeTrade('account-1', 'trade-1', 'user-1');

      expect(result.status).toBe(TradeStatus.CLOSED);
      expect(marketDataService.getBid).toHaveBeenCalledWith('EURUSD');
    });

    it('should reject closing trade twice', async () => {
      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
          },
          trade: {
            findUnique: jest.fn().mockResolvedValue({
              ...mockTrade,
              status: TradeStatus.CLOSED,
            }),
          },
        };
        return callback(tx);
      });

      await expect(
        service.closeTrade('account-1', 'trade-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject closing trade not owned by user', async () => {
      (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
          },
          trade: {
            findUnique: jest.fn().mockResolvedValue(mockTrade),
          },
        };
        return callback(tx);
      });

      await expect(
        service.closeTrade('account-1', 'trade-1', 'user-2'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
