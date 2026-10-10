import { Test, TestingModule } from '@nestjs/testing';
import { RuleSnapshotService } from './rule-snapshot.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('RuleSnapshotService - Rule Immutability Tests', () => {
  let service: RuleSnapshotService;
  let prisma: PrismaService;

  const mockPrismaService = {
    accountRuleSnapshot: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    ruleSet: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleSnapshotService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RuleSnapshotService>(RuleSnapshotService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rule Snapshot Creation', () => {
    it('should create rule snapshot on account creation', async () => {
      const mockRuleSet = {
        id: 'ruleset-1',
        name: 'Standard Challenge',
        ruleSetRules: [
          {
            rule: {
              id: 'rule-1',
              name: 'Daily Loss Limit',
              description: 'Maximum daily loss',
              type: 'DAILY_LOSS',
              value: 4,
              isPercentage: true,
              isActive: true,
            },
          },
          {
            rule: {
              id: 'rule-2',
              name: 'Max Drawdown',
              description: 'Maximum drawdown',
              type: 'MAX_DRAWDOWN',
              value: 8,
              isPercentage: true,
              isActive: true,
            },
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(null);
      mockPrismaService.ruleSet.findUnique.mockResolvedValue(mockRuleSet);
      mockPrismaService.accountRuleSnapshot.create.mockResolvedValue({});

      await service.createRuleSnapshot('account-1', 'ruleset-1');

      expect(mockPrismaService.accountRuleSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tradingAccountId: 'account-1',
            ruleSetId: 'ruleset-1',
            ruleSetName: 'Standard Challenge',
            rules: expect.arrayContaining([
              expect.objectContaining({
                id: 'rule-1',
                name: 'Daily Loss Limit',
                type: 'DAILY_LOSS',
                value: '4',
                isPercentage: true,
              }),
              expect.objectContaining({
                id: 'rule-2',
                name: 'Max Drawdown',
                type: 'MAX_DRAWDOWN',
                value: '8',
                isPercentage: true,
              }),
            ]),
          }),
        }),
      );
    });

    it('should prevent duplicate snapshots', async () => {
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue({
        id: 'snapshot-1',
        tradingAccountId: 'account-1',
      });

      await service.createRuleSnapshot('account-1', 'ruleset-1');

      expect(mockPrismaService.accountRuleSnapshot.create).not.toHaveBeenCalled();
    });

    it('should throw error if ruleSet not found', async () => {
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(null);
      mockPrismaService.ruleSet.findUnique.mockResolvedValue(null);

      await expect(
        service.createRuleSnapshot('account-1', 'invalid-ruleset'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Rule Immutability', () => {
    it('should return account-specific rules, not current plan rules', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        tradingAccountId: 'account-1',
        ruleSetId: 'ruleset-1',
        ruleSetName: 'Standard Challenge',
        snapshotVersion: '2026-10-01T00:00:00.000Z',
        rules: [
          {
            id: 'rule-1',
            name: 'Daily Loss Limit',
            type: 'DAILY_LOSS',
            value: '4',
            isPercentage: true,
          },
          {
            id: 'rule-2',
            name: 'Max Drawdown',
            type: 'MAX_DRAWDOWN',
            value: '8',
            isPercentage: true,
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const result = await service.getAccountRules('account-1');

      expect(result).toEqual(mockSnapshot);
      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].value).toBe('4'); // Original value, not modified
    });

    it('should detect differences between snapshot and current plan', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        tradingAccountId: 'account-1',
        ruleSetId: 'ruleset-1',
        snapshotVersion: '2026-10-01T00:00:00.000Z',
        rules: [
          {
            id: 'rule-1',
            name: 'Daily Loss Limit',
            type: 'DAILY_LOSS',
            value: '4',
            isPercentage: true,
          },
        ],
      };

      const mockCurrentRuleSet = {
        id: 'ruleset-1',
        ruleSetRules: [
          {
            rule: {
              id: 'rule-1',
              name: 'Daily Loss Limit',
              type: 'DAILY_LOSS',
              value: 3, // Changed from 4 to 3
              isPercentage: true,
            },
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);
      mockPrismaService.ruleSet.findUnique.mockResolvedValue(mockCurrentRuleSet);

      const result = await service.compareWithCurrentPlan('account-1');

      expect(result.hasDifferences).toBe(true);
      expect(result.message).toContain('differ from current plan');
    });

    it('should confirm no differences when snapshot matches current plan', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        tradingAccountId: 'account-1',
        ruleSetId: 'ruleset-1',
        snapshotVersion: '2026-10-01T00:00:00.000Z',
        rules: [
          {
            id: 'rule-1',
            name: 'Daily Loss Limit',
            type: 'DAILY_LOSS',
            value: '4',
            isPercentage: true,
          },
        ],
      };

      const mockCurrentRuleSet = {
        id: 'ruleset-1',
        ruleSetRules: [
          {
            rule: {
              id: 'rule-1',
              name: 'Daily Loss Limit',
              type: 'DAILY_LOSS',
              value: 4,
              isPercentage: true,
            },
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);
      mockPrismaService.ruleSet.findUnique.mockResolvedValue(mockCurrentRuleSet);

      const result = await service.compareWithCurrentPlan('account-1');

      expect(result.hasDifferences).toBe(false);
      expect(result.message).toContain('match current plan');
    });
  });

  describe('Trade Rule Snapshot', () => {
    it('should return rules formatted for trade snapshot', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        tradingAccountId: 'account-1',
        ruleSetId: 'ruleset-1',
        ruleSetName: 'Standard Challenge',
        snapshotVersion: '2026-10-01T00:00:00.000Z',
        rules: [
          {
            id: 'rule-1',
            name: 'Daily Loss Limit',
            type: 'DAILY_LOSS',
            value: '4',
            isPercentage: true,
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const result = await service.getRulesForTradeSnapshot('account-1');

      expect(result).toHaveProperty('snapshotVersion');
      expect(result).toHaveProperty('ruleSetId');
      expect(result).toHaveProperty('ruleSetName');
      expect(result).toHaveProperty('rules');
      expect(result).toHaveProperty('capturedAt');
    });
  });
});
