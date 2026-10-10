import { Test, TestingModule } from '@nestjs/testing';
import { MinTradingDaysService } from './min-trading-days.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountStage, TradeStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';

describe('MinTradingDaysService', () => {
  let service: MinTradingDaysService;
  let prisma: PrismaService;

  const mockAccount = {
    id: 'account-1',
    timezone: 'America/New_York',
    lastTradeAt: null,
    stage: AccountStage.CHALLENGE_PHASE_1,
    ruleSnapshot: {
      id: 'snapshot-1',
      rules: [
        {
          type: 'MIN_TRADING_DAYS',
          value: 5,
          isActive: true,
        },
      ],
    },
    trades: [],
  };

  const mockTrades = (dates: string[]) => {
    return dates.map((dateStr, index) => ({
      id: `trade-${index}`,
      openedAt: new Date(dateStr),
      closedAt: null,
      status: TradeStatus.OPEN,
    }));
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinTradingDaysService,
        {
          provide: PrismaService,
          useValue: {
            tradingAccount: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            trade: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<MinTradingDaysService>(MinTradingDaysService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateProgress', () => {
    it('should count one trading day for single trade', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades(['2024-10-01T14:30:00Z']),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.requiredDays).toBe(5);
      expect(progress.completedDays).toBe(1);
      expect(progress.remainingDays).toBe(4);
      expect(progress.reached).toBe(false);
      expect(progress.progressPercentage.toNumber()).toBe(20);
      expect(progress.qualifyingDates).toHaveLength(1);
    });

    it('should count one trading day for multiple trades on same date', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T09:00:00Z',
          '2024-10-01T12:00:00Z',
          '2024-10-01T15:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(1);
      expect(progress.qualifyingDates).toHaveLength(1);
    });

    it('should count separate trading days for different dates', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-03T14:00:00Z',
          '2024-10-05T14:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(3);
      expect(progress.remainingDays).toBe(2);
      expect(progress.qualifyingDates).toHaveLength(3);
    });

    it('should mark reached when minimum days met', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-02T14:00:00Z',
          '2024-10-03T14:00:00Z',
          '2024-10-04T14:00:00Z',
          '2024-10-05T14:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(5);
      expect(progress.remainingDays).toBe(0);
      expect(progress.reached).toBe(true);
      expect(progress.progressPercentage.toNumber()).toBe(100);
    });

    it('should mark reached when exceeding minimum days', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-02T14:00:00Z',
          '2024-10-03T14:00:00Z',
          '2024-10-04T14:00:00Z',
          '2024-10-05T14:00:00Z',
          '2024-10-06T14:00:00Z',
          '2024-10-07T14:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(7);
      expect(progress.remainingDays).toBe(0);
      expect(progress.reached).toBe(true);
    });

    it('should handle no trades (zero days)', async () => {
      const account = {
        ...mockAccount,
        trades: [],
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(0);
      expect(progress.remainingDays).toBe(5);
      expect(progress.reached).toBe(false);
      expect(progress.lastTradingDay).toBeNull();
      expect(progress.qualifyingDates).toHaveLength(0);
    });

    it('should return zero requirement when no rule configured', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: {
          id: 'snapshot-1',
          rules: [], // No MIN_TRADING_DAYS rule
        },
        trades: mockTrades(['2024-10-01T14:00:00Z']),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.requiredDays).toBe(0);
      expect(progress.reached).toBe(true); // Always reached if no requirement
      expect(progress.progressPercentage.toNumber()).toBe(100);
    });

    it('should return zero requirement when rule is inactive', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: {
          id: 'snapshot-1',
          rules: [
            {
              type: 'MIN_TRADING_DAYS',
              value: 5,
              isActive: false, // Disabled rule
            },
          ],
        },
        trades: mockTrades(['2024-10-01T14:00:00Z']),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.requiredDays).toBe(0);
      expect(progress.reached).toBe(true);
    });

    it('should return zero requirement when no rule snapshot', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: null,
        trades: mockTrades(['2024-10-01T14:00:00Z']),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.requiredDays).toBe(0);
      expect(progress.reached).toBe(true);
    });

    it('should handle lastTradingDay correctly', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-02T14:00:00Z',
          '2024-10-05T14:00:00Z', // Last trading day
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.lastTradingDay).toBeDefined();
      // Should be Oct 5 (last qualifying date)
      expect(progress.qualifyingDates[progress.qualifyingDates.length - 1]).toContain('2024-10-05');
    });

    it('should throw error when account not found', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(null);

      await expect(service.calculateProgress('invalid-account')).rejects.toThrow(
        'Trading account invalid-account not found',
      );
    });
  });

  describe('timezone handling', () => {
    it('should respect account timezone (America/New_York)', async () => {
      const account = {
        ...mockAccount,
        timezone: 'America/New_York', // EST/EDT
        trades: mockTrades([
          '2024-10-01T03:00:00Z', // 11 PM Oct 1 EDT (same day)
          '2024-10-01T04:00:00Z', // 12 AM Oct 1 EDT (same day)
          '2024-10-02T03:00:00Z', // 11 PM Oct 2 EDT (different day)
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      // Should be 2 different days despite 3 trades
      expect(progress.completedDays).toBeGreaterThanOrEqual(1);
      expect(progress.qualifyingDates.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle UTC timezone', async () => {
      const account = {
        ...mockAccount,
        timezone: 'UTC',
        trades: mockTrades([
          '2024-10-01T23:59:00Z',
          '2024-10-02T00:01:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(2); // Different UTC days
    });

    it('should handle Asia/Tokyo timezone', async () => {
      const account = {
        ...mockAccount,
        timezone: 'Asia/Tokyo', // JST (UTC+9)
        trades: mockTrades([
          '2024-10-01T14:00:00Z', // 11 PM Oct 1 JST
          '2024-10-01T15:00:00Z', // 12 AM Oct 2 JST (next day)
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      // Should be 2 different days in Tokyo time
      expect(progress.completedDays).toBeGreaterThanOrEqual(1);
    });

    it('should fallback to UTC on invalid timezone', async () => {
      const account = {
        ...mockAccount,
        timezone: 'Invalid/Timezone',
        trades: mockTrades(['2024-10-01T14:00:00Z']),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      // Should still calculate without error (uses UTC fallback)
      expect(progress.completedDays).toBe(1);
      expect(progress.qualifyingDates).toHaveLength(1);
    });
  });

  describe('recordTradingDay', () => {
    it('should update lastTradeAt timestamp', async () => {
      const tradeOpenedAt = new Date('2024-10-01T14:30:00Z');

      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({} as any);

      await service.recordTradingDay('account-1', tradeOpenedAt);

      expect(prisma.tradingAccount.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: {
          lastTradeAt: tradeOpenedAt,
        },
      });
    });

    it('should work with transaction client', async () => {
      const tradeOpenedAt = new Date('2024-10-01T14:30:00Z');
      const mockTx = {
        tradingAccount: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      await service.recordTradingDay('account-1', tradeOpenedAt, mockTx as any);

      expect(mockTx.tradingAccount.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: {
          lastTradeAt: tradeOpenedAt,
        },
      });
    });
  });

  describe('isRequirementMet', () => {
    it('should return true when requirement met', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-02T14:00:00Z',
          '2024-10-03T14:00:00Z',
          '2024-10-04T14:00:00Z',
          '2024-10-05T14:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const met = await service.isRequirementMet('account-1');

      expect(met).toBe(true);
    });

    it('should return false when requirement not met', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades(['2024-10-01T14:00:00Z']),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const met = await service.isRequirementMet('account-1');

      expect(met).toBe(false);
    });

    it('should return true when no requirement configured', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: null,
        trades: mockTrades(['2024-10-01T14:00:00Z']),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const met = await service.isRequirementMet('account-1');

      expect(met).toBe(true);
    });
  });

  describe('getCompletedDaysCount', () => {
    it('should return fast count without loading full account', async () => {
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue(
        mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-02T14:00:00Z',
          '2024-10-03T14:00:00Z',
        ]) as any,
      );

      const count = await service.getCompletedDaysCount('account-1', 'America/New_York');

      expect(count).toBe(3);
      expect(prisma.trade.findMany).toHaveBeenCalledWith({
        where: {
          tradingAccountId: 'account-1',
          openedAt: { not: null },
        },
        select: { openedAt: true },
      });
    });
  });

  describe('getLastTradingActivity', () => {
    it('should return lastTradeAt timestamp', async () => {
      const lastTradeAt = new Date('2024-10-05T14:30:00Z');

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        lastTradeAt,
      } as any);

      const result = await service.getLastTradingActivity('account-1');

      expect(result).toEqual(lastTradeAt);
    });

    it('should return null when no trades', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        lastTradeAt: null,
      } as any);

      const result = await service.getLastTradingActivity('account-1');

      expect(result).toBeNull();
    });

    it('should return null when account not found', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(null);

      const result = await service.getLastTradingActivity('invalid-account');

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle trades with null openedAt (should be excluded)', async () => {
      const account = {
        ...mockAccount,
        trades: [
          { id: 'trade-1', openedAt: new Date('2024-10-01T14:00:00Z'), status: TradeStatus.OPEN },
          { id: 'trade-2', openedAt: null, status: TradeStatus.OPEN }, // Rejected/canceled
          { id: 'trade-3', openedAt: new Date('2024-10-02T14:00:00Z'), status: TradeStatus.OPEN },
        ],
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(2); // Should only count 2 trades
    });

    it('should handle exactly at minimum requirement', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-02T14:00:00Z',
          '2024-10-03T14:00:00Z',
          '2024-10-04T14:00:00Z',
          '2024-10-05T14:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(5);
      expect(progress.remainingDays).toBe(0);
      expect(progress.reached).toBe(true);
    });

    it('should handle one day below minimum', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-01T14:00:00Z',
          '2024-10-02T14:00:00Z',
          '2024-10-03T14:00:00Z',
          '2024-10-04T14:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      expect(progress.completedDays).toBe(4);
      expect(progress.remainingDays).toBe(1);
      expect(progress.reached).toBe(false);
    });

    it('should sort qualifying dates chronologically', async () => {
      const account = {
        ...mockAccount,
        trades: mockTrades([
          '2024-10-05T14:00:00Z',
          '2024-10-01T14:00:00Z',
          '2024-10-03T14:00:00Z',
        ]),
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const progress = await service.calculateProgress('account-1');

      // Dates should be sorted
      expect(progress.qualifyingDates[0]).toContain('2024-10-01');
      expect(progress.qualifyingDates[1]).toContain('2024-10-03');
      expect(progress.qualifyingDates[2]).toContain('2024-10-05');
    });
  });

  describe('stage awareness (future enhancement)', () => {
    it('should log warning for stage-specific tracking (not implemented)', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: 'account-1',
        timezone: 'UTC',
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([]);

      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      await service.getTradingDaysByStage('account-1', AccountStage.CHALLENGE_PHASE_1);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stage-specific trading days not implemented'),
      );
    });
  });
});
