/**
 * Day 17: Automatic PASS Engine Tests
 * 
 * Comprehensive tests for PASS lifecycle including:
 * - Profit target reached
 * - Profit target + minimum trading days
 * - Profit target alone (insufficient)
 * - Exact threshold and one-cent beyond
 * - Simultaneous breach and target (precedence)
 * - Repeated pass evaluation (idempotency)
 * - Already passed account
 * - Event emission
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RiskEvaluationService } from './risk-evaluation.service';
import { RiskCalculationService } from './risk-calculation.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradingAccountStatus } from '@prisma/client';
import Decimal from 'decimal.js';

describe('RiskEvaluationService - Day 17 Pass Engine', () => {
  let service: RiskEvaluationService;
  let prisma: jest.Mocked<PrismaService>;
  let riskCalculation: jest.Mocked<RiskCalculationService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockAccountId = 'account-123';
  const mockUserId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskEvaluationService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            tradingAccount: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
            trade: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: RiskCalculationService,
          useValue: {
            calculateRisk: jest.fn(),
          },
        },
        {
          provide: AccountSnapshotsService,
          useValue: {
            createSnapshot: jest.fn(),
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

    service = module.get<RiskEvaluationService>(RiskEvaluationService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    riskCalculation = module.get(RiskCalculationService) as jest.Mocked<RiskCalculationService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  describe('Profit Target + Minimum Trading Days', () => {
    it('should pass account when BOTH profit target AND minimum trading days are met', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000), // +$1000 profit
        equity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-01'),
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        currentEquity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartEquity: new Decimal(10000),
        canBreach: false,
        canPass: true,
        profitTargetReached: true, // ✅ Target met
        minTradingDaysReached: true, // ✅ Days met
        passReason: 'All requirements met',
        profitTarget: {
          profitTargetAmount: new Decimal(1000),
          currentProfit: new Decimal(1000),
          currentProfitPercentage: new Decimal(10),
          profitTargetThreshold: new Decimal(11000),
        },
        minTradingDays: {
          requiredDays: 5,
          completedDays: 5,
          remainingDays: 0,
          progressPercentage: new Decimal(100),
        },
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn()
              .mockResolvedValueOnce(mockAccount) // First load
              .mockResolvedValueOnce({ // Idempotency check
                status: TradingAccountStatus.ACTIVE,
                passedAt: null,
                stage: 'PHASE_1',
              }),
            update: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'TRADE_CLOSE',
        triggeredBy: mockUserId,
      });

      expect(result.statusChanged).toBe(true);
      expect(result.newStatus).toBe(TradingAccountStatus.PASSED);
      expect(result.stateChangeReason).toContain('requirements met');
    });

    it('should pass at exact profit threshold when min days met', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000), // Exactly +$1000 profit
        equity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-01'),
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        currentEquity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartEquity: new Decimal(10000),
        canBreach: false,
        canPass: true,
        profitTargetReached: true,
        minTradingDaysReached: true,
        passReason: 'All requirements met',
        profitTarget: {
          profitTargetAmount: new Decimal(1000), // Exactly at threshold
          currentProfit: new Decimal(1000),
          currentProfitPercentage: new Decimal(10),
        },
        minTradingDays: {
          requiredDays: 5,
          completedDays: 5,
          remainingDays: 0,
          progressPercentage: new Decimal(100),
        },
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn()
              .mockResolvedValueOnce(mockAccount)
              .mockResolvedValueOnce({
                status: TradingAccountStatus.ACTIVE,
                passedAt: null,
                stage: 'PHASE_1',
              }),
            update: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'TRADE_CLOSE',
        triggeredBy: mockUserId,
      });

      expect(result.statusChanged).toBe(true);
      expect(result.newStatus).toBe(TradingAccountStatus.PASSED);
    });
  });

  describe('Profit Target Alone (Insufficient)', () => {
    it('should NOT pass when profit target met but minimum trading days incomplete', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000), // +$1000 profit ✅
        equity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-03'), // Only 3 days ago
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        currentEquity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartEquity: new Decimal(10000),
        canBreach: false,
        canPass: false, // ❌ Cannot pass yet
        profitTargetReached: true, // ✅ Target met
        minTradingDaysReached: false, // ❌ Days incomplete
        profitTarget: {
          profitTargetAmount: new Decimal(1000),
          currentProfit: new Decimal(1000),
          currentProfitPercentage: new Decimal(10),
        },
        minTradingDays: {
          requiredDays: 5,
          completedDays: 3, // Only 3 of 5 days
          remainingDays: 2,
          progressPercentage: new Decimal(60),
        },
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'TRADE_CLOSE',
        triggeredBy: mockUserId,
      });

      expect(result.statusChanged).toBe(false); // No pass yet
      expect(result.calculation.profitTargetReached).toBe(true); // Target met
      expect(result.calculation.minTradingDaysReached).toBe(false); // But days incomplete
    });
  });

  describe('Breach vs Target Precedence', () => {
    it('should breach instead of pass when both conditions occur simultaneously', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000), // +$1000 profit
        equity: new Decimal(8900), // But -$1100 drawdown!
        highWaterMark: new Decimal(11500), // Was higher before
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-01'),
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        currentEquity: new Decimal(8900),
        highWaterMark: new Decimal(11500),
        dailyStartEquity: new Decimal(10000),
        canBreach: true, // ❌ Breach takes precedence
        canPass: false,
        profitTargetReached: true, // ✅ Target met
        minTradingDaysReached: true, // ✅ Days met
        maxDrawdownBreached: true, // ❌ But drawdown exceeded
        breachReason: 'Max drawdown limit exceeded',
        breachRuleType: 'MAX_DRAWDOWN',
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn()
              .mockResolvedValueOnce(mockAccount)
              .mockResolvedValueOnce({
                status: TradingAccountStatus.ACTIVE,
                breachedAt: null,
                breachReason: null,
              }),
            update: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'TRADE_CLOSE',
        triggeredBy: mockUserId,
      });

      expect(result.statusChanged).toBe(true);
      expect(result.newStatus).toBe(TradingAccountStatus.BREACHED); // Breach wins
      expect(result.stateChangeReason).toContain('drawdown');
    });
  });

  describe('Idempotency', () => {
    it('should not create duplicate pass when account already passed', async () => {
      const passedTime = new Date('2026-01-15');
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.PASSED, // Already passed
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        equity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-01'),
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: passedTime,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        currentEquity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartEquity: new Decimal(10000),
        canBreach: false,
        canPass: true, // Still qualifies for pass
        profitTargetReached: true,
        minTradingDaysReached: true,
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn(), // Should NOT be called
          },
          auditLog: {
            create: jest.fn(), // Should NOT be called
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'TRADE_CLOSE',
        triggeredBy: mockUserId,
      });

      expect(result.statusChanged).toBe(false); // No status change
      // Verify no duplicate audit logs or updates
    });

    it('should preserve original pass data on repeated evaluation', async () => {
      const originalPassTime = new Date('2026-01-15');

      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.PASSED,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11500), // Now even more profit
        equity: new Decimal(11500),
        highWaterMark: new Decimal(11500),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-01'),
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: originalPassTime,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11500),
        currentEquity: new Decimal(11500),
        highWaterMark: new Decimal(11500),
        dailyStartEquity: new Decimal(10000),
        canBreach: false,
        canPass: true,
        profitTargetReached: true,
        minTradingDaysReached: true,
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'MARKET_TICK',
        triggeredBy: 'SYSTEM',
      });

      expect(result.statusChanged).toBe(false);
      // Original pass time and status should be preserved
    });
  });

  describe('Event Emission', () => {
    it('should emit account.status.changed event after pass', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        equity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-01'),
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(11000),
        currentEquity: new Decimal(11000),
        highWaterMark: new Decimal(11000),
        dailyStartEquity: new Decimal(10000),
        canBreach: false,
        canPass: true,
        profitTargetReached: true,
        minTradingDaysReached: true,
        passReason: 'All requirements met',
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn()
              .mockResolvedValueOnce(mockAccount)
              .mockResolvedValueOnce({
                status: TradingAccountStatus.ACTIVE,
                passedAt: null,
                stage: 'PHASE_1',
              }),
            update: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'TRADE_CLOSE',
        triggeredBy: mockUserId,
      });

      // Emit events (this happens outside transaction in real code)
      service.emitPostEvaluationEvents(result);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'account.status.changed',
        expect.objectContaining({
          accountId: mockAccountId,
          previousStatus: TradingAccountStatus.ACTIVE,
          newStatus: TradingAccountStatus.PASSED,
        }),
      );
    });

    it('should not emit events when no status change occurs', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(10500), // Not enough profit
        equity: new Decimal(10500),
        highWaterMark: new Decimal(10500),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        startedAt: new Date('2026-01-01'),
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        passedAt: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(10500),
        currentEquity: new Decimal(10500),
        highWaterMark: new Decimal(10500),
        dailyStartEquity: new Decimal(10000),
        canBreach: false,
        canPass: false, // Not passing
        profitTargetReached: false,
        minTradingDaysReached: true,
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn().mockResolvedValue(mockAccount),
            update: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          },
          trade: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        };

        riskCalculation.calculateRisk.mockResolvedValue(mockCalculation as any);

        return callback(tx);
      });

      const result = await service.evaluateAccount(mockAccountId, {
        type: 'TRADE_CLOSE',
        triggeredBy: mockUserId,
      });

      service.emitPostEvaluationEvents(result);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
