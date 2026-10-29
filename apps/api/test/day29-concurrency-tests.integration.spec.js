"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const prisma_service_1 = require("../src/prisma/prisma.service");
const daily_loss_service_1 = require("../src/daily-loss/daily-loss.service");
const risk_evaluation_service_1 = require("../src/risk-engine/risk-evaluation.service");
const trading_engine_service_1 = require("../src/trading-engine/trading-engine.service");
const balance_equity_service_1 = require("../src/trading-engine/balance-equity.service");
const max_drawdown_service_1 = require("../src/max-drawdown/max-drawdown.service");
const payouts_service_1 = require("../src/payouts/payouts.service");
const client_1 = require("@prisma/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const event_emitter_1 = require("@nestjs/event-emitter");
describe('Day 29: Concurrency Tests', () => {
    let prisma;
    let dailyLossService;
    let riskEvaluationService;
    let tradingEngineService;
    let balanceEquityService;
    let maxDrawdownService;
    let payoutsService;
    let eventEmitter;
    let testUserId;
    let testAccountId;
    beforeAll(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                prisma_service_1.PrismaService,
                daily_loss_service_1.DailyLossService,
                risk_evaluation_service_1.RiskEvaluationService,
                trading_engine_service_1.TradingEngineService,
                balance_equity_service_1.BalanceEquityService,
                max_drawdown_service_1.MaxDrawdownService,
                payouts_service_1.PayoutsService,
                event_emitter_1.EventEmitter2,
            ],
        }).compile();
        prisma = module.get(prisma_service_1.PrismaService);
        dailyLossService = module.get(daily_loss_service_1.DailyLossService);
        riskEvaluationService = module.get(risk_evaluation_service_1.RiskEvaluationService);
        tradingEngineService = module.get(trading_engine_service_1.TradingEngineService);
        balanceEquityService = module.get(balance_equity_service_1.BalanceEquityService);
        maxDrawdownService = module.get(max_drawdown_service_1.MaxDrawdownService);
        payoutsService = module.get(payouts_service_1.PayoutsService);
        eventEmitter = module.get(event_emitter_1.EventEmitter2);
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
    async function createTestAccount(config) {
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
                stage: client_1.AccountStage.FUNDED,
                status: client_1.TradingAccountStatus.ACTIVE,
                initialBalance: new decimal_js_1.default(config.initialBalance),
                currentBalance: new decimal_js_1.default(config.currentBalance),
                equity: new decimal_js_1.default(config.equity),
                highWaterMark: new decimal_js_1.default(config.initialBalance),
                dailyStartBalance: new decimal_js_1.default(config.initialBalance),
                dailyStartEquity: new decimal_js_1.default(config.initialBalance),
                currentDailyPnl: new decimal_js_1.default(0),
                currentDrawdown: new decimal_js_1.default(0),
                timezone: 'UTC',
                startedAt: new Date(),
            },
        });
        await prisma.accountRuleSnapshot.create({
            data: {
                tradingAccountId: account.id,
                snapshotVersion: 'v1.0-concurrent-test',
                rules: rules,
                snapshotReason: 'Day 29 Concurrency Test',
            },
        });
        return account.id;
    }
    describe('2.1 Simultaneous Trade Closes Causing Breach', () => {
        it('should handle simultaneous trade closes without duplicate breach events', async () => {
            testAccountId = await createTestAccount({
                initialBalance: 10000,
                currentBalance: 9650,
                equity: 9650,
                dailyLossLimit: 4.0,
                drawdownLimit: 4.0,
            });
            const trade1 = await prisma.trade.create({
                data: {
                    tradingAccountId: testAccountId,
                    symbol: 'EURUSD',
                    side: 'BUY',
                    volume: new decimal_js_1.default(1.0),
                    entryPrice: new decimal_js_1.default(1.1000),
                    currentPrice: new decimal_js_1.default(1.0970),
                    status: client_1.TradeStatus.OPEN,
                    unrealizedPnl: new decimal_js_1.default(-30),
                    realizedPnl: null,
                    openedAt: new Date(),
                },
            });
            const trade2 = await prisma.trade.create({
                data: {
                    tradingAccountId: testAccountId,
                    symbol: 'GBPUSD',
                    side: 'BUY',
                    volume: new decimal_js_1.default(1.0),
                    entryPrice: new decimal_js_1.default(1.2500),
                    currentPrice: new decimal_js_1.default(1.2470),
                    status: client_1.TradeStatus.OPEN,
                    unrealizedPnl: new decimal_js_1.default(-30),
                    realizedPnl: null,
                    openedAt: new Date(),
                },
            });
            const closeResults = await Promise.allSettled([
                prisma.$transaction(async (tx) => {
                    await tx.trade.update({
                        where: { id: trade1.id },
                        data: {
                            status: client_1.TradeStatus.CLOSED,
                            realizedPnl: new decimal_js_1.default(-30),
                            unrealizedPnl: new decimal_js_1.default(0),
                            closedAt: new Date(),
                        },
                    });
                    await tx.tradingAccount.update({
                        where: { id: testAccountId },
                        data: {
                            currentBalance: { decrement: new decimal_js_1.default(30) },
                            equity: { decrement: new decimal_js_1.default(30) },
                        },
                    });
                }),
                prisma.$transaction(async (tx) => {
                    await tx.trade.update({
                        where: { id: trade2.id },
                        data: {
                            status: client_1.TradeStatus.CLOSED,
                            realizedPnl: new decimal_js_1.default(-30),
                            unrealizedPnl: new decimal_js_1.default(0),
                            closedAt: new Date(),
                        },
                    });
                    await tx.tradingAccount.update({
                        where: { id: testAccountId },
                        data: {
                            currentBalance: { decrement: new decimal_js_1.default(30) },
                            equity: { decrement: new decimal_js_1.default(30) },
                        },
                    });
                }),
            ]);
            expect(closeResults.every(r => r.status === 'fulfilled')).toBe(true);
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(finalAccount?.status).toBe(client_1.TradingAccountStatus.ACTIVE);
            expect(finalAccount?.currentBalance.toNumber()).toBeLessThanOrEqual(9650 - 60);
            await riskEvaluationService.evaluateAccount(testAccountId);
            const accountAfterEval = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(accountAfterEval?.status).toBe(client_1.TradingAccountStatus.BREACHED);
            const breachLogs = await prisma.auditLog.findMany({
                where: {
                    entityId: testAccountId,
                    action: 'DAILY_LOSS_BREACH',
                },
            });
            expect(breachLogs.length).toBe(1);
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
            const initialAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(initialAccount?.highWaterMark.toNumber()).toBe(10000);
            const updates = [
                new decimal_js_1.default(10050),
                new decimal_js_1.default(10100),
                new decimal_js_1.default(10150),
            ];
            const updateResults = await Promise.allSettled(updates.map((newEquity) => maxDrawdownService.updateHighWaterMark(testAccountId, newEquity)));
            expect(updateResults.every(r => r.status === 'fulfilled')).toBe(true);
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(finalAccount?.highWaterMark.toNumber()).toBe(10150);
            expect(finalAccount?.highWaterMark.toNumber()).toBeGreaterThanOrEqual(10000);
        });
        it('should never decrease HWM', async () => {
            testAccountId = await createTestAccount({
                initialBalance: 10000,
                currentBalance: 10000,
                equity: 10000,
                dailyLossLimit: 4.0,
                drawdownLimit: 4.0,
            });
            await prisma.tradingAccount.update({
                where: { id: testAccountId },
                data: { highWaterMark: new decimal_js_1.default(10200) },
            });
            const lowerValues = [
                new decimal_js_1.default(10100),
                new decimal_js_1.default(10150),
                new decimal_js_1.default(10000),
            ];
            await Promise.all(lowerValues.map((value) => maxDrawdownService.updateHighWaterMark(testAccountId, value)));
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(finalAccount?.highWaterMark.toNumber()).toBe(10200);
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
            const resetResults = await Promise.allSettled([
                prisma.$transaction((tx) => dailyLossService.performDailyReset(testAccountId, resetTime, tx)),
                prisma.$transaction((tx) => dailyLossService.performDailyReset(testAccountId, resetTime, tx)),
                prisma.$transaction((tx) => dailyLossService.performDailyReset(testAccountId, resetTime, tx)),
            ]);
            const succeeded = resetResults.filter(r => r.status === 'fulfilled');
            expect(succeeded.length).toBeGreaterThanOrEqual(1);
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(finalAccount?.dailyStartBalance.toNumber()).toBe(9800);
            expect(finalAccount?.currentDailyPnl.toNumber()).toBe(0);
            expect(finalAccount?.lastDailyResetAt).toBeTruthy();
            const snapshots = await prisma.dailySnapshot.findMany({
                where: {
                    tradingAccountId: testAccountId,
                    tradingDay: {
                        gte: new Date('2026-10-10T00:00:00Z'),
                        lt: new Date('2026-10-11T00:00:00Z'),
                    },
                },
            });
            expect(snapshots.length).toBe(1);
        });
    });
    describe('2.8 Risk Evaluation Idempotency', () => {
        it('should not create duplicate breach events when evaluated multiple times', async () => {
            testAccountId = await createTestAccount({
                initialBalance: 10000,
                currentBalance: 9550,
                equity: 9550,
                dailyLossLimit: 4.0,
                drawdownLimit: 4.0,
            });
            const evaluationResults = await Promise.allSettled([
                riskEvaluationService.evaluateAccount(testAccountId),
                riskEvaluationService.evaluateAccount(testAccountId),
                riskEvaluationService.evaluateAccount(testAccountId),
                riskEvaluationService.evaluateAccount(testAccountId),
                riskEvaluationService.evaluateAccount(testAccountId),
            ]);
            expect(evaluationResults.every(r => r.status === 'fulfilled')).toBe(true);
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(finalAccount?.status).toBe(client_1.TradingAccountStatus.BREACHED);
            const breachLogs = await prisma.auditLog.findMany({
                where: {
                    entityId: testAccountId,
                    action: { contains: 'BREACH' },
                },
            });
            expect(breachLogs.length).toBe(1);
        });
    });
    describe('2.10 Simultaneous Breach Precedence', () => {
        it('should prioritize DAILY_LOSS over MAX_DRAWDOWN when both breach simultaneously', async () => {
            testAccountId = await createTestAccount({
                initialBalance: 10000,
                currentBalance: 9550,
                equity: 9550,
                dailyLossLimit: 4.0,
                drawdownLimit: 4.0,
            });
            await prisma.tradingAccount.update({
                where: { id: testAccountId },
                data: { highWaterMark: new decimal_js_1.default(10000) },
            });
            await riskEvaluationService.evaluateAccount(testAccountId);
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(finalAccount?.status).toBe(client_1.TradingAccountStatus.BREACHED);
            expect(finalAccount?.breachReason).toContain('Daily');
            const breachLog = await prisma.auditLog.findFirst({
                where: {
                    entityId: testAccountId,
                    action: 'DAILY_LOSS_BREACH',
                },
            });
            expect(breachLog).toBeTruthy();
        });
        it('should NOT mark as PASSED when breach condition exists', async () => {
            testAccountId = await createTestAccount({
                initialBalance: 10000,
                currentBalance: 10400,
                equity: 9550,
                dailyLossLimit: 4.0,
                drawdownLimit: 4.0,
            });
            await prisma.tradingAccount.update({
                where: { id: testAccountId },
                data: { highWaterMark: new decimal_js_1.default(10000) },
            });
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
                    ],
                },
            });
            await riskEvaluationService.evaluateAccount(testAccountId);
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: testAccountId },
            });
            expect(finalAccount?.status).toBe(client_1.TradingAccountStatus.BREACHED);
            expect(finalAccount?.status).not.toBe(client_1.TradingAccountStatus.PASSED);
        });
    });
});
//# sourceMappingURL=day29-concurrency-tests.integration.spec.js.map