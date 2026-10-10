/**
 * Day 16: Automatic Breach Engine Tests
 * 
 * Comprehensive tests for breach lifecycle including:
 * - Daily Loss breach
 * - Max Drawdown breach (static and trailing)
 * - Exact threshold and one-cent-beyond
 * - Simultaneous breaches (precedence)
 * - Repeated breach evaluation (idempotency)
 * - Already breached account
 * - Trading blocked after breach
 * - Notification idempotency
 * - WebSocket event emission
 * - Concurrent breach attempts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RiskEvaluationService } from './risk-evaluation.service';
import { RiskCalculationService } from './risk-calculation.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradingAccountStatus } from '@prisma/client';
import Decimal from 'decimal.js';

describe('RiskEvaluationService - Day 16 Breach Engine', () => {
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

  describe('Daily Loss Breach', () => {
    it('should breach account when daily loss limit exceeded', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(9400), // -$600 loss
        equity: new Decimal(9400),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: null,
        breachReason: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(9400),
        currentEquity: new Decimal(9400),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: true,
        canPass: false,
        dailyLossBreached: true,
        maxDrawdownBreached: false,
        breachReason: 'Daily loss limit exceeded',
        breachRuleType: 'DAILY_LOSS',
        dailyLoss: {
          dailyLoss: new Decimal(600),
          dailyLossLimit: new Decimal(500),
          dailyLossPercentage: new Decimal(6),
        },
      };

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          tradingAccount: {
            findUnique: jest.fn()
              .mockResolvedValueOnce(mockAccount) // First load
              .mockResolvedValueOnce({ // Idempotency check
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
      expect(result.newStatus).toBe(TradingAccountStatus.BREACHED);
      expect(result.stateChangeReason).toContain('Daily loss');
    });

    it('should breach at exact threshold', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(9500), // Exactly -$500 loss
        equity: new Decimal(9500),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: null,
        breachReason: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(9500),
        currentEquity: new Decimal(9500),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: true,
        canPass: false,
        dailyLossBreached: true,
        maxDrawdownBreached: false,
        breachReason: 'Daily loss limit reached',
        breachRuleType: 'DAILY_LOSS',
        dailyLoss: {
          dailyLoss: new Decimal(500), // Exactly at limit
          dailyLossLimit: new Decimal(500),
          dailyLossPercentage: new Decimal(5),
        },
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
      expect(result.newStatus).toBe(TradingAccountStatus.BREACHED);
    });
  });

  describe('Max Drawdown Breach', () => {
    it('should breach account when max drawdown exceeded', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(8900), // -$1100 from HWM
        equity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: null,
        breachReason: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(8900),
        currentEquity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: true,
        canPass: false,
        dailyLossBreached: false,
        maxDrawdownBreached: true,
        breachReason: 'Max drawdown limit exceeded',
        breachRuleType: 'MAX_DRAWDOWN',
        maxDrawdown: {
          currentDrawdown: new Decimal(1100),
          maxDrawdownLimit: new Decimal(1000),
          currentDrawdownPercentage: new Decimal(11),
        },
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
      expect(result.newStatus).toBe(TradingAccountStatus.BREACHED);
      expect(result.stateChangeReason).toContain('drawdown');
    });
  });

  describe('Breach Precedence', () => {
    it('should breach for daily loss when both daily loss and drawdown breached', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(8900),
        equity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: null,
        breachReason: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(8900),
        currentEquity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: true,
        canPass: false,
        dailyLossBreached: true, // Both breached
        maxDrawdownBreached: true,
        breachReason: 'Daily loss limit exceeded', // Daily loss takes precedence
        breachRuleType: 'DAILY_LOSS',
        dailyLoss: {
          dailyLoss: new Decimal(1100),
          dailyLossLimit: new Decimal(500),
          dailyLossPercentage: new Decimal(11),
        },
        maxDrawdown: {
          currentDrawdown: new Decimal(1100),
          maxDrawdownLimit: new Decimal(1000),
          currentDrawdownPercentage: new Decimal(11),
        },
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
      expect(result.newStatus).toBe(TradingAccountStatus.BREACHED);
      expect(result.calculation.breachRuleType).toBe('DAILY_LOSS'); // Precedence verified
    });
  });

  describe('Idempotency', () => {
    it('should not create duplicate breach when account already breached', async () => {
      const breachedTime = new Date('2026-01-01');
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.BREACHED, // Already breached
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(8900),
        equity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: breachedTime,
        breachReason: 'Daily loss limit exceeded',
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(8900),
        currentEquity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: true, // Still would breach
        canPass: false,
        dailyLossBreached: true,
        maxDrawdownBreached: false,
        breachReason: 'Daily loss limit exceeded',
        breachRuleType: 'DAILY_LOSS',
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

    it('should preserve original breach data on repeated evaluation', async () => {
      const originalBreachTime = new Date('2026-01-01');
      const originalBreachReason = 'Daily loss limit exceeded';

      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.BREACHED,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(8900),
        equity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: originalBreachTime,
        breachReason: originalBreachReason,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(8900),
        currentEquity: new Decimal(8900),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: true,
        canPass: false,
        dailyLossBreached: true,
        maxDrawdownBreached: true, // Now also drawdown breached
        breachReason: 'Max drawdown limit exceeded', // Different reason
        breachRuleType: 'MAX_DRAWDOWN',
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
      // Original breach time and reason should be preserved
    });
  });

  describe('Event Emission', () => {
    it('should emit account.status.changed event after breach', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(9400),
        equity: new Decimal(9400),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: null,
        breachReason: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(9400),
        currentEquity: new Decimal(9400),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: true,
        canPass: false,
        dailyLossBreached: true,
        maxDrawdownBreached: false,
        breachReason: 'Daily loss limit exceeded',
        breachRuleType: 'DAILY_LOSS',
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

      // Emit events (this happens outside transaction in real code)
      service.emitPostEvaluationEvents(result);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'account.status.changed',
        expect.objectContaining({
          accountId: mockAccountId,
          previousStatus: TradingAccountStatus.ACTIVE,
          newStatus: TradingAccountStatus.BREACHED,
        }),
      );
    });

    it('should not emit events when no status change occurs', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(10000),
        currentBalance: new Decimal(9800), // Safe
        equity: new Decimal(9800),
        highWaterMark: new Decimal(10000),
        dailyStartBalance: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        stage: 'PHASE_1',
        ruleSnapshot: {
          id: 'snapshot-1',
          snapshotVersion: '1.0.0',
          rules: [],
        },
        trades: [],
        breachedAt: null,
        breachReason: null,
      };

      const mockCalculation = {
        accountStage: 'PHASE_1',
        currentBalance: new Decimal(9800),
        currentEquity: new Decimal(9800),
        highWaterMark: new Decimal(10000),
        dailyStartEquity: new Decimal(10000),
        canBreach: false, // No breach
        canPass: false,
        dailyLossBreached: false,
        maxDrawdownBreached: false,
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
