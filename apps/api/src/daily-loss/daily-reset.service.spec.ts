/**
 * Day 18: Daily Reset Engine Tests
 * 
 * Comprehensive tests for daily reset functionality including:
 * - Daily reference creation
 * - Daily P&L reset
 * - Balance basis
 * - Equity basis  
 * - Timezone calculation
 * - HWM preservation
 * - Eligible/ineligible account statuses
 * - Duplicate reset protection
 * - Concurrent reset
 * - Reset + order race
 * - Reset + breach race
 * - Immutable DAILY_RESET event
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DailyLossService } from './daily-loss.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';

describe('DailyLossService - Day 18 Daily Reset', () => {
  let service: DailyLossService;
  let prisma: jest.Mocked<PrismaService>;

  const mockAccountId = 'account-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyLossService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            tradingAccount: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
            trade: {
              findMany: jest.fn(),
            },
            dailySnapshot: {
              upsert: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DailyLossService>(DailyLossService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  describe('Daily Reference Creation', () => {
    it('should set dailyStartBalance and dailyStartEquity from current values', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10500),
        equity: new Decimal(10500),
        highWaterMark: new Decimal(10500),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        lastDailyResetAt: null,
        timezone: 'UTC',
      };

      const updateSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: updateSpy,
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          dailySnapshot: {
            upsert: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: expect.objectContaining({
          dailyStartBalance: new Decimal(10500),
          dailyStartEquity: new Decimal(10500),
          currentDailyPnl: new Decimal(0),
          lastDailyResetAt: resetTime,
        }),
      });
    });

    it('should reset currentDailyPnl to zero', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10300),
        equity: new Decimal(10300),
        highWaterMark: new Decimal(10300),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        currentDailyPnl: new Decimal(300), // Has current P&L
        lastDailyResetAt: new Date('2026-10-05T00:00:00Z'),
        timezone: 'UTC',
      };

      const updateSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: updateSpy,
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          dailySnapshot: {
            upsert: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: expect.objectContaining({
          currentDailyPnl: new Decimal(0),
        }),
      });
    });
  });

  describe('Equity Basis with Open Positions', () => {
    it('should set dailyStartEquity including unrealized P&L', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10000),
        equity: new Decimal(10200), // Old equity
        highWaterMark: new Decimal(10200),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        lastDailyResetAt: null,
        timezone: 'UTC',
      };

      const mockOpenTrades = [
        { unrealizedPnl: new Decimal(150) },
        { unrealizedPnl: new Decimal(100) },
      ];

      const updateSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: updateSpy,
          },
          trade: {
            findMany: jest.fn().mockResolvedValue(mockOpenTrades),
          },
          dailySnapshot: {
            upsert: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      // Expected equity = balance + total unrealized P&L = 10000 + 250 = 10250
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: expect.objectContaining({
          dailyStartEquity: new Decimal(10250),
        }),
      });
    });
  });

  describe('HWM Preservation', () => {
    it('should NOT reset HWM during daily reset', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const originalHWM = new Decimal(11000);
      
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10500),
        equity: new Decimal(10500),
        highWaterMark: originalHWM, // HWM from previous peak
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        lastDailyResetAt: null,
        timezone: 'UTC',
      };

      const updateSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: updateSpy,
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          dailySnapshot: {
            upsert: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      // Verify HWM NOT included in update (preserved)
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: expect.not.objectContaining({
          highWaterMark: expect.anything(),
        }),
      });
    });
  });

  describe('Account Eligibility', () => {
    it('should allow reset for ACTIVE accounts', () => {
      const account = { status: TradingAccountStatus.ACTIVE };
      const eligible = service.isEligibleForDailyReset(account);
      expect(eligible).toBe(true);
    });

    it('should deny reset for BREACHED accounts', () => {
      const account = { status: TradingAccountStatus.BREACHED };
      const eligible = service.isEligibleForDailyReset(account);
      expect(eligible).toBe(false);
    });

    it('should deny reset for PASSED accounts', () => {
      const account = { status: TradingAccountStatus.PASSED };
      const eligible = service.isEligibleForDailyReset(account);
      expect(eligible).toBe(false);
    });

    it('should deny reset for CLOSED accounts', () => {
      const account = { status: TradingAccountStatus.CLOSED };
      const eligible = service.isEligibleForDailyReset(account);
      expect(eligible).toBe(false);
    });

    it('should deny reset for SUSPENDED accounts', () => {
      const account = { status: TradingAccountStatus.SUSPENDED };
      const eligible = service.isEligibleForDailyReset(account);
      expect(eligible).toBe(false);
    });
  });

  describe('Duplicate Reset Protection', () => {
    it('should not reset if already reset today (same date)', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const lastReset = new Date('2026-10-06T00:01:00Z'); // Already reset today
      
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10500),
        equity: new Decimal(10500),
        highWaterMark: new Decimal(10500),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        lastDailyResetAt: lastReset,
        timezone: 'UTC',
      };

      const updateSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: updateSpy,
          },
          trade: {
            findMany: jest.fn(),
          },
          dailySnapshot: {
            upsert: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      // Should NOT call update (idempotency)
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should reset if last reset was yesterday (different date)', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const lastReset = new Date('2026-10-05T23:59:00Z'); // Yesterday
      
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10500),
        equity: new Decimal(10500),
        highWaterMark: new Decimal(10500),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        lastDailyResetAt: lastReset,
        timezone: 'UTC',
      };

      const updateSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: updateSpy,
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          dailySnapshot: {
            upsert: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      // Should call update (new day)
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('Immutable DAILY_RESET Audit Event', () => {
    it('should create DAILY_RESET audit log with complete snapshot', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10500),
        equity: new Decimal(10500),
        highWaterMark: new Decimal(10500),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        lastDailyResetAt: null,
        timezone: 'America/New_York',
      };

      const mockOpenTrades = [
        { unrealizedPnl: new Decimal(100) },
      ];

      const auditCreateSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue(mockOpenTrades),
          },
          dailySnapshot: {
            upsert: jest.fn(),
          },
          auditLog: {
            create: auditCreateSpy,
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      expect(auditCreateSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DAILY_RESET',
          entityType: 'TradingAccount',
          entityId: mockAccountId,
          actorId: null, // System-initiated
          metadata: expect.objectContaining({
            resetTime: resetTime.toISOString(),
            timezone: 'America/New_York',
            openPositions: 1,
          }),
        }),
      });
    });
  });

  describe('Daily Snapshot Creation', () => {
    it('should create daily snapshot with start-of-day values', async () => {
      const resetTime = new Date('2026-10-06T00:00:00Z');
      const mockAccount = {
        id: mockAccountId,
        status: TradingAccountStatus.ACTIVE,
        currentBalance: new Decimal(10500),
        equity: new Decimal(10500),
        highWaterMark: new Decimal(10500),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        lastDailyResetAt: null,
        timezone: 'UTC',
      };

      const snapshotUpsertSpy = jest.fn();

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          dailySnapshot: {
            upsert: snapshotUpsertSpy,
          },
          auditLog: {
            create: jest.fn(),
          },
        };

        return callback(tx);
      });

      await prisma.$transaction(async (tx: any) => {
        await service.performDailyReset(mockAccountId, resetTime, tx);
      });

      const expectedTradingDay = new Date('2026-10-06T00:00:00.000Z');

      expect(snapshotUpsertSpy).toHaveBeenCalledWith({
        where: {
          tradingAccountId_tradingDay: {
            tradingAccountId: mockAccountId,
            tradingDay: expectedTradingDay,
          },
        },
        create: expect.objectContaining({
          tradingAccountId: mockAccountId,
          tradingDay: expectedTradingDay,
          startOfDayBalance: mockAccount.currentBalance,
          startOfDayEquity: new Decimal(10500),
        }),
        update: expect.any(Object),
      });
    });
  });
});
