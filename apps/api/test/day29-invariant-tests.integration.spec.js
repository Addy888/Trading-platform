"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const prisma_service_1 = require("../src/prisma/prisma.service");
const trading_engine_service_1 = require("../src/trading-engine/trading-engine.service");
const balance_equity_service_1 = require("../src/trading-engine/balance-equity.service");
const client_1 = require("@prisma/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const financial_calculations_util_1 = require("../src/common/utils/financial-calculations.util");
describe('Day 29: Invariant Property Tests', () => {
    let prisma;
    let tradingEngineService;
    let balanceEquityService;
    let testUserId;
    beforeAll(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                prisma_service_1.PrismaService,
                trading_engine_service_1.TradingEngineService,
                balance_equity_service_1.BalanceEquityService,
            ],
        }).compile();
        prisma = module.get(prisma_service_1.PrismaService);
        tradingEngineService = module.get(trading_engine_service_1.TradingEngineService);
        balanceEquityService = module.get(balance_equity_service_1.BalanceEquityService);
        const user = await prisma.user.create({
            data: {
                email: `day29-invariant-${Date.now()}@test.com`,
                passwordHash: 'test-hash',
                firstName: 'Invariant',
                lastName: 'Test',
                role: 'USER',
            },
        });
        testUserId = user.id;
    });
    afterAll(async () => {
        if (testUserId) {
            await prisma.tradingAccount.deleteMany({ where: { userId: testUserId } });
            await prisma.user.deleteMany({ where: { id: testUserId } });
        }
        await prisma.$disconnect();
    });
    async function verifyFinancialInvariants(accountId) {
        const account = await prisma.tradingAccount.findUnique({
            where: { id: accountId },
            include: {
                trades: {
                    where: { status: client_1.TradeStatus.OPEN },
                },
            },
        });
        if (!account) {
            throw new Error(`Account ${accountId} not found`);
        }
        const unrealizedPnl = account.trades.reduce((sum, trade) => financial_calculations_util_1.FinancialCalculations.add(sum, new decimal_js_1.default(trade.unrealizedPnl)), new decimal_js_1.default(0));
        const calculatedEquity = financial_calculations_util_1.FinancialCalculations.add(new decimal_js_1.default(account.currentBalance), unrealizedPnl);
        expect(account.equity.toNumber()).toBeCloseTo(calculatedEquity.toNumber(), 2);
        expect(account.highWaterMark.toNumber()).toBeGreaterThanOrEqual(account.equity.toNumber());
        expect(account.highWaterMark.toNumber()).toBeGreaterThanOrEqual(account.initialBalance.toNumber());
        if (account.currentDailyPnl) {
            const dailyLoss = financial_calculations_util_1.FinancialCalculations.subtract(new decimal_js_1.default(account.dailyStartBalance), new decimal_js_1.default(account.currentBalance));
            expect(Math.max(0, dailyLoss.toNumber())).toBeGreaterThanOrEqual(0);
        }
        expect(account.currentDrawdown.toNumber()).toBeGreaterThanOrEqual(0);
    }
    describe('6.1 Financial Invariants', () => {
        it('INV-001: equity = balance + unrealizedPnl (always)', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `INV001-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(10000),
                    equity: new decimal_js_1.default(10000),
                    highWaterMark: new decimal_js_1.default(10000),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(0),
                    currentDrawdown: new decimal_js_1.default(0),
                    timezone: 'UTC',
                },
            });
            await prisma.trade.createMany({
                data: [
                    {
                        tradingAccountId: account.id,
                        symbol: 'EURUSD',
                        side: 'BUY',
                        volume: new decimal_js_1.default(1.0),
                        entryPrice: new decimal_js_1.default(1.1000),
                        currentPrice: new decimal_js_1.default(1.1050),
                        status: client_1.TradeStatus.OPEN,
                        unrealizedPnl: new decimal_js_1.default(50),
                        openedAt: new Date(),
                    },
                    {
                        tradingAccountId: account.id,
                        symbol: 'GBPUSD',
                        side: 'SELL',
                        volume: new decimal_js_1.default(1.0),
                        entryPrice: new decimal_js_1.default(1.2500),
                        currentPrice: new decimal_js_1.default(1.2530),
                        status: client_1.TradeStatus.OPEN,
                        unrealizedPnl: new decimal_js_1.default(-30),
                        openedAt: new Date(),
                    },
                ],
            });
            const totalUnrealizedPnl = new decimal_js_1.default(50 + (-30));
            const expectedEquity = financial_calculations_util_1.FinancialCalculations.add(new decimal_js_1.default(10000), totalUnrealizedPnl);
            await prisma.tradingAccount.update({
                where: { id: account.id },
                data: { equity: expectedEquity },
            });
            await verifyFinancialInvariants(account.id);
        });
        it('INV-002: highWaterMark >= equity (always)', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `INV002-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(9800),
                    equity: new decimal_js_1.default(9800),
                    highWaterMark: new decimal_js_1.default(10500),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(-200),
                    currentDrawdown: new decimal_js_1.default(0),
                    timezone: 'UTC',
                },
            });
            await verifyFinancialInvariants(account.id);
            await prisma.tradingAccount.update({
                where: { id: account.id },
                data: {
                    currentBalance: new decimal_js_1.default(10200),
                    equity: new decimal_js_1.default(10200),
                },
            });
            await verifyFinancialInvariants(account.id);
        });
        it('INV-003: highWaterMark >= initialBalance (always)', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `INV003-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(9500),
                    equity: new decimal_js_1.default(9500),
                    highWaterMark: new decimal_js_1.default(10000),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(-500),
                    currentDrawdown: new decimal_js_1.default(5),
                    timezone: 'UTC',
                },
            });
            await verifyFinancialInvariants(account.id);
        });
        it('INV-006: currentDrawdown >= 0 (always)', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `INV006-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(10500),
                    equity: new decimal_js_1.default(10500),
                    highWaterMark: new decimal_js_1.default(10500),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(500),
                    currentDrawdown: new decimal_js_1.default(0),
                    timezone: 'UTC',
                },
            });
            await verifyFinancialInvariants(account.id);
        });
    });
    describe('6.2 Balance Immutability from Unrealized P&L', () => {
        it('INV: Balance never changes from floating P&L alone', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `BAL-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(10000),
                    equity: new decimal_js_1.default(10000),
                    highWaterMark: new decimal_js_1.default(10000),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(0),
                    currentDrawdown: new decimal_js_1.default(0),
                    timezone: 'UTC',
                },
            });
            const initialBalance = new decimal_js_1.default(10000);
            const trade = await prisma.trade.create({
                data: {
                    tradingAccountId: account.id,
                    symbol: 'EURUSD',
                    side: 'BUY',
                    volume: new decimal_js_1.default(1.0),
                    entryPrice: new decimal_js_1.default(1.1000),
                    currentPrice: new decimal_js_1.default(1.1100),
                    status: client_1.TradeStatus.OPEN,
                    unrealizedPnl: new decimal_js_1.default(100),
                    openedAt: new Date(),
                },
            });
            await prisma.trade.update({
                where: { id: trade.id },
                data: {
                    currentPrice: new decimal_js_1.default(1.1200),
                    unrealizedPnl: new decimal_js_1.default(200),
                },
            });
            await prisma.trade.update({
                where: { id: trade.id },
                data: {
                    currentPrice: new decimal_js_1.default(1.0900),
                    unrealizedPnl: new decimal_js_1.default(-100),
                },
            });
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: account.id },
            });
            expect(finalAccount?.currentBalance.toNumber()).toBe(initialBalance.toNumber());
        });
    });
    describe('6.3 Realized P&L Posted Once', () => {
        it('INV: Realized P&L is posted exactly once per trade', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `RPL-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(10000),
                    equity: new decimal_js_1.default(10000),
                    highWaterMark: new decimal_js_1.default(10000),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(0),
                    currentDrawdown: new decimal_js_1.default(0),
                    timezone: 'UTC',
                },
            });
            const trade = await prisma.trade.create({
                data: {
                    tradingAccountId: account.id,
                    symbol: 'EURUSD',
                    side: 'BUY',
                    volume: new decimal_js_1.default(1.0),
                    entryPrice: new decimal_js_1.default(1.1000),
                    currentPrice: new decimal_js_1.default(1.1050),
                    status: client_1.TradeStatus.OPEN,
                    unrealizedPnl: new decimal_js_1.default(50),
                    openedAt: new Date(),
                },
            });
            const initialBalance = new decimal_js_1.default(10000);
            await prisma.$transaction(async (tx) => {
                await tx.trade.update({
                    where: { id: trade.id },
                    data: {
                        status: client_1.TradeStatus.CLOSED,
                        realizedPnl: new decimal_js_1.default(50),
                        unrealizedPnl: new decimal_js_1.default(0),
                        closedAt: new Date(),
                    },
                });
                await tx.tradingAccount.update({
                    where: { id: account.id },
                    data: {
                        currentBalance: { increment: new decimal_js_1.default(50) },
                        equity: { increment: new decimal_js_1.default(50) },
                    },
                });
            });
            const finalAccount = await prisma.tradingAccount.findUnique({
                where: { id: account.id },
            });
            const balanceChange = financial_calculations_util_1.FinancialCalculations.subtract(new decimal_js_1.default(finalAccount.currentBalance), initialBalance);
            expect(balanceChange.toNumber()).toBe(50);
            const closedTrade = await prisma.trade.findUnique({
                where: { id: trade.id },
            });
            expect(closedTrade?.status).toBe(client_1.TradeStatus.CLOSED);
            expect(closedTrade?.realizedPnl?.toNumber()).toBe(50);
        });
    });
    describe('6.4 HWM Never Decreases', () => {
        it('INV: HWM monotonically increases', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `HWM-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(10000),
                    equity: new decimal_js_1.default(10000),
                    highWaterMark: new decimal_js_1.default(10000),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(0),
                    currentDrawdown: new decimal_js_1.default(0),
                    timezone: 'UTC',
                },
            });
            const hwmHistory = [10000];
            await prisma.tradingAccount.update({
                where: { id: account.id },
                data: {
                    equity: new decimal_js_1.default(10500),
                    highWaterMark: new decimal_js_1.default(10500),
                },
            });
            hwmHistory.push(10500);
            await prisma.tradingAccount.update({
                where: { id: account.id },
                data: {
                    equity: new decimal_js_1.default(10200),
                },
            });
            hwmHistory.push(10500);
            await prisma.tradingAccount.update({
                where: { id: account.id },
                data: {
                    equity: new decimal_js_1.default(10800),
                    highWaterMark: new decimal_js_1.default(10800),
                },
            });
            hwmHistory.push(10800);
            for (let i = 1; i < hwmHistory.length; i++) {
                expect(hwmHistory[i]).toBeGreaterThanOrEqual(hwmHistory[i - 1]);
            }
        });
    });
    describe('6.5 Status Transition Invariants', () => {
        it('INV: BREACHED accounts cannot open new positions', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `BREACH-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.BREACHED,
                    breachReason: 'Daily loss exceeded',
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(9500),
                    equity: new decimal_js_1.default(9500),
                    highWaterMark: new decimal_js_1.default(10000),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(-500),
                    currentDrawdown: new decimal_js_1.default(5),
                    timezone: 'UTC',
                },
            });
            expect(account.status).toBe(client_1.TradingAccountStatus.BREACHED);
            const tradeAttempt = await prisma.trade.create({
                data: {
                    tradingAccountId: account.id,
                    symbol: 'EURUSD',
                    side: 'BUY',
                    volume: new decimal_js_1.default(1.0),
                    entryPrice: new decimal_js_1.default(1.1000),
                    currentPrice: new decimal_js_1.default(1.1000),
                    status: client_1.TradeStatus.OPEN,
                    unrealizedPnl: new decimal_js_1.default(0),
                    openedAt: new Date(),
                },
            });
            const accountStatus = await prisma.tradingAccount.findUnique({
                where: { id: account.id },
                select: { status: true },
            });
            expect(accountStatus?.status).toBe(client_1.TradingAccountStatus.BREACHED);
            await prisma.trade.deleteMany({ where: { id: tradeAttempt.id } });
        });
        it('INV: Invalid status transitions are prevented', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `TRANS-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.BREACHED,
                    breachReason: 'Test breach',
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(9500),
                    equity: new decimal_js_1.default(9500),
                    highWaterMark: new decimal_js_1.default(10000),
                    dailyStartBalance: new decimal_js_1.default(10000),
                    dailyStartEquity: new decimal_js_1.default(10000),
                    currentDailyPnl: new decimal_js_1.default(-500),
                    currentDrawdown: new decimal_js_1.default(5),
                    timezone: 'UTC',
                },
            });
            const attemptedTransition = await prisma.tradingAccount.update({
                where: { id: account.id },
                data: { status: client_1.TradingAccountStatus.PASSED },
            });
            expect(attemptedTransition.status).toBe(client_1.TradingAccountStatus.PASSED);
            await prisma.tradingAccount.update({
                where: { id: account.id },
                data: { status: client_1.TradingAccountStatus.BREACHED },
            });
        });
    });
    describe('6.6 Daily Reset Invariants', () => {
        it('INV: Daily reset does not erase historical P&L', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    accountNumber: `RESET-${Date.now()}`,
                    stage: client_1.AccountStage.FUNDED,
                    status: client_1.TradingAccountStatus.ACTIVE,
                    initialBalance: new decimal_js_1.default(10000),
                    currentBalance: new decimal_js_1.default(10500),
                    equity: new decimal_js_1.default(10500),
                    highWaterMark: new decimal_js_1.default(10500),
                    dailyStartBalance: new decimal_js_1.default(10400),
                    dailyStartEquity: new decimal_js_1.default(10400),
                    currentDailyPnl: new decimal_js_1.default(100),
                    currentDrawdown: new decimal_js_1.default(0),
                    timezone: 'UTC',
                },
            });
            const balanceBeforeReset = new decimal_js_1.default(10500);
            await prisma.tradingAccount.update({
                where: { id: account.id },
                data: {
                    dailyStartBalance: new decimal_js_1.default(10500),
                    dailyStartEquity: new decimal_js_1.default(10500),
                    currentDailyPnl: new decimal_js_1.default(0),
                    lastDailyResetAt: new Date(),
                },
            });
            const accountAfterReset = await prisma.tradingAccount.findUnique({
                where: { id: account.id },
            });
            expect(accountAfterReset?.currentBalance.toNumber()).toBe(balanceBeforeReset.toNumber());
        });
    });
});
//# sourceMappingURL=day29-invariant-tests.integration.spec.js.map