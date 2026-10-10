import { Test, TestingModule } from '@nestjs/testing';
import { InactivityService } from './inactivity.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus } from '@prisma/client';

describe('InactivityService', () => {
  let service: InactivityService;
  let prisma: PrismaService;

  const mockAccount = {
    id: 'account-1',
    accountNumber: 'ACC-001234',
    timezone: 'America/New_York',
    status: TradingAccountStatus.ACTIVE,
    lastTradeAt: null,
    ruleSnapshot: {
      id: 'snapshot-1',
      rules: [
        {
          type: 'INACTIVITY_DAYS',
          value: 30,
          isActive: true,
        },
      ],
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InactivityService,
        {
          provide: PrismaService,
          useValue: {
            tradingAccount: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<InactivityService>(InactivityService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateInactivity', () => {
    it('should return not enabled when inactivity not configured', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: {
          id: 'snapshot-1',
          rules: [], // No inactivity rule
        },
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(false);
      expect(result.inactivityDays).toBeNull();
      expect(result.isInactive).toBe(false);
    });

    it('should return not enabled when inactivity rule is inactive', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: {
          id: 'snapshot-1',
          rules: [
            {
              type: 'INACTIVITY_DAYS',
              value: 30,
              isActive: false, // Disabled
            },
          ],
        },
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(false);
      expect(result.isInactive).toBe(false);
    });

    it('should return not enabled when inactivity days is 0', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: {
          id: 'snapshot-1',
          rules: [
            {
              type: 'INACTIVITY_DAYS',
              value: 0, // Zero days = disabled
              isActive: true,
            },
          ],
        },
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(false);
      expect(result.isInactive).toBe(false);
    });

    it('should return null daysSinceLastTrade when no trades', async () => {
      const account = {
        ...mockAccount,
        lastTradeAt: null,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(true);
      expect(result.inactivityDays).toBe(30);
      expect(result.daysSinceLastTrade).toBeNull();
      expect(result.isInactive).toBe(false); // Can't be inactive with no trades
    });

    it('should calculate days since last trade correctly', async () => {
      const lastTradeAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      
      const account = {
        ...mockAccount,
        lastTradeAt,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(true);
      expect(result.inactivityDays).toBe(30);
      expect(result.daysSinceLastTrade).toBeGreaterThanOrEqual(14);
      expect(result.daysSinceLastTrade).toBeLessThanOrEqual(16);
      expect(result.isInactive).toBe(false); // Not reached 30 days
    });

    it('should mark as inactive when threshold reached', async () => {
      const lastTradeAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      
      const account = {
        ...mockAccount,
        lastTradeAt,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(true);
      expect(result.inactivityDays).toBe(30);
      expect(result.daysSinceLastTrade).toBeGreaterThanOrEqual(30);
      expect(result.isInactive).toBe(true); // Reached threshold
    });

    it('should mark as inactive at exact threshold', async () => {
      const lastTradeAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Exactly 30 days
      
      const account = {
        ...mockAccount,
        lastTradeAt,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(true);
      expect(result.inactivityDays).toBe(30);
      expect(result.isInactive).toBe(true); // >= threshold
    });

    it('should not mark as inactive one day before threshold', async () => {
      const lastTradeAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000); // 29 days ago
      
      const account = {
        ...mockAccount,
        lastTradeAt,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(true);
      expect(result.inactivityDays).toBe(30);
      expect(result.isInactive).toBe(false); // Not yet reached
    });

    it('should throw error when account not found', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(null);

      await expect(service.evaluateInactivity('invalid-account')).rejects.toThrow(
        'Trading account invalid-account not found',
      );
    });

    it('should respect account timezone', async () => {
      const lastTradeAt = new Date('2024-10-01T23:00:00Z'); // 7PM EST
      
      const account = {
        ...mockAccount,
        timezone: 'America/New_York',
        lastTradeAt,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.timezone).toBe('America/New_York');
      expect(result.daysSinceLastTrade).toBeDefined();
    });

    it('should support different rule type names', async () => {
      const account = {
        ...mockAccount,
        ruleSnapshot: {
          id: 'snapshot-1',
          rules: [
            {
              type: 'INACTIVITY', // Alternative type name
              value: 14,
              isActive: true,
            },
          ],
        },
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.inactivityEnabled).toBe(true);
      expect(result.inactivityDays).toBe(14);
    });

    it('should handle recent trade (0 days)', async () => {
      const lastTradeAt = new Date(); // Just now
      
      const account = {
        ...mockAccount,
        lastTradeAt,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluateInactivity('account-1');

      expect(result.daysSinceLastTrade).toBe(0);
      expect(result.isInactive).toBe(false);
    });
  });

  describe('isStatusEvaluable', () => {
    it('should return true for ACTIVE status', () => {
      expect(service.isStatusEvaluable(TradingAccountStatus.ACTIVE)).toBe(true);
    });

    it('should return true for PENDING status', () => {
      expect(service.isStatusEvaluable(TradingAccountStatus.PENDING)).toBe(true);
    });

    it('should return true for SUSPENDED status', () => {
      expect(service.isStatusEvaluable(TradingAccountStatus.SUSPENDED)).toBe(true);
    });

    it('should return false for BREACHED status (terminal)', () => {
      expect(service.isStatusEvaluable(TradingAccountStatus.BREACHED)).toBe(false);
    });

    it('should return false for PASSED status (terminal)', () => {
      expect(service.isStatusEvaluable(TradingAccountStatus.PASSED)).toBe(false);
    });

    it('should return false for CLOSED status (terminal)', () => {
      expect(service.isStatusEvaluable(TradingAccountStatus.CLOSED)).toBe(false);
    });
  });

  describe('getAccountsForEvaluation', () => {
    it('should return accounts with inactivity rule enabled', async () => {
      const accounts = [
        {
          id: 'account-1',
          ruleSnapshot: {
            rules: [{ type: 'INACTIVITY_DAYS', value: 30, isActive: true }],
          },
        },
        {
          id: 'account-2',
          ruleSnapshot: {
            rules: [{ type: 'INACTIVITY_DAYS', value: 14, isActive: true }],
          },
        },
        {
          id: 'account-3',
          ruleSnapshot: {
            rules: [], // No inactivity rule
          },
        },
      ];

      jest.spyOn(prisma.tradingAccount, 'findMany').mockResolvedValue(accounts as any);

      const result = await service.getAccountsForEvaluation(10);

      expect(result).toHaveLength(2);
      expect(result).toContain('account-1');
      expect(result).toContain('account-2');
      expect(result).not.toContain('account-3');
    });

    it('should respect limit parameter', async () => {
      const accounts = Array.from({ length: 10 }, (_, i) => ({
        id: `account-${i}`,
        ruleSnapshot: {
          rules: [{ type: 'INACTIVITY_DAYS', value: 30, isActive: true }],
        },
      }));

      jest.spyOn(prisma.tradingAccount, 'findMany').mockResolvedValue(accounts as any);

      const result = await service.getAccountsForEvaluation(5);

      expect(result).toHaveLength(5);
    });

    it('should return empty array when no accounts eligible', async () => {
      jest.spyOn(prisma.tradingAccount, 'findMany').mockResolvedValue([]);

      const result = await service.getAccountsForEvaluation(10);

      expect(result).toHaveLength(0);
    });
  });

  describe('markAccountInactive', () => {
    const evaluation = {
      accountId: 'account-1',
      inactivityEnabled: true,
      inactivityDays: 30,
      lastTradeAt: new Date('2024-09-01'),
      daysSinceLastTrade: 35,
      isInactive: true,
      timezone: 'UTC',
      evaluatedAt: new Date(),
    };

    it('should update account status to SUSPENDED', async () => {
      const account = {
        ...mockAccount,
        status: TradingAccountStatus.ACTIVE,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);
      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({
        ...account,
        status: TradingAccountStatus.SUSPENDED,
      } as any);
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await service.markAccountInactive('account-1', evaluation);

      expect(prisma.tradingAccount.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: {
          status: TradingAccountStatus.SUSPENDED,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should create audit log', async () => {
      const account = {
        ...mockAccount,
        status: TradingAccountStatus.ACTIVE,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);
      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue(account as any);
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await service.markAccountInactive('account-1', evaluation);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: null,
          action: 'ACCOUNT_SUSPENDED_INACTIVITY',
          entityType: 'TradingAccount',
          entityId: 'account-1',
          metadata: expect.objectContaining({
            reason: 'INACTIVITY',
            inactivityDays: 30,
            daysSinceLastTrade: 35,
          }),
        },
      });
    });

    it('should not update terminal status accounts', async () => {
      const account = {
        ...mockAccount,
        status: TradingAccountStatus.BREACHED,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.markAccountInactive('account-1', evaluation);

      expect(prisma.tradingAccount.update).not.toHaveBeenCalled();
      expect(result.status).toBe(TradingAccountStatus.BREACHED);
    });

    it('should throw error when account not found', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(null);

      await expect(
        service.markAccountInactive('invalid-account', evaluation),
      ).rejects.toThrow('Trading account invalid-account not found');
    });
  });

  describe('shouldWarn', () => {
    it('should return false when inactivity not enabled', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.shouldWarn(evaluation)).toBe(false);
    });

    it('should return false when no trades yet', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.shouldWarn(evaluation)).toBe(false);
    });

    it('should return true at 80% threshold (24 of 30 days)', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-09-01'),
        daysSinceLastTrade: 24,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.shouldWarn(evaluation)).toBe(true);
    });

    it('should return false before 80% threshold', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-09-01'),
        daysSinceLastTrade: 20,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.shouldWarn(evaluation)).toBe(false);
    });

    it('should return false when already inactive', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-09-01'),
        daysSinceLastTrade: 35,
        isInactive: true,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.shouldWarn(evaluation)).toBe(false);
    });
  });

  describe('getDaysUntilInactive', () => {
    it('should return null when inactivity not enabled', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.getDaysUntilInactive(evaluation)).toBeNull();
    });

    it('should return full threshold when no trades', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.getDaysUntilInactive(evaluation)).toBe(30);
    });

    it('should calculate remaining days correctly', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-09-01'),
        daysSinceLastTrade: 20,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.getDaysUntilInactive(evaluation)).toBe(10);
    });

    it('should return 0 when at threshold', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-09-01'),
        daysSinceLastTrade: 30,
        isInactive: true,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.getDaysUntilInactive(evaluation)).toBe(0);
    });

    it('should return 0 when beyond threshold', () => {
      const evaluation = {
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-09-01'),
        daysSinceLastTrade: 35,
        isInactive: true,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      };

      expect(service.getDaysUntilInactive(evaluation)).toBe(0);
    });
  });
});
