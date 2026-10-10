import { Test, TestingModule } from '@nestjs/testing';
import { DailyLossService, DailyLossBasis } from './daily-loss.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, TradeStatus, RuleType } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

describe('DailyLossService', () => {
  let service: DailyLossService;
  let prisma: PrismaService;

  const mockPrismaService = {
    tradingAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    accountRuleSnapshot: {
      findUnique: jest.fn(),
    },
    trade: {
      findMany: jest.fn(),
    },
    dailySnapshot: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyLossService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DailyLossService>(DailyLossService);
    prisma = module.get<PrismaService>(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getDailyLossRule', () => {
    it('should return daily loss rule from pinned snapshot', async () => {
      const accountId = 'test-account-1';
      const mockSnapshot = {
        tradingAccountId: accountId,
        ruleSetId: 'ruleset-1',
        ruleSetName: 'Standard Challenge',
        snapshotVersion: '2026-10-04T00:00:00.000Z',
        rules: [
          {
            id: 'rule-daily-loss',
            name: 'Daily Loss Limit',
            type: RuleType.DAILY_LOSS,
            value: '4',
            isPercentage: true,
            isActive: true,
            basis: DailyLossBasis.BALANCE,
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const rule = await service.getDailyLossRule(accountId);

      expect(rule).toBeDefined();
      expect(rule?.ruleId).toBe('rule-daily-loss');
      expect(rule?.dailyLossPercentage.toString()).toBe('4');
      expect(rule?.dailyLossBasis).toBe(DailyLossBasis.BALANCE);
      expect(rule?.isPercentage).toBe(true);
    });

    it('should return null if no rule snapshot exists', async () => {
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(null);

      const rule = await service.getDailyLossRule('test-account-1');

      expect(rule).toBeNull();
    });

    it('should return null if no DAILY_LOSS rule in snapshot', async () => {
      const mockSnapshot = {
        rules: [
          {
            id: 'rule-profit-target',
            type: RuleType.PROFIT_TARGET,
            value: '10',
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const rule = await service.getDailyLossRule('test-account-1');

      expect(rule).toBeNull();
    });

    it('should default to BALANCE basis if not specified', async () => {
      const mockSnapshot = {
        rules: [
          {
            id: 'rule-daily-loss',
            type: RuleType.DAILY_LOSS,
            value: '4',
            isPercentage: true,
            isActive: true,
            // No basis field
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const rule = await service.getDailyLossRule('test-account-1');

      expect(rule?.dailyLossBasis).toBe(DailyLossBasis.BALANCE);
    });
  });

  describe('calculateDailyLossLimit', () => {
    it('should calculate percentage-based limit correctly', () => {
      const startingBalance = new Decimal(100000);
      const percentage = new Decimal(4);

      const limit = service.calculateDailyLossLimit(startingBalance, percentage, true);

      expect(limit.toString()).toBe('4000.00');
    });

    it('should use absolute limit when not percentage', () => {
      const startingBalance = new Decimal(100000);
      const absoluteLimit = new Decimal(5000);

      const limit = service.calculateDailyLossLimit(startingBalance, absoluteLimit, false);

      expect(limit.toString()).toBe('5000.00');
    });

    it('should round to money precision', () => {
      const startingBalance = new Decimal('100000.123');
      const percentage = new Decimal('4.5678');

      const limit = service.calculateDailyLossLimit(startingBalance, percentage, true);

      // Should round to 2 decimal places
      expect(limit.decimalPlaces()).toBe(2);
    });
  });

  describe('calculateCurrentDailyLoss', () => {
    it('should calculate loss when reference dropped', () => {
      const dailyStart = new Decimal(100000);
      const current = new Decimal(96000);

      const loss = service.calculateCurrentDailyLoss(dailyStart, current);

      expect(loss.toString()).toBe('4000.00');
    });

    it('should return zero for profit day', () => {
      const dailyStart = new Decimal(100000);
      const current = new Decimal(105000);

      const loss = service.calculateCurrentDailyLoss(dailyStart, current);

      expect(loss.toString()).toBe('0.00');
    });

    it('should return zero when no change', () => {
      const dailyStart = new Decimal(100000);
      const current = new Decimal(100000);

      const loss = service.calculateCurrentDailyLoss(dailyStart, current);

      expect(loss.toString()).toBe('0.00');
    });

    it('should handle very small losses precisely', () => {
      const dailyStart = new Decimal('100000.00');
      const current = new Decimal('99999.99'); // 0.01 loss

      const loss = service.calculateCurrentDailyLoss(dailyStart, current);

      expect(loss.toString()).toBe('0.01');
    });
  });

  describe('calculateRemainingDailyLossBudget', () => {
    it('should calculate remaining budget correctly', () => {
      const limit = new Decimal(4000);
      const currentLoss = new Decimal(1500);

      const remaining = service.calculateRemainingDailyLossBudget(limit, currentLoss);

      expect(remaining.toString()).toBe('2500.00');
    });

    it('should return negative when limit exceeded', () => {
      const limit = new Decimal(4000);
      const currentLoss = new Decimal(4500);

      const remaining = service.calculateRemainingDailyLossBudget(limit, currentLoss);

      expect(remaining.toString()).toBe('-500.00');
    });

    it('should return zero at exact limit', () => {
      const limit = new Decimal(4000);
      const currentLoss = new Decimal(4000);

      const remaining = service.calculateRemainingDailyLossBudget(limit, currentLoss);

      expect(remaining.toString()).toBe('0.00');
    });
  });

  describe('evaluateDailyLossBreach', () => {
    it('should return true when loss equals limit (at boundary)', () => {
      const currentLoss = new Decimal(4000);
      const limit = new Decimal(4000);

      const breached = service.evaluateDailyLossBreach(currentLoss, limit);

      expect(breached).toBe(true);
    });

    it('should return true when loss exceeds limit', () => {
      const currentLoss = new Decimal(4500);
      const limit = new Decimal(4000);

      const breached = service.evaluateDailyLossBreach(currentLoss, limit);

      expect(breached).toBe(true);
    });

    it('should return false when loss below limit', () => {
      const currentLoss = new Decimal(3999.99);
      const limit = new Decimal(4000);

      const breached = service.evaluateDailyLossBreach(currentLoss, limit);

      expect(breached).toBe(false);
    });

    it('should handle one cent beyond limit', () => {
      const currentLoss = new Decimal('4000.01');
      const limit = new Decimal('4000.00');

      const breached = service.evaluateDailyLossBreach(currentLoss, limit);

      expect(breached).toBe(true);
    });

    it('should handle one cent below limit', () => {
      const currentLoss = new Decimal('3999.99');
      const limit = new Decimal('4000.00');

      const breached = service.evaluateDailyLossBreach(currentLoss, limit);

      expect(breached).toBe(false);
    });
  });

  describe('evaluateDailyLoss - BALANCE basis', () => {
    it('should evaluate using balance reference', async () => {
      const accountId = 'test-account-1';
      
      const mockAccount = {
        id: accountId,
        dailyStartBalance: new Decimal(100000),
        dailyStartEquity: new Decimal(100000),
        currentBalance: new Decimal(96500), // Lost $3,500
        equity: new Decimal(96500),
        lastDailyResetAt: new Date('2026-10-04T00:00:00.000Z'),
        trades: [],
        ruleSnapshot: {
          snapshotVersion: '2026-10-01T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            name: 'Daily Loss Limit',
            type: RuleType.DAILY_LOSS,
            value: '4',
            isPercentage: true,
            isActive: true,
            basis: DailyLossBasis.BALANCE,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateDailyLoss(accountId);

      expect(evaluation.dailyLossBasis).toBe(DailyLossBasis.BALANCE);
      expect(evaluation.dailyReference.toString()).toBe('100000');
      expect(evaluation.currentReference.toString()).toBe('96500');
      expect(evaluation.dailyLoss.toString()).toBe('3500.00');
      expect(evaluation.dailyLossLimit.toString()).toBe('4000.00'); // 4% of 100,000
      expect(evaluation.breached).toBe(false);
    });

    it('should not include unrealized P&L in balance basis', async () => {
      const accountId = 'test-account-1';
      
      const mockAccount = {
        id: accountId,
        dailyStartBalance: new Decimal(100000),
        dailyStartEquity: new Decimal(100000),
        currentBalance: new Decimal(98000), // Realized: -$2,000
        equity: new Decimal(97000), // Equity with unrealized: -$3,000 total
        trades: [
          { unrealizedPnl: new Decimal(-1000) }, // Floating loss
        ],
        ruleSnapshot: {
          snapshotVersion: '2026-10-01T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            type: RuleType.DAILY_LOSS,
            value: '4',
            isPercentage: true,
            isActive: true,
            basis: DailyLossBasis.BALANCE,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateDailyLoss(accountId);

      // Should only consider balance, not equity
      expect(evaluation.dailyLoss.toString()).toBe('2000.00');
      expect(evaluation.details.unrealizedPnl.toString()).toBe('-1000');
    });
  });

  describe('evaluateDailyLoss - EQUITY basis', () => {
    it('should evaluate using equity reference', async () => {
      const accountId = 'test-account-1';
      
      const mockAccount = {
        id: accountId,
        dailyStartBalance: new Decimal(100000),
        dailyStartEquity: new Decimal(100000),
        currentBalance: new Decimal(98000),
        equity: new Decimal(97000), // Lost $3,000 total (realized + unrealized)
        trades: [
          { unrealizedPnl: new Decimal(-1000) },
        ],
        ruleSnapshot: {
          snapshotVersion: '2026-10-01T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            name: 'Daily Loss Limit',
            type: RuleType.DAILY_LOSS,
            value: '4',
            isPercentage: true,
            isActive: true,
            basis: DailyLossBasis.EQUITY,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateDailyLoss(accountId);

      expect(evaluation.dailyLossBasis).toBe(DailyLossBasis.EQUITY);
      expect(evaluation.dailyReference.toString()).toBe('100000');
      expect(evaluation.currentReference.toString()).toBe('97000');
      expect(evaluation.dailyLoss.toString()).toBe('3000.00');
      expect(evaluation.breached).toBe(false);
    });

    it('should include floating losses in equity basis', async () => {
      const accountId = 'test-account-1';
      
      const mockAccount = {
        id: accountId,
        dailyStartBalance: new Decimal(100000),
        dailyStartEquity: new Decimal(100000),
        currentBalance: new Decimal(99000), // Realized: -$1,000
        equity: new Decimal(96000), // Equity: -$4,000 total
        trades: [
          { unrealizedPnl: new Decimal(-3000) }, // Large floating loss
        ],
        ruleSnapshot: {
          snapshotVersion: '2026-10-01T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            type: RuleType.DAILY_LOSS,
            value: '4',
            isPercentage: true,
            isActive: true,
            basis: DailyLossBasis.EQUITY,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateDailyLoss(accountId);

      // Equity basis includes floating loss
      expect(evaluation.dailyLoss.toString()).toBe('4000.00');
      expect(evaluation.breached).toBe(true); // Breached at exactly 4%
    });
  });

  describe('isEligibleForDailyReset', () => {
    it('should allow reset for ACTIVE accounts', () => {
      const account = { status: TradingAccountStatus.ACTIVE };
      
      const eligible = service.isEligibleForDailyReset(account);
      
      expect(eligible).toBe(true);
    });

    it('should not allow reset for BREACHED accounts', () => {
      const account = { status: TradingAccountStatus.BREACHED };
      
      const eligible = service.isEligibleForDailyReset(account);
      
      expect(eligible).toBe(false);
    });

    it('should not allow reset for PASSED accounts', () => {
      const account = { status: TradingAccountStatus.PASSED };
      
      const eligible = service.isEligibleForDailyReset(account);
      
      expect(eligible).toBe(false);
    });

    it('should not allow reset for CLOSED accounts', () => {
      const account = { status: TradingAccountStatus.CLOSED };
      
      const eligible = service.isEligibleForDailyReset(account);
      
      expect(eligible).toBe(false);
    });

    it('should not allow reset for SUSPENDED accounts', () => {
      const account = { status: TradingAccountStatus.SUSPENDED };
      
      const eligible = service.isEligibleForDailyReset(account);
      
      expect(eligible).toBe(false);
    });
  });

  describe('Decimal precision', () => {
    it('should maintain precision throughout calculations', async () => {
      const accountId = 'test-account-1';
      
      const mockAccount = {
        id: accountId,
        dailyStartBalance: new Decimal('100000.12'),
        dailyStartEquity: new Decimal('100000.12'),
        currentBalance: new Decimal('99995.67'),
        equity: new Decimal('99995.67'),
        trades: [],
        ruleSnapshot: {
          snapshotVersion: '2026-10-01T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            type: RuleType.DAILY_LOSS,
            value: '4',
            isPercentage: true,
            isActive: true,
            basis: DailyLossBasis.BALANCE,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateDailyLoss(accountId);

      // Loss should be precisely calculated and rounded
      expect(evaluation.dailyLoss.toString()).toBe('4.45');
      expect(evaluation.dailyLoss.decimalPlaces()).toBe(2);
    });
  });
});
