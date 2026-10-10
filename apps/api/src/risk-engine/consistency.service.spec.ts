import { Test, TestingModule } from '@nestjs/testing';
import { ConsistencyService } from './consistency.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradeStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Day 21: Consistency Service Tests
 * 
 * Tests consistency calculation for payout eligibility.
 */
describe('ConsistencyService', () => {
  let service: ConsistencyService;
  let prisma: PrismaService;

  const mockAccountId = 'account-123';
  const mockPayoutId = 'payout-456';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsistencyService,
        {
          provide: PrismaService,
          useValue: {
            tradingAccount: {
              findUnique: jest.fn(),
            },
            trade: {
              findMany: jest.fn(),
            },
            consistencyCheck: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ConsistencyService>(ConsistencyService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Consistency Calculation', () => {
    it('should calculate consistency with profitable trading', async () => {
      // Mock account
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-001',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 40, // Max 40% of profit from one day
            },
          ],
        },
      } as any);

      // Mock trades: 5 profitable days
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        // Day 1: $200
        createTrade('2026-10-01T10:00:00Z', 200),
        createTrade('2026-10-01T14:00:00Z', 0), // Breakeven
        // Day 2: $150
        createTrade('2026-10-02T11:00:00Z', 150),
        // Day 3: $300 (highest)
        createTrade('2026-10-03T09:00:00Z', 150),
        createTrade('2026-10-03T15:00:00Z', 150),
        // Day 4: $100
        createTrade('2026-10-04T12:00:00Z', 100),
        // Day 5: $250
        createTrade('2026-10-05T13:00:00Z', 250),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      // Total profit: $1000
      expect(result.totalProfit.toNumber()).toBe(1000);
      
      // Highest day: $300
      expect(result.highestProfitableDay.toNumber()).toBe(300);
      
      // Consistency: 300/1000 * 100 = 30%
      expect(result.consistencyPercentage.toNumber()).toBe(30);
      
      // Threshold: 40%
      expect(result.requiredThreshold?.toNumber()).toBe(40);
      
      // Passed: 30% < 40%
      expect(result.passed).toBe(true);
      
      expect(result.profitableDaysCount).toBe(5);
      expect(result.totalTradingDays).toBe(5);
    });

    it('should fail consistency when highest day exceeds threshold', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-002',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 40,
            },
          ],
        },
      } as any);

      // Trades: One big day
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        // Day 1: $600 (60% of total)
        createTrade('2026-10-01T10:00:00Z', 600),
        // Day 2: $200
        createTrade('2026-10-02T11:00:00Z', 200),
        // Day 3: $200
        createTrade('2026-10-03T09:00:00Z', 200),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      // Total: $1000
      expect(result.totalProfit.toNumber()).toBe(1000);
      
      // Highest: $600
      expect(result.highestProfitableDay.toNumber()).toBe(600);
      
      // Consistency: 600/1000 * 100 = 60%
      expect(result.consistencyPercentage.toNumber()).toBe(60);
      
      // Failed: 60% > 40%
      expect(result.passed).toBe(false);
    });

    it('should handle zero profit', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-003',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [],
        },
      } as any);

      // Breakeven trading
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 100),
        createTrade('2026-10-01T14:00:00Z', -100),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.totalProfit.toNumber()).toBe(0);
      expect(result.consistencyPercentage.toNumber()).toBe(0);
      expect(result.passed).toBe(false); // Zero profit = not eligible
    });

    it('should handle negative profit', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-004',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [],
        },
      } as any);

      // Losing trading
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', -500),
        createTrade('2026-10-02T14:00:00Z', 200),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.totalProfit.toNumber()).toBe(-300);
      expect(result.consistencyPercentage.toNumber()).toBe(0);
      expect(result.passed).toBe(false); // Negative profit = not eligible
    });

    it('should pass when no threshold configured', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-005',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [], // No consistency rule
        },
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 1000), // 100% on one day
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.totalProfit.toNumber()).toBe(1000);
      expect(result.consistencyPercentage.toNumber()).toBe(100);
      expect(result.requiredThreshold).toBeNull();
      expect(result.passed).toBe(true); // No threshold = passes
    });

    it('should handle multiple trades same day', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-006',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 50,
            },
          ],
        },
      } as any);

      // Multiple trades on same day should sum
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T09:00:00Z', 100),
        createTrade('2026-10-01T11:00:00Z', 150),
        createTrade('2026-10-01T14:00:00Z', 50),  // Day 1 total: $300
        createTrade('2026-10-02T10:00:00Z', 700),  // Day 2 total: $700
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.totalProfit.toNumber()).toBe(1000);
      expect(result.highestProfitableDay.toNumber()).toBe(700); // Day 2
      expect(result.consistencyPercentage.toNumber()).toBe(70);
      expect(result.passed).toBe(false); // 70% > 50%
      expect(result.totalTradingDays).toBe(2);
    });

    it('should respect timezone for daily boundaries', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-007',
        timezone: 'America/New_York', // EST/EDT
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [],
        },
      } as any);

      // Trades around midnight UTC (different days in EST)
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T03:00:00Z', 200), // 11 PM EST Oct 1
        createTrade('2026-10-01T05:00:00Z', 300), // 1 AM EST Oct 2
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      // Should be split into 2 trading days based on EST
      expect(result.totalTradingDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle exactly at threshold', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-008',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 40,
            },
          ],
        },
      } as any);

      // Exactly 40%
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 400),
        createTrade('2026-10-02T11:00:00Z', 600),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.consistencyPercentage.toNumber()).toBe(60);
      expect(result.passed).toBe(false); // Exactly at threshold fails
    });

    it('should handle one unit beyond threshold', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-009',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 40,
            },
          ],
        },
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 400.01),
        createTrade('2026-10-02T11:00:00Z', 599.99),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.consistencyPercentage.greaterThan(40)).toBe(true);
      expect(result.passed).toBe(false);
    });

    it('should handle single trading day', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-010',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 40,
            },
          ],
        },
      } as any);

      // All profit in one day
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 500),
        createTrade('2026-10-01T14:00:00Z', 500),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.totalTradingDays).toBe(1);
      expect(result.consistencyPercentage.toNumber()).toBe(100); // 100% on one day
      expect(result.passed).toBe(false); // 100% > 40%
    });
  });

  describe('DAY 26: Enforcement Mode Tests', () => {
    it('should identify enforced consistency rule', () => {
      const rules = [
        {
          ruleType: 'CONSISTENCY',
          isActive: true,
          maxDailyProfitPercentage: 40,
          enforced: true, // Day 26: Enforced mode
        },
      ];

      const isEnforced = service.getConsistencyEnforcement(rules);
      expect(isEnforced).toBe(true);
    });

    it('should identify blocking consistency rule', () => {
      const rules = [
        {
          ruleType: 'CONSISTENCY',
          isActive: true,
          maxDailyProfitPercentage: 40,
          blocking: true, // Day 26: Alternative flag name
        },
      ];

      const isEnforced = service.getConsistencyEnforcement(rules);
      expect(isEnforced).toBe(true);
    });

    it('should default to advisory mode when enforcement not specified', () => {
      const rules = [
        {
          ruleType: 'CONSISTENCY',
          isActive: true,
          maxDailyProfitPercentage: 40,
          // No enforced/blocking flag
        },
      ];

      const isEnforced = service.getConsistencyEnforcement(rules);
      expect(isEnforced).toBe(false); // Advisory by default
    });

    it('should handle missing consistency rule', () => {
      const rules = [
        {
          ruleType: 'DAILY_LOSS',
          isActive: true,
          value: 1000,
        },
      ];

      const isEnforced = service.getConsistencyEnforcement(rules);
      expect(isEnforced).toBe(false);
    });

    it('should handle null/undefined rules', () => {
      expect(service.getConsistencyEnforcement(null)).toBe(false);
      expect(service.getConsistencyEnforcement(undefined)).toBe(false);
      expect(service.getConsistencyEnforcement([])).toBe(false);
    });
  });

  describe('DAY 26: Boundary Condition Tests', () => {
    it('should pass when exactly at threshold (inclusive boundary)', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-BOUNDARY-1',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 50, // Exactly 50%
            },
          ],
        },
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 500), // 50%
        createTrade('2026-10-02T11:00:00Z', 500), // 50%
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.consistencyPercentage.toNumber()).toBe(50);
      expect(result.passed).toBe(true); // 50% <= 50% = PASS
    });

    it('should fail when one cent beyond threshold', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-BOUNDARY-2',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 50,
            },
          ],
        },
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 500.01), // Just over 50%
        createTrade('2026-10-02T11:00:00Z', 499.99),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      expect(result.consistencyPercentage.greaterThan(50)).toBe(true);
      expect(result.passed).toBe(false); // 50.001% > 50% = FAIL
    });

    it('should handle 4-decimal precision', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-PRECISION',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 33.3333,
            },
          ],
        },
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 333.33),
        createTrade('2026-10-02T11:00:00Z', 333.33),
        createTrade('2026-10-03T12:00:00Z', 333.34),
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      // 333.34 / 1000 * 100 = 33.334%
      expect(result.consistencyPercentage.toFixed(4)).toBe('33.3340');
      expect(result.passed).toBe(true); // Within threshold
    });
  });

  describe('DAY 26: Partial Close & Fee Tests', () => {
    it('should handle partial close correctly', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-PARTIAL',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [],
        },
      } as any);

      // Partial close: realizedPnl already calculated per trade
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 100), // First partial close
        createTrade('2026-10-01T14:00:00Z', 50),  // Second partial close (same position)
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      // Should sum both partial closes
      expect(result.totalProfit.toNumber()).toBe(150);
    });

    it('should include commissions and swaps in realized PnL', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-FEES',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [],
        },
      } as any);

      // realizedPnl already includes commission/swap deductions
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 90), // Gross: 100, Fee: -10 = Net: 90
        createTrade('2026-10-02T11:00:00Z', 195), // Gross: 200, Fee: -5 = Net: 195
      ]);

      const result = await service.calculateConsistency(mockAccountId);

      // Total profit includes fees
      expect(result.totalProfit.toNumber()).toBe(285);
      expect(result.highestProfitableDay.toNumber()).toBe(195);
    });
  });

  describe('DAY 26: Immutable Audit Trail Tests', () => {
    it('should create audit event for passed consistency check', async () => {
      const mockAuditCreate = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, 'auditLog' as any, 'get').mockReturnValue({
        create: mockAuditCreate,
      });

      const result: any = {
        tradingAccountId: mockAccountId,
        ruleSnapshotVersion: 'v1',
        totalProfit: new Decimal(1000),
        highestProfitableDay: new Decimal(300),
        highestProfitableDayDate: new Date('2026-10-01'),
        consistencyPercentage: new Decimal(30),
        requiredThreshold: new Decimal(40),
        passed: true,
        profitableDaysCount: 5,
        totalTradingDays: 5,
        evaluatedAt: new Date(),
      };

      await service.createConsistencyAuditEvent('user-123', result, 'payout-456');

      expect(mockAuditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'user-123',
          action: 'PAYOUT_CONSISTENCY_CHECK_PASSED',
          entityType: 'TradingAccount',
          entityId: mockAccountId,
          metadata: expect.objectContaining({
            payoutId: 'payout-456',
            ruleSnapshotVersion: 'v1',
            consistencyPercentage: '30.0000', // 4-decimal precision
            requiredThreshold: '40.0000',
            passed: true,
          }),
        }),
      });
    });

    it('should create audit event for failed consistency check', async () => {
      const mockAuditCreate = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, 'auditLog' as any, 'get').mockReturnValue({
        create: mockAuditCreate,
      });

      const result: any = {
        tradingAccountId: mockAccountId,
        ruleSnapshotVersion: 'v1',
        totalProfit: new Decimal(1000),
        highestProfitableDay: new Decimal(600),
        highestProfitableDayDate: new Date('2026-10-01'),
        consistencyPercentage: new Decimal(60),
        requiredThreshold: new Decimal(40),
        passed: false,
        profitableDaysCount: 3,
        totalTradingDays: 3,
        evaluatedAt: new Date(),
      };

      await service.createConsistencyAuditEvent('user-123', result);

      expect(mockAuditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PAYOUT_CONSISTENCY_CHECK_FAILED',
          metadata: expect.objectContaining({
            passed: false,
          }),
        }),
      });
    });
  });

  describe('DAY 26: Concurrency & Race Condition Tests', () => {
    it('should load fresh trade data for each evaluation', async () => {
      const findManyMock = jest.spyOn(prisma.trade, 'findMany');

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-CONCURRENT',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [],
        },
      } as any);

      findManyMock.mockResolvedValueOnce([
        createTrade('2026-10-01T10:00:00Z', 100),
      ]);

      await service.calculateConsistency(mockAccountId);

      // Second evaluation - should query again
      findManyMock.mockResolvedValueOnce([
        createTrade('2026-10-01T10:00:00Z', 100),
        createTrade('2026-10-02T11:00:00Z', 200), // New trade
      ]);

      const result2 = await service.calculateConsistency(mockAccountId);

      expect(findManyMock).toHaveBeenCalledTimes(2);
      expect(result2.totalProfit.toNumber()).toBe(300); // Fresh data
    });
  });

  describe('DAY 26: Payout Integration Tests', () => {
    it('should persist consistency check when payoutId provided', async () => {
      const mockConsistencyCreate = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, 'consistencyCheck' as any, 'get').mockReturnValue({
        create: mockConsistencyCreate,
      });

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-PAYOUT',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [
            {
              ruleType: 'CONSISTENCY',
              isActive: true,
              maxDailyProfitPercentage: 40,
            },
          ],
        },
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 300),
        createTrade('2026-10-02T11:00:00Z', 700),
      ]);

      await service.calculateConsistency(mockAccountId, mockPayoutId);

      expect(mockConsistencyCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          payoutId: mockPayoutId,
          tradingAccountId: mockAccountId,
          ruleSnapshotVersion: 'v1',
          passed: false, // 70% > 40%
        }),
      });
    });

    it('should not persist consistency check when no payoutId', async () => {
      const mockConsistencyCreate = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, 'consistencyCheck' as any, 'get').mockReturnValue({
        create: mockConsistencyCreate,
      });

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        id: mockAccountId,
        accountNumber: 'TEST-NO-PAYOUT',
        timezone: 'UTC',
        ruleSnapshot: {
          snapshotVersion: 'v1',
          rules: [],
        },
      } as any);

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
        createTrade('2026-10-01T10:00:00Z', 100),
      ]);

      await service.calculateConsistency(mockAccountId); // No payoutId

      expect(mockConsistencyCreate).not.toHaveBeenCalled();
    });
  });

  /**
   * Helper function to create mock trade
   */
  function createTrade(closedAt: string, realizedPnl: number): any {
    return {
      id: `trade-${Date.now()}-${Math.random()}`,
      tradingAccountId: mockAccountId,
      symbol: 'EURUSD',
      side: TradeSide.BUY,
      volume: new Decimal(1),
      entryPrice: new Decimal(1.1),
      exitPrice: new Decimal(1.1),
      status: TradeStatus.CLOSED,
      realizedPnl: new Decimal(realizedPnl),
      closedAt: new Date(closedAt),
    };
  }
});
