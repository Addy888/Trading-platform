/**
 * Day 29: Concurrency & Race Condition Testing - Integration Tests
 * 
 * Tests concurrent operations to ensure:
 * - No duplicate events
 * - Transaction safety
 * - Idempotency
 * - Proper locking
 * - Consistent final state
 * 
 * CRITICAL: These tests verify thread-safety and transaction isolation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { DailyLossService } from '../src/daily-loss/daily-loss.service';
import { RiskEvaluationService } from '../src/risk-engine/risk-evaluation.service';
import { TradingEngineService } from '../src/trading-engine/trading-engine.service';
import { BalanceEquityService } from '../src/trading-engine/balance-equity.service';
import { MaxDrawdownService } from '../src/max-drawdown/max-drawdown.service';
import { PayoutsService } from '../src/payouts/payouts.service';
import { TradingAccountStatus, AccountStage, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Day 29: Concurrency Tests', () => {
  let prisma: PrismaService;
  let dailyLossService: DailyLossService;
  let riskEvaluationService: RiskEvaluationService;
  let tradingEngineService: TradingEngineService;
  let balanceEquityService: BalanceEquityService;
  let maxDrawdownService: MaxDrawdownService;
  let payoutsService: PayoutsService;
  let eventEmitter: EventEmitter2;

  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        DailyLossService,
        RiskEvaluationService,
        TradingEngineService,
        BalanceEquityService,
        MaxDrawdownService,
        PayoutsService,
        EventEmitter2,
        // Add other required services
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    dailyLossService = module.get<DailyLossService>(DailyLossService);
    riskEvaluationService = module.get<RiskEvaluationService>(RiskEvaluationService);
    tradingEngineService = module.get<TradingEngineService>(TradingEngineService);
    balanceEquityService = module.get<BalanceEquityService>(BalanceEquityService);
    maxDrawdownService = module.get<MaxDrawdownService>(MaxDrawdownService);
    payoutsService = module.get<PayoutsService>(PayoutsService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `day29-concurrency-${Date.now()}@test.com`,
        passwordHash: 'test-hash',
        firstName: 'Concurrency',
        lastName: 'Test',
        role: 'USER',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testAccountId) {
      await prisma.trade.deleteMany({ where: { tradingAccountId: testAccountId } });
      await prisma.dailySnapshot.deleteMany({ where: { tradingAccountId: testAccountId } });
      await prisma.accountRuleSnapshot.deleteMany({ where: { tradingAccountId: testAccountId } });
      await prisma.auditLog.deleteMany({ where: { entityId: testAccountId } });
      await prisma.tradingAccount.deleteMany({ where: { id: testAccountId } });
    }

    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }

    await prisma.$disconnect();
  });

  /**
   * Helper: Create test account
   */
  async function createTestAccount(config: {
    initialBalance: number;
    currentBalance: number;
    equity: number;
    dailyLossLimit: number;
    drawdownLimit: number;
  }): Promise<string> {
    const rules = [
      {
        id: 'daily-loss-rule',
        name: 'Daily Loss Limit',
        type: 'DAILY_LOSS',
        value: config.dailyLossLimit,
        isPercentage: true,
        isActive: true,
        basis: 'BALANCE',
      },
      {
        id: 'max-drawdown-rule',
        name: 'Max Drawdown',
        type: 'MAX_DRAWDOWN',
        value: config.drawdownLimit,
        isPercentage: true,
        isActive: true,
        drawdownType: 'TRAILING',
        drawdownBasis: 'EQUITY',
      },
    ];

    const account = await prisma.tradingAccount.create({
      data: {
        userId: testUserId,
        accountNumber: `CONC-${Date.now()}`,
        stage: AccountStage.FUNDED,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(config.initialBalance),
        currentBalance: new Decimal(config.currentBalance),
        equity: new Decimal(config.equity),
        highWaterMark: new Decimal(config.initialBalance),
        dailyStartBalance: new Decimal(config.initialBalance),
        dailyStartEquity: new Decimal(config.initialBalance),
        currentDailyPnl: new Decimal(0),
        currentDrawdown: new Decimal(0),
        timezone: 'UTC',
        startedAt: new Date(),
      },
    });

    await prisma.accountRuleSnapshot.create({
      data: {
        tradingAccountId: account.id,
        snapshotVersion: 'v1.0-concurrent-test',
        rules: rules as any,
        snapshotReason: 'Day 29 Concurrency Test',
      },
    });

    return account.id;
  }

  describe('2.1 Simultaneous Trade Closes Causing Breach', () => {
    it('should handle simultaneous trade closes without duplicate breach events', async () => {
      // Setup: Account at 87.5% daily loss usage ($350/$400)
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 9650, // -$350 daily loss
        equity: 9650,
        dailyLossLimit: 4.0, // $400
        drawdownLimit: 4.0,
      });

      // Create two trades with -$30 unrealized loss each
      const trade1 = await prisma.trade.create({
        data: {
          tradingAccountId: testAccountId,
          symbol: 'EURUSD',
          side: 'BUY',
          volume: new Decimal(1.0),
          entryPrice: new Decimal(1.1000),
          currentPrice: new Decimal(1.0970), // -30 pips
          status: TradeStatus.OPEN,
          unrealizedPnl: new Decimal(-30),
          realizedPnl: null,
          openedAt: new Date(),
        },
      });

      const trade2 = await prisma.trade.create({
        data: {
          tradingAccountId: testAccountId,
          symbol: 'GBPUSD',
          side: 'BUY',
          volume: new Decimal(1.0),
          entryPrice: new Decimal(1.2500),
          currentPrice: new Decimal(1.2470), // -30 pips
          status: TradeStatus.OPEN,
          unrealizedPnl: new Decimal(-30),
          realizedPnl: null,
          openedAt: new Date(),
        },
      });

      // Close both trades simultaneously
      const closeResults = await Promise.allSettled([
        prisma.$transaction(async (tx) => {
          // Close trade 1
          await tx.trade.update({
            where: { id: trade1.id },
            data: {
              status: TradeStatus.CLOSED,
              realizedPnl: new Decimal(-30),
              unrealizedPnl: new Decimal(0),
              closedAt: new Date(),
            },
          });

          // Update balance
          await tx.tradingAccount.update({
            where: { id: testAccountId },
            data: {
              currentBalance: { decrement: new Decimal(30) },
              equity: { decrement: new Decimal(30) },
            },
          });
        }),
        prisma.$transaction(async (tx) => {
          // Close trade 2
          await tx.trade.update({
            where: { id: trade2.id },
            data: {
              status: TradeStatus.CLOSED,
              realizedPnl: new Decimal(-30),
              unrealizedPnl: new Decimal(0),
              closedAt: new Date(),
            },
          });

          // Update balance
          await tx.tradingAccount.update({
            where: { id: testAccountId },
            data: {
              currentBalance: { decrement: new Decimal(30) },
              equity: { decrement: new Decimal(30) },
            },
          });
        }),
      ]);

      // Verify both trades closed successfully
      expect(closeResults.every(r => r.status === 'fulfilled')).toBe(true);

      // Verify final account state
      const finalAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(finalAccount?.status).toBe(TradingAccountStatus.ACTIVE); // Not yet evaluated
      expect(finalAccount?.currentBalance.toNumber()).toBeLessThanOrEqual(9650 - 60); // Both losses posted

      // Run risk evaluation
      await riskEvaluationService.evaluateAccount(testAccountId);

      // Verify breach was detected
      const accountAfterEval = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(accountAfterEval?.status).toBe(TradingAccountStatus.BREACHED);

      // Verify only ONE breach event created (idempotency)
      const breachLogs = await prisma.auditLog.findMany({
        where: {
          entityId: testAccountId,
          action: 'DAILY_LOSS_BREACH',
        },
      });

      expect(breachLogs.length).toBe(1); // ✅ CRITICAL: No duplicate breach events
    });
  });

  describe('2.3 HWM Update Race Condition', () => {
    it('should handle concurrent HWM updates correctly', async () => {
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 10000,
        equity: 10000,
        dailyLossLimit: 4.0,
        drawdownLimit: 4.0,
      });

      // Initial HWM should be 10000
      const initialAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });
      expect(initialAccount?.highWaterMark.toNumber()).toBe(10000);

      // Simulate 3 concurrent equity increases
      const updates = [
        new Decimal(10050), // +50
        new Decimal(10100), // +100
        new Decimal(10150), // +150
      ];

      const updateResults = await Promise.allSettled(
        updates.map((newEquity) =>
          maxDrawdownService.updateHighWaterMark(testAccountId, newEquity)
        )
      );

      // All updates should succeed
      expect(updateResults.every(r => r.status === 'fulfilled')).toBe(true);

      // Verify final HWM is the highest value
      const finalAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(finalAccount?.highWaterMark.toNumber()).toBe(10150); // ✅ Highest value
      expect(finalAccount?.highWaterMark.toNumber()).toBeGreaterThanOrEqual(10000); // ✅ Never decreased
    });

    it('should never decrease HWM', async () => {
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 10000,
        equity: 10000,
        dailyLossLimit: 4.0,
        drawdownLimit: 4.0,
      });

      // Set HWM to 10200
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { highWaterMark: new Decimal(10200) },
      });

      // Try to update with lower values concurrently
      const lowerValues = [
        new Decimal(10100),
        new Decimal(10150),
        new Decimal(10000),
      ];

      await Promise.all(
        lowerValues.map((value) =>
          maxDrawdownService.updateHighWaterMark(testAccountId, value)
        )
      );

      // Verify HWM remains at 10200
      const finalAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(finalAccount?.highWaterMark.toNumber()).toBe(10200); // ✅ Not decreased
    });
  });

  describe('2.6 Daily Reset Race Condition', () => {
    it('should handle concurrent daily reset calls idempotently', async () => {
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 9800,
        equity: 9800,
        dailyLossLimit: 4.0,
        drawdownLimit: 4.0,
      });

      const resetTime = new Date('2026-10-10T00:00:00Z');

      // Call daily reset 3 times concurrently
      const resetResults = await Promise.allSettled([
        prisma.$transaction((tx) =>
          dailyLossService.performDailyReset(testAccountId, resetTime, tx)
        ),
        prisma.$transaction((tx) =>
          dailyLossService.performDailyReset(testAccountId, resetTime, tx)
        ),
        prisma.$transaction((tx) =>
          dailyLossService.performDailyReset(testAccountId, resetTime, tx)
        ),
      ]);

      // At least one should succeed
      const succeeded = resetResults.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThanOrEqual(1);

      // Verify account was reset
      const finalAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(finalAccount?.dailyStartBalance.toNumber()).toBe(9800);
      expect(finalAccount?.currentDailyPnl.toNumber()).toBe(0);
      expect(finalAccount?.lastDailyResetAt).toBeTruthy();

      // Verify only ONE daily snapshot created (idempotency)
      const snapshots = await prisma.dailySnapshot.findMany({
        where: {
          tradingAccountId: testAccountId,
          tradingDay: {
            gte: new Date('2026-10-10T00:00:00Z'),
            lt: new Date('2026-10-11T00:00:00Z'),
          },
        },
      });

      expect(snapshots.length).toBe(1); // ✅ CRITICAL: No duplicate snapshots
    });
  });

  describe('2.8 Risk Evaluation Idempotency', () => {
    it('should not create duplicate breach events when evaluated multiple times', async () => {
      // Create account in breach state
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 9550, // -$450 daily loss (breached)
        equity: 9550,
        dailyLossLimit: 4.0, // $400 limit
        drawdownLimit: 4.0,
      });

      // Run risk evaluation 5 times concurrently
      const evaluationResults = await Promise.allSettled([
        riskEvaluationService.evaluateAccount(testAccountId),
        riskEvaluationService.evaluateAccount(testAccountId),
        riskEvaluationService.evaluateAccount(testAccountId),
        riskEvaluationService.evaluateAccount(testAccountId),
        riskEvaluationService.evaluateAccount(testAccountId),
      ]);

      // All evaluations should succeed
      expect(evaluationResults.every(r => r.status === 'fulfilled')).toBe(true);

      // Verify account is breached
      const finalAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(finalAccount?.status).toBe(TradingAccountStatus.BREACHED);

      // Verify only ONE breach event created
      const breachLogs = await prisma.auditLog.findMany({
        where: {
          entityId: testAccountId,
          action: { contains: 'BREACH' },
        },
      });

      expect(breachLogs.length).toBe(1); // ✅ CRITICAL: Idempotent breach marking
    });
  });

  describe('2.10 Simultaneous Breach Precedence', () => {
    it('should prioritize DAILY_LOSS over MAX_DRAWDOWN when both breach simultaneously', async () => {
      // Setup account that will breach both limits
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 9550, // -$450 daily loss (breached)
        equity: 9550, // Also breaches 4% drawdown threshold ($9600)
        dailyLossLimit: 4.0, // $400 limit
        drawdownLimit: 4.0, // $400 limit, threshold = $9600
      });

      // Set HWM to initial balance
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { highWaterMark: new Decimal(10000) },
      });

      // Run risk evaluation
      await riskEvaluationService.evaluateAccount(testAccountId);

      // Verify breach with correct precedence
      const finalAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(finalAccount?.status).toBe(TradingAccountStatus.BREACHED);
      expect(finalAccount?.breachReason).toContain('Daily'); // ✅ DAILY_LOSS takes precedence

      // Verify breach reason in audit log
      const breachLog = await prisma.auditLog.findFirst({
        where: {
          entityId: testAccountId,
          action: 'DAILY_LOSS_BREACH',
        },
      });

      expect(breachLog).toBeTruthy(); // ✅ DAILY_LOSS breach logged, not MAX_DRAWDOWN
    });

    it('should NOT mark as PASSED when breach condition exists', async () => {
      // Setup account that reaches target but also breaches drawdown
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 10400, // Reached 4% profit target
        equity: 9550, // BUT breaches drawdown (below $9600)
        dailyLossLimit: 4.0,
        drawdownLimit: 4.0,
      });

      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { highWaterMark: new Decimal(10000) },
      });

      // Create rule snapshot with profit target
      await prisma.accountRuleSnapshot.update({
        where: { tradingAccountId: testAccountId },
        data: {
          rules: [
            {
              id: 'daily-loss-rule',
              name: 'Daily Loss Limit',
              type: 'DAILY_LOSS',
              value: 4.0,
              isPercentage: true,
              isActive: true,
            },
            {
              id: 'max-drawdown-rule',
              name: 'Max Drawdown',
              type: 'MAX_DRAWDOWN',
              value: 4.0,
              isPercentage: true,
              isActive: true,
              drawdownType: 'TRAILING',
              drawdownBasis: 'EQUITY',
            },
            {
              id: 'profit-target-rule',
              name: 'Profit Target',
              type: 'PROFIT_TARGET',
              value: 4.0,
              isPercentage: true,
              isActive: true,
            },
          ] as any,
        },
      });

      // Run risk evaluation
      await riskEvaluationService.evaluateAccount(testAccountId);

      // Verify account is BREACHED, not PASSED
      const finalAccount = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
      });

      expect(finalAccount?.status).toBe(TradingAccountStatus.BREACHED); // ✅ BREACH takes precedence
      expect(finalAccount?.status).not.toBe(TradingAccountStatus.PASSED);
    });
  });
});
