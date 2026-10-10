/**
 * Day 29: Boundary Value Testing - Integration Tests
 * 
 * Tests exact boundary conditions for all financial rules.
 * Every boundary is tested at: below, exact, and above limit.
 * 
 * CRITICAL: Do not change business rules to make tests pass.
 * If a test fails, the implementation must be fixed.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { DailyLossService } from '../src/daily-loss/daily-loss.service';
import { MaxDrawdownService } from '../src/max-drawdown/max-drawdown.service';
import { RiskCalculationService } from '../src/risk-engine/risk-calculation.service';
import { MinTradingDaysService } from '../src/risk-engine/min-trading-days.service';
import { ConsistencyService } from '../src/risk-engine/consistency.service';
import { MarginService } from '../src/trading-engine/margin.service';
import { TradingAccountStatus, AccountStage, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../src/common/utils/financial-calculations.util';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Day 29: Boundary Value Tests', () => {
  let prisma: PrismaService;
  let dailyLossService: DailyLossService;
  let maxDrawdownService: MaxDrawdownService;
  let riskCalculationService: RiskCalculationService;
  let minTradingDaysService: MinTradingDaysService;
  let consistencyService: ConsistencyService;
  let marginService: MarginService;
  let eventEmitter: EventEmitter2;

  // Test data IDs
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        DailyLossService,
        MaxDrawdownService,
        RiskCalculationService,
        MinTradingDaysService,
        ConsistencyService,
        MarginService,
        EventEmitter2,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    dailyLossService = module.get<DailyLossService>(DailyLossService);
    maxDrawdownService = module.get<MaxDrawdownService>(MaxDrawdownService);
    riskCalculationService = module.get<RiskCalculationService>(RiskCalculationService);
    minTradingDaysService = module.get<MinTradingDaysService>(MinTradingDaysService);
    consistencyService = module.get<ConsistencyService>(ConsistencyService);
    marginService = module.get<MarginService>(MarginService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `day29-boundary-${Date.now()}@test.com`,
        passwordHash: 'test-hash',
        firstName: 'Boundary',
        lastName: 'Test',
        role: 'USER',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup: Delete test data
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
   * Helper: Create test account with specific configuration
   */
  async function createTestAccount(config: {
    initialBalance: number;
    currentBalance: number;
    equity: number;
    highWaterMark: number;
    dailyStartBalance: number;
    dailyStartEquity: number;
    dailyLossLimit: number;
    drawdownLimit: number;
    profitTarget: number;
    minTradingDays: number;
  }): Promise<string> {
    // Create rule snapshot
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
        trailingMethod: 'REALTIME',
      },
      {
        id: 'profit-target-rule',
        name: 'Profit Target',
        type: 'PROFIT_TARGET',
        value: config.profitTarget,
        isPercentage: true,
        isActive: true,
        profitTargetBasis: 'BALANCE',
      },
      {
        id: 'min-trading-days-rule',
        name: 'Minimum Trading Days',
        type: 'MIN_TRADING_DAYS',
        value: config.minTradingDays,
        isPercentage: false,
        isActive: true,
      },
    ];

    const account = await prisma.tradingAccount.create({
      data: {
        userId: testUserId,
        accountNumber: `BND-${Date.now()}`,
        stage: AccountStage.FUNDED,
        status: TradingAccountStatus.ACTIVE,
        initialBalance: new Decimal(config.initialBalance),
        currentBalance: new Decimal(config.currentBalance),
        equity: new Decimal(config.equity),
        highWaterMark: new Decimal(config.highWaterMark),
        dailyStartBalance: new Decimal(config.dailyStartBalance),
        dailyStartEquity: new Decimal(config.dailyStartEquity),
        currentDailyPnl: new Decimal(0),
        currentDrawdown: new Decimal(0),
        timezone: 'UTC',
        startedAt: new Date(),
      },
    });

    // Create rule snapshot
    await prisma.accountRuleSnapshot.create({
      data: {
        tradingAccountId: account.id,
        snapshotVersion: 'v1.0-test',
        rules: rules as any,
        snapshotReason: 'Day 29 Boundary Test',
      },
    });

    return account.id;
  }

  describe('1.1 Daily Loss Boundaries', () => {
    const DAILY_LOSS_LIMIT = 400; // $400 = 4% of $10,000
    const INITIAL_BALANCE = 10000;

    beforeEach(async () => {
      testAccountId = await createTestAccount({
        initialBalance: INITIAL_BALANCE,
        currentBalance: INITIAL_BALANCE,
        equity: INITIAL_BALANCE,
        highWaterMark: INITIAL_BALANCE,
        dailyStartBalance: INITIAL_BALANCE,
        dailyStartEquity: INITIAL_BALANCE,
        dailyLossLimit: 4.0, // 4%
        drawdownLimit: 4.0,
        profitTarget: 4.0,
        minTradingDays: 5,
      });
    });

    it('DL-001: Should NOT breach at 2 cents below limit ($399.98)', async () => {
      // Set current balance to cause $399.98 loss
      const currentBalance = INITIAL_BALANCE - 399.98;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { currentBalance: new Decimal(currentBalance) },
      });

      const evaluation = await dailyLossService.evaluateDailyLoss(testAccountId);

      expect(evaluation.breached).toBe(false);
      expect(evaluation.dailyLoss.toNumber()).toBe(399.98);
      expect(evaluation.dailyLossLimit.toNumber()).toBe(DAILY_LOSS_LIMIT);
      expect(evaluation.remainingDailyLossBudget.toNumber()).toBe(0.02);
    });

    it('DL-002: Should NOT breach at 1 cent below limit ($399.99)', async () => {
      const currentBalance = INITIAL_BALANCE - 399.99;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { currentBalance: new Decimal(currentBalance) },
      });

      const evaluation = await dailyLossService.evaluateDailyLoss(testAccountId);

      expect(evaluation.breached).toBe(false);
      expect(evaluation.dailyLoss.toNumber()).toBe(399.99);
      expect(evaluation.dailyLossLimit.toNumber()).toBe(DAILY_LOSS_LIMIT);
      expect(evaluation.remainingDailyLossBudget.toNumber()).toBe(0.01);
    });

    it('DL-003: Should BREACH at exact limit ($400.00)', async () => {
      const currentBalance = INITIAL_BALANCE - 400.00;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { currentBalance: new Decimal(currentBalance) },
      });

      const evaluation = await dailyLossService.evaluateDailyLoss(testAccountId);

      expect(evaluation.breached).toBe(true);
      expect(evaluation.dailyLoss.toNumber()).toBe(400.00);
      expect(evaluation.dailyLossLimit.toNumber()).toBe(DAILY_LOSS_LIMIT);
      expect(evaluation.remainingDailyLossBudget.toNumber()).toBe(0.00);
      expect(evaluation.breachReason).toContain('Daily');
    });

    it('DL-004: Should BREACH at 1 cent above limit ($400.01)', async () => {
      const currentBalance = INITIAL_BALANCE - 400.01;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { currentBalance: new Decimal(currentBalance) },
      });

      const evaluation = await dailyLossService.evaluateDailyLoss(testAccountId);

      expect(evaluation.breached).toBe(true);
      expect(evaluation.dailyLoss.toNumber()).toBe(400.01);
      expect(evaluation.dailyLossLimit.toNumber()).toBe(DAILY_LOSS_LIMIT);
      expect(evaluation.remainingDailyLossBudget.toNumber()).toBe(-0.01);
    });

    it('DL-005: Should BREACH at 2 cents above limit ($400.02)', async () => {
      const currentBalance = INITIAL_BALANCE - 400.02;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { currentBalance: new Decimal(currentBalance) },
      });

      const evaluation = await dailyLossService.evaluateDailyLoss(testAccountId);

      expect(evaluation.breached).toBe(true);
      expect(evaluation.dailyLoss.toNumber()).toBe(400.02);
      expect(evaluation.dailyLossLimit.toNumber()).toBe(DAILY_LOSS_LIMIT);
      expect(evaluation.remainingDailyLossBudget.toNumber()).toBe(-0.02);
    });
  });

  describe('1.2 Max Drawdown Boundaries', () => {
    const HWM = 10000;
    const DRAWDOWN_LIMIT = 4.0; // 4%
    const DRAWDOWN_AMOUNT = 400; // $400
    const DRAWDOWN_THRESHOLD = 9600; // $10,000 - $400

    beforeEach(async () => {
      testAccountId = await createTestAccount({
        initialBalance: HWM,
        currentBalance: HWM,
        equity: HWM,
        highWaterMark: HWM,
        dailyStartBalance: HWM,
        dailyStartEquity: HWM,
        dailyLossLimit: 4.0,
        drawdownLimit: DRAWDOWN_LIMIT,
        profitTarget: 4.0,
        minTradingDays: 5,
      });
    });

    it('DD-001: Should NOT breach at 2 cents above threshold ($9,600.02)', async () => {
      const currentEquity = DRAWDOWN_THRESHOLD + 0.02;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentEquity),
          equity: new Decimal(currentEquity),
        },
      });

      const evaluation = await maxDrawdownService.evaluateMaxDrawdown(testAccountId);

      expect(evaluation.breached).toBe(false);
      expect(evaluation.currentValue.toNumber()).toBe(currentEquity);
      expect(evaluation.drawdownThreshold.toNumber()).toBe(DRAWDOWN_THRESHOLD);
      expect(evaluation.remainingDrawdownBuffer.toNumber()).toBe(0.02);
    });

    it('DD-002: Should NOT breach at 1 cent above threshold ($9,600.01)', async () => {
      const currentEquity = DRAWDOWN_THRESHOLD + 0.01;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentEquity),
          equity: new Decimal(currentEquity),
        },
      });

      const evaluation = await maxDrawdownService.evaluateMaxDrawdown(testAccountId);

      expect(evaluation.breached).toBe(false);
      expect(evaluation.currentValue.toNumber()).toBe(currentEquity);
      expect(evaluation.drawdownThreshold.toNumber()).toBe(DRAWDOWN_THRESHOLD);
      expect(evaluation.remainingDrawdownBuffer.toNumber()).toBe(0.01);
    });

    it('DD-003: Should BREACH at exact threshold ($9,600.00)', async () => {
      const currentEquity = DRAWDOWN_THRESHOLD;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentEquity),
          equity: new Decimal(currentEquity),
        },
      });

      const evaluation = await maxDrawdownService.evaluateMaxDrawdown(testAccountId);

      expect(evaluation.breached).toBe(true);
      expect(evaluation.currentValue.toNumber()).toBe(currentEquity);
      expect(evaluation.drawdownThreshold.toNumber()).toBe(DRAWDOWN_THRESHOLD);
      expect(evaluation.remainingDrawdownBuffer.toNumber()).toBe(0.00);
      expect(evaluation.breachReason).toContain('drawdown');
    });

    it('DD-004: Should BREACH at 1 cent below threshold ($9,599.99)', async () => {
      const currentEquity = DRAWDOWN_THRESHOLD - 0.01;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentEquity),
          equity: new Decimal(currentEquity),
        },
      });

      const evaluation = await maxDrawdownService.evaluateMaxDrawdown(testAccountId);

      expect(evaluation.breached).toBe(true);
      expect(evaluation.currentValue.toNumber()).toBe(currentEquity);
      expect(evaluation.drawdownThreshold.toNumber()).toBe(DRAWDOWN_THRESHOLD);
      expect(evaluation.remainingDrawdownBuffer.toNumber()).toBe(-0.01);
    });

    it('DD-005: Should BREACH at 2 cents below threshold ($9,599.98)', async () => {
      const currentEquity = DRAWDOWN_THRESHOLD - 0.02;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentEquity),
          equity: new Decimal(currentEquity),
        },
      });

      const evaluation = await maxDrawdownService.evaluateMaxDrawdown(testAccountId);

      expect(evaluation.breached).toBe(true);
      expect(evaluation.currentValue.toNumber()).toBe(currentEquity);
      expect(evaluation.drawdownThreshold.toNumber()).toBe(DRAWDOWN_THRESHOLD);
      expect(evaluation.remainingDrawdownBuffer.toNumber()).toBe(-0.02);
    });
  });

  describe('1.3 Profit Target Boundaries', () => {
    const INITIAL_BALANCE = 10000;
    const PROFIT_TARGET = 4.0; // 4%
    const TARGET_AMOUNT = 400; // $400
    const TARGET_THRESHOLD = 10400; // $10,000 + $400

    beforeEach(async () => {
      testAccountId = await createTestAccount({
        initialBalance: INITIAL_BALANCE,
        currentBalance: INITIAL_BALANCE,
        equity: INITIAL_BALANCE,
        highWaterMark: INITIAL_BALANCE,
        dailyStartBalance: INITIAL_BALANCE,
        dailyStartEquity: INITIAL_BALANCE,
        dailyLossLimit: 4.0,
        drawdownLimit: 4.0,
        profitTarget: PROFIT_TARGET,
        minTradingDays: 5,
      });
    });

    it('PT-001: Should NOT reach target at 2 cents below ($10,399.98)', async () => {
      const currentBalance = TARGET_THRESHOLD - 0.02;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentBalance),
          equity: new Decimal(currentBalance),
        },
      });

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: { where: { status: TradeStatus.OPEN } },
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.profitTargetReached).toBe(false);
      expect(riskResult.profitTarget?.currentValue.toNumber()).toBe(currentBalance);
      expect(riskResult.profitTarget?.profitTargetThreshold.toNumber()).toBe(TARGET_THRESHOLD);
      expect(riskResult.profitTarget?.remainingProfit.toNumber()).toBeCloseTo(0.02, 2);
    });

    it('PT-002: Should NOT reach target at 1 cent below ($10,399.99)', async () => {
      const currentBalance = TARGET_THRESHOLD - 0.01;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentBalance),
          equity: new Decimal(currentBalance),
        },
      });

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: { where: { status: TradeStatus.OPEN } },
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.profitTargetReached).toBe(false);
      expect(riskResult.profitTarget?.currentValue.toNumber()).toBe(currentBalance);
      expect(riskResult.profitTarget?.profitTargetThreshold.toNumber()).toBe(TARGET_THRESHOLD);
      expect(riskResult.profitTarget?.remainingProfit.toNumber()).toBeCloseTo(0.01, 2);
    });

    it('PT-003: Should reach target at exact threshold ($10,400.00)', async () => {
      const currentBalance = TARGET_THRESHOLD;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentBalance),
          equity: new Decimal(currentBalance),
        },
      });

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: { where: { status: TradeStatus.OPEN } },
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.profitTargetReached).toBe(true);
      expect(riskResult.profitTarget?.currentValue.toNumber()).toBe(currentBalance);
      expect(riskResult.profitTarget?.profitTargetThreshold.toNumber()).toBe(TARGET_THRESHOLD);
      expect(riskResult.profitTarget?.remainingProfit.toNumber()).toBe(0.00);
    });

    it('PT-004: Should reach target at 1 cent above ($10,400.01)', async () => {
      const currentBalance = TARGET_THRESHOLD + 0.01;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentBalance),
          equity: new Decimal(currentBalance),
        },
      });

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: { where: { status: TradeStatus.OPEN } },
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.profitTargetReached).toBe(true);
      expect(riskResult.profitTarget?.currentValue.toNumber()).toBe(currentBalance);
      expect(riskResult.profitTarget?.profitTargetThreshold.toNumber()).toBe(TARGET_THRESHOLD);
      expect(riskResult.profitTarget?.remainingProfit.toNumber()).toBeCloseTo(-0.01, 2);
    });

    it('PT-005: Should reach target at 2 cents above ($10,400.02)', async () => {
      const currentBalance = TARGET_THRESHOLD + 0.02;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: {
          currentBalance: new Decimal(currentBalance),
          equity: new Decimal(currentBalance),
        },
      });

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: { where: { status: TradeStatus.OPEN } },
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.profitTargetReached).toBe(true);
      expect(riskResult.profitTarget?.currentValue.toNumber()).toBe(currentBalance);
      expect(riskResult.profitTarget?.profitTargetThreshold.toNumber()).toBe(TARGET_THRESHOLD);
      expect(riskResult.profitTarget?.remainingProfit.toNumber()).toBeCloseTo(-0.02, 2);
    });
  });

  describe('1.4 Minimum Trading Days Boundaries', () => {
    const REQUIRED_DAYS = 5;

    beforeEach(async () => {
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 10000,
        equity: 10000,
        highWaterMark: 10000,
        dailyStartBalance: 10000,
        dailyStartEquity: 10000,
        dailyLossLimit: 4.0,
        drawdownLimit: 4.0,
        profitTarget: 4.0,
        minTradingDays: REQUIRED_DAYS,
      });
    });

    async function createTradesForDays(days: number): Promise<void> {
      const trades = [];
      const startDate = new Date('2026-10-01T10:00:00Z');

      for (let i = 0; i < days; i++) {
        const tradeDate = new Date(startDate);
        tradeDate.setDate(startDate.getDate() + i);

        trades.push({
          tradingAccountId: testAccountId,
          symbol: 'EURUSD',
          side: 'BUY',
          volume: new Decimal(1.0),
          entryPrice: new Decimal(1.1000),
          currentPrice: new Decimal(1.1010),
          status: TradeStatus.CLOSED,
          realizedPnl: new Decimal(10),
          unrealizedPnl: new Decimal(0),
          openedAt: tradeDate,
          closedAt: new Date(tradeDate.getTime() + 3600000), // 1 hour later
        });
      }

      await prisma.trade.createMany({ data: trades });
    }

    it('MTD-001: Should NOT reach minimum at 3 days', async () => {
      await createTradesForDays(3);

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: true,
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.minTradingDaysReached).toBe(false);
      expect(riskResult.minTradingDays?.completedDays).toBe(3);
      expect(riskResult.minTradingDays?.requiredDays).toBe(REQUIRED_DAYS);
      expect(riskResult.minTradingDays?.remainingDays).toBe(2);
    });

    it('MTD-002: Should NOT reach minimum at 4 days', async () => {
      await createTradesForDays(4);

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: true,
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.minTradingDaysReached).toBe(false);
      expect(riskResult.minTradingDays?.completedDays).toBe(4);
      expect(riskResult.minTradingDays?.requiredDays).toBe(REQUIRED_DAYS);
      expect(riskResult.minTradingDays?.remainingDays).toBe(1);
    });

    it('MTD-003: Should reach minimum at exact 5 days', async () => {
      await createTradesForDays(5);

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: true,
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.minTradingDaysReached).toBe(true);
      expect(riskResult.minTradingDays?.completedDays).toBe(5);
      expect(riskResult.minTradingDays?.requiredDays).toBe(REQUIRED_DAYS);
      expect(riskResult.minTradingDays?.remainingDays).toBe(0);
    });

    it('MTD-004: Should reach minimum at 6 days', async () => {
      await createTradesForDays(6);

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: true,
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.minTradingDaysReached).toBe(true);
      expect(riskResult.minTradingDays?.completedDays).toBe(6);
      expect(riskResult.minTradingDays?.requiredDays).toBe(REQUIRED_DAYS);
      expect(riskResult.minTradingDays?.remainingDays).toBe(0);
    });

    it('MTD-005: Should reach minimum at 7 days', async () => {
      await createTradesForDays(7);

      const accountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: testAccountId },
        include: {
          ruleSnapshot: true,
          trades: true,
        },
      });

      const riskResult = await riskCalculationService.calculateRisk(accountSnapshot as any);

      expect(riskResult.minTradingDaysReached).toBe(true);
      expect(riskResult.minTradingDays?.completedDays).toBe(7);
      expect(riskResult.minTradingDays?.requiredDays).toBe(REQUIRED_DAYS);
      expect(riskResult.minTradingDays?.remainingDays).toBe(0);
    });
  });

  describe('1.7 Decimal Precision Tests', () => {
    beforeEach(async () => {
      testAccountId = await createTestAccount({
        initialBalance: 10000,
        currentBalance: 10000,
        equity: 10000,
        highWaterMark: 10000,
        dailyStartBalance: 10000,
        dailyStartEquity: 10000,
        dailyLossLimit: 4.0,
        drawdownLimit: 4.0,
        profitTarget: 4.0,
        minTradingDays: 5,
      });
    });

    it('DEC-001: Should handle repeating decimals without precision loss (1/3)', () => {
      const totalProfit = new Decimal(1000);
      const highestDay = new Decimal(333.33);

      const consistency = highestDay.div(totalProfit).mul(100);

      expect(consistency.toFixed(2)).toBe('33.33');

      // Verify no drift after reverse calculation
      const reconstructed = consistency.div(100).mul(totalProfit);
      expect(reconstructed.toFixed(2)).toBe('333.30'); // Acceptable rounding
    });

    it('DEC-002: Should handle repeating decimals (2/3)', () => {
      const totalProfit = new Decimal(1000);
      const highestDay = new Decimal(666.67);

      const consistency = highestDay.div(totalProfit).mul(100);

      expect(consistency.toFixed(2)).toBe('66.67');
    });

    it('DEC-003: Should handle very small values (0.01)', async () => {
      const currentBalance = 10000 - 0.01;
      await prisma.tradingAccount.update({
        where: { id: testAccountId },
        data: { currentBalance: new Decimal(currentBalance) },
      });

      const evaluation = await dailyLossService.evaluateDailyLoss(testAccountId);

      expect(evaluation.dailyLoss.toNumber()).toBe(0.01);
      expect(evaluation.breached).toBe(false);
    });

    it('DEC-004: Should handle very small values (0.001) with rounding', () => {
      const value = new Decimal(0.001);
      const rounded = FinancialCalculations.roundMoney(value);

      expect(rounded.toNumber()).toBe(0.00); // Rounds to 2 decimals
    });

    it('DEC-005: Should handle multiple decimal operations without drift', () => {
      const initialBalance = new Decimal(10000);
      const loss1 = new Decimal(123.45);
      const loss2 = new Decimal(67.89);
      const loss3 = new Decimal(234.56);

      const totalLoss = FinancialCalculations.add(
        FinancialCalculations.add(loss1, loss2),
        loss3
      );

      expect(totalLoss.toNumber()).toBe(425.90);

      const finalBalance = FinancialCalculations.subtract(initialBalance, totalLoss);
      expect(finalBalance.toNumber()).toBe(9574.10);
    });
  });
});
