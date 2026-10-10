import { Test, TestingModule } from '@nestjs/testing';
import { MaxDrawdownService, DrawdownType, DrawdownBasis, TrailingMethod } from './max-drawdown.service';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

describe('MaxDrawdownService', () => {
  let service: MaxDrawdownService;
  let prisma: PrismaService;

  const mockPrismaService = {
    tradingAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    accountRuleSnapshot: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaxDrawdownService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MaxDrawdownService>(MaxDrawdownService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('getMaxDrawdownRule', () => {
    it('should return max drawdown rule from pinned snapshot', async () => {
      const mockSnapshot = {
        tradingAccountId: 'account-1',
        rules: [
          {
            id: 'rule-max-dd',
            name: 'Max Drawdown',
            type: RuleType.MAX_DRAWDOWN,
            value: '8',
            isPercentage: true,
            isActive: true,
            drawdownType: DrawdownType.TRAILING,
            drawdownBasis: DrawdownBasis.EQUITY,
            trailingMethod: TrailingMethod.REALTIME,
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const rule = await service.getMaxDrawdownRule('account-1');

      expect(rule).toBeDefined();
      expect(rule?.maxDrawdownPercentage.toString()).toBe('8');
      expect(rule?.drawdownType).toBe(DrawdownType.TRAILING);
      expect(rule?.drawdownBasis).toBe(DrawdownBasis.EQUITY);
      expect(rule?.trailingMethod).toBe(TrailingMethod.REALTIME);
    });

    it('should default to TRAILING if drawdownType not specified', async () => {
      const mockSnapshot = {
        rules: [
          {
            id: 'rule-max-dd',
            type: RuleType.MAX_DRAWDOWN,
            value: '8',
            isPercentage: true,
            isActive: true,
          },
        ],
      };

      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const rule = await service.getMaxDrawdownRule('account-1');

      expect(rule?.drawdownType).toBe(DrawdownType.TRAILING);
      expect(rule?.drawdownBasis).toBe(DrawdownBasis.EQUITY);
    });

    it('should return null if no MAX_DRAWDOWN rule in snapshot', async () => {
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

      const rule = await service.getMaxDrawdownRule('account-1');

      expect(rule).toBeNull();
    });
  });

  describe('calculateStaticDrawdownThreshold', () => {
    it('should calculate static threshold correctly (percentage)', () => {
      const initialBalance = new Decimal(100000);
      const maxDrawdownPercent = new Decimal(8);

      const result = service.calculateStaticDrawdownThreshold(
        initialBalance,
        maxDrawdownPercent,
        true,
      );

      expect(result.maxDrawdownAmount.toString()).toBe('8000.00');
      expect(result.threshold.toString()).toBe('92000.00');
    });

    it('should calculate static threshold correctly (absolute)', () => {
      const initialBalance = new Decimal(100000);
      const maxDrawdownAmount = new Decimal(10000);

      const result = service.calculateStaticDrawdownThreshold(
        initialBalance,
        maxDrawdownAmount,
        false,
      );

      expect(result.maxDrawdownAmount.toString()).toBe('10000.00');
      expect(result.threshold.toString()).toBe('90000.00');
    });

    it('should round to money precision', () => {
      const initialBalance = new Decimal('100000.123');
      const maxDrawdownPercent = new Decimal('8.456');

      const result = service.calculateStaticDrawdownThreshold(
        initialBalance,
        maxDrawdownPercent,
        true,
      );

      expect(result.maxDrawdownAmount.decimalPlaces()).toBe(2);
      expect(result.threshold.decimalPlaces()).toBe(2);
    });
  });

  describe('calculateTrailingDrawdownThreshold', () => {
    it('should calculate trailing threshold from HWM', () => {
      const hwm = new Decimal(110000);
      const maxDrawdownPercent = new Decimal(8);

      const result = service.calculateTrailingDrawdownThreshold(
        hwm,
        maxDrawdownPercent,
        true,
      );

      expect(result.maxDrawdownAmount.toString()).toBe('8800.00');
      expect(result.threshold.toString()).toBe('101200.00');
    });

    it('should trail upward with HWM increases', () => {
      const hwm1 = new Decimal(100000);
      const hwm2 = new Decimal(110000);
      const maxDrawdownPercent = new Decimal(8);

      const result1 = service.calculateTrailingDrawdownThreshold(hwm1, maxDrawdownPercent, true);
      const result2 = service.calculateTrailingDrawdownThreshold(hwm2, maxDrawdownPercent, true);

      expect(result1.threshold.toString()).toBe('92000.00');
      expect(result2.threshold.toString()).toBe('101200.00');
      expect(FinancialCalculations.greaterThan(result2.threshold, result1.threshold)).toBe(true);
    });
  });

  describe('calculateCurrentDrawdown', () => {
    it('should calculate drawdown when value dropped', () => {
      const referencePoint = new Decimal(100000);
      const currentValue = new Decimal(92500);

      const drawdown = service.calculateCurrentDrawdown(referencePoint, currentValue);

      expect(drawdown.toString()).toBe('7500.00');
    });

    it('should return zero for profit', () => {
      const referencePoint = new Decimal(100000);
      const currentValue = new Decimal(105000);

      const drawdown = service.calculateCurrentDrawdown(referencePoint, currentValue);

      expect(drawdown.toString()).toBe('0.00');
    });

    it('should return zero when no change', () => {
      const referencePoint = new Decimal(100000);
      const currentValue = new Decimal(100000);

      const drawdown = service.calculateCurrentDrawdown(referencePoint, currentValue);

      expect(drawdown.toString()).toBe('0.00');
    });
  });

  describe('evaluateMaxDrawdownBreach', () => {
    it('should return true when at exact threshold', () => {
      const currentValue = new Decimal(92000);
      const threshold = new Decimal(92000);

      const breached = service.evaluateMaxDrawdownBreach(currentValue, threshold);

      expect(breached).toBe(true);
    });

    it('should return true when below threshold', () => {
      const currentValue = new Decimal(91999.99);
      const threshold = new Decimal(92000);

      const breached = service.evaluateMaxDrawdownBreach(currentValue, threshold);

      expect(breached).toBe(true);
    });

    it('should return false when above threshold', () => {
      const currentValue = new Decimal(92000.01);
      const threshold = new Decimal(92000);

      const breached = service.evaluateMaxDrawdownBreach(currentValue, threshold);

      expect(breached).toBe(false);
    });

    it('should handle one cent boundary precisely', () => {
      const threshold = new Decimal('92000.00');
      
      expect(service.evaluateMaxDrawdownBreach(new Decimal('92000.01'), threshold)).toBe(false);
      expect(service.evaluateMaxDrawdownBreach(new Decimal('92000.00'), threshold)).toBe(true);
      expect(service.evaluateMaxDrawdownBreach(new Decimal('91999.99'), threshold)).toBe(true);
    });
  });

  describe('updateHighWaterMark', () => {
    it('should update HWM when equity exceeds current HWM', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        highWaterMark: new Decimal(100000),
      });

      const newEquity = new Decimal(105000);
      const result = await service.updateHighWaterMark('account-1', newEquity);

      expect(result.updated).toBe(true);
      expect(result.hwm.toString()).toBe('105000');
      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { highWaterMark: newEquity },
      });
    });

    it('should not update HWM when equity below current HWM', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        highWaterMark: new Decimal(100000),
      });

      const newEquity = new Decimal(95000);
      const result = await service.updateHighWaterMark('account-1', newEquity);

      expect(result.updated).toBe(false);
      expect(result.hwm.toString()).toBe('100000');
      expect(mockPrismaService.tradingAccount.update).not.toHaveBeenCalled();
    });

    it('should never decrease HWM', async () => {
      const hwmSequence = [
        { equity: new Decimal(100000), expectedHWM: new Decimal(100000), updated: false },
        { equity: new Decimal(105000), expectedHWM: new Decimal(105000), updated: true },
        { equity: new Decimal(103000), expectedHWM: new Decimal(105000), updated: false },
        { equity: new Decimal(110000), expectedHWM: new Decimal(110000), updated: true },
        { equity: new Decimal(107000), expectedHWM: new Decimal(110000), updated: false },
      ];

      for (const step of hwmSequence) {
        mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
          id: 'account-1',
          highWaterMark: step.expectedHWM,
        });

        if (step.updated) {
          mockPrismaService.tradingAccount.update.mockResolvedValue({
            highWaterMark: step.equity,
          });
        }

        const result = await service.updateHighWaterMark('account-1', step.equity);
        expect(result.updated).toBe(step.updated);
      }
    });
  });

  describe('evaluateMaxDrawdown - STATIC + EQUITY', () => {
    it('should evaluate static drawdown using equity', async () => {
      const mockAccount = {
        id: 'account-1',
        initialBalance: new Decimal(100000),
        currentBalance: new Decimal(98000),
        equity: new Decimal(97000), // Including unrealized
        highWaterMark: new Decimal(105000),
        trades: [
          { unrealizedPnl: new Decimal(-1000) },
        ],
        ruleSnapshot: {
          snapshotVersion: '2026-10-04T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            name: 'Max Drawdown',
            type: RuleType.MAX_DRAWDOWN,
            value: '8',
            isPercentage: true,
            isActive: true,
            drawdownType: DrawdownType.STATIC,
            drawdownBasis: DrawdownBasis.EQUITY,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateMaxDrawdown('account-1');

      expect(evaluation.drawdownType).toBe(DrawdownType.STATIC);
      expect(evaluation.drawdownBasis).toBe(DrawdownBasis.EQUITY);
      expect(evaluation.referencePoint.toString()).toBe('100000'); // Initial balance
      expect(evaluation.currentValue.toString()).toBe('97000'); // Equity
      expect(evaluation.currentDrawdown.toString()).toBe('3000.00');
      expect(evaluation.drawdownThreshold.toString()).toBe('92000.00'); // 100k - 8%
      expect(evaluation.breached).toBe(false);
    });
  });

  describe('evaluateMaxDrawdown - TRAILING + EQUITY', () => {
    it('should evaluate trailing drawdown using equity', async () => {
      const mockAccount = {
        id: 'account-1',
        initialBalance: new Decimal(100000),
        currentBalance: new Decimal(103000),
        equity: new Decimal(102000),
        highWaterMark: new Decimal(110000),
        trades: [
          { unrealizedPnl: new Decimal(-1000) },
        ],
        ruleSnapshot: {
          snapshotVersion: '2026-10-04T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            type: RuleType.MAX_DRAWDOWN,
            value: '8',
            isPercentage: true,
            isActive: true,
            drawdownType: DrawdownType.TRAILING,
            drawdownBasis: DrawdownBasis.EQUITY,
            trailingMethod: TrailingMethod.REALTIME,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateMaxDrawdown('account-1');

      expect(evaluation.drawdownType).toBe(DrawdownType.TRAILING);
      expect(evaluation.referencePoint.toString()).toBe('110000'); // HWM
      expect(evaluation.currentValue.toString()).toBe('102000'); // Equity
      expect(evaluation.currentDrawdown.toString()).toBe('8000.00');
      expect(evaluation.drawdownThreshold.toString()).toBe('101200.00'); // 110k - 8%
      expect(evaluation.breached).toBe(false);
    });

    it('should breach when equity drops below trailing threshold', async () => {
      const mockAccount = {
        id: 'account-1',
        initialBalance: new Decimal(100000),
        currentBalance: new Decimal(100000),
        equity: new Decimal(101000), // Below threshold
        highWaterMark: new Decimal(110000),
        trades: [],
        ruleSnapshot: {
          snapshotVersion: '2026-10-04T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            type: RuleType.MAX_DRAWDOWN,
            value: '8',
            isPercentage: true,
            isActive: true,
            drawdownType: DrawdownType.TRAILING,
            drawdownBasis: DrawdownBasis.EQUITY,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateMaxDrawdown('account-1');

      expect(evaluation.breached).toBe(true);
      expect(evaluation.breachReason).toContain('TRAILING');
    });
  });

  describe('evaluateMaxDrawdown - STATIC + BALANCE', () => {
    it('should evaluate static drawdown using balance only', async () => {
      const mockAccount = {
        id: 'account-1',
        initialBalance: new Decimal(100000),
        currentBalance: new Decimal(93000), // Realized only
        equity: new Decimal(91000), // With unrealized
        highWaterMark: new Decimal(105000),
        trades: [
          { unrealizedPnl: new Decimal(-2000) }, // Not counted in BALANCE basis
        ],
        ruleSnapshot: {
          snapshotVersion: '2026-10-04T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            type: RuleType.MAX_DRAWDOWN,
            value: '8',
            isPercentage: true,
            isActive: true,
            drawdownType: DrawdownType.STATIC,
            drawdownBasis: DrawdownBasis.BALANCE,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateMaxDrawdown('account-1');

      expect(evaluation.drawdownBasis).toBe(DrawdownBasis.BALANCE);
      expect(evaluation.currentValue.toString()).toBe('93000'); // Balance, not equity
      expect(evaluation.currentDrawdown.toString()).toBe('7000.00');
      expect(evaluation.breached).toBe(false);
    });
  });

  describe('Decimal precision', () => {
    it('should maintain precision throughout calculations', async () => {
      const mockAccount = {
        id: 'account-1',
        initialBalance: new Decimal('100000.12'),
        currentBalance: new Decimal('99995.67'),
        equity: new Decimal('99995.67'),
        highWaterMark: new Decimal('100000.12'),
        trades: [],
        ruleSnapshot: {
          snapshotVersion: '2026-10-04T00:00:00.000Z',
        },
      };

      const mockSnapshot = {
        rules: [
          {
            id: 'rule-1',
            type: RuleType.MAX_DRAWDOWN,
            value: '8',
            isPercentage: true,
            isActive: true,
            drawdownType: DrawdownType.STATIC,
            drawdownBasis: DrawdownBasis.BALANCE,
          },
        ],
      };

      mockPrismaService.tradingAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrismaService.accountRuleSnapshot.findUnique.mockResolvedValue(mockSnapshot);

      const evaluation = await service.evaluateMaxDrawdown('account-1');

      // All calculations should be rounded to money precision
      expect(evaluation.currentDrawdown.decimalPlaces()).toBe(2);
      expect(evaluation.maxDrawdownLimit.decimalPlaces()).toBe(2);
      expect(evaluation.drawdownThreshold.decimalPlaces()).toBe(2);
    });
  });
});
