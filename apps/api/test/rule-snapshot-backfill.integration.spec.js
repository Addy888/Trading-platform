"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const prisma_service_1 = require("../src/prisma/prisma.service");
const rule_snapshot_service_1 = require("../src/trading-accounts/rule-snapshot.service");
const rule_snapshot_backfill_service_1 = require("../src/trading-accounts/rule-snapshot-backfill.service");
const client_1 = require("@prisma/client");
describe('Rule Snapshot Backfill (Integration)', () => {
    let prisma;
    let ruleSnapshotService;
    let backfillService;
    let testUserId;
    let testRuleSetId;
    let testAccountId;
    beforeAll(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                prisma_service_1.PrismaService,
                rule_snapshot_service_1.RuleSnapshotService,
                rule_snapshot_backfill_service_1.RuleSnapshotBackfillService,
            ],
        }).compile();
        prisma = module.get(prisma_service_1.PrismaService);
        ruleSnapshotService = module.get(rule_snapshot_service_1.RuleSnapshotService);
        backfillService = module.get(rule_snapshot_backfill_service_1.RuleSnapshotBackfillService);
        const user = await prisma.user.create({
            data: {
                email: `test-${Date.now()}@test.com`,
                passwordHash: 'test',
                firstName: 'Test',
                lastName: 'User',
            },
        });
        testUserId = user.id;
        const rule1 = await prisma.tradingRule.create({
            data: {
                name: 'Test Daily Loss',
                type: client_1.RuleType.DAILY_LOSS,
                value: 5,
                isPercentage: true,
            },
        });
        const rule2 = await prisma.tradingRule.create({
            data: {
                name: 'Test Max Drawdown',
                type: client_1.RuleType.MAX_DRAWDOWN,
                value: 10,
                isPercentage: true,
            },
        });
        const ruleSet = await prisma.ruleSet.create({
            data: {
                name: 'Test Rule Set',
                ruleSetRules: {
                    create: [
                        { ruleId: rule1.id },
                        { ruleId: rule2.id },
                    ],
                },
            },
        });
        testRuleSetId = ruleSet.id;
    });
    afterAll(async () => {
        if (testAccountId) {
            await prisma.accountRuleSnapshot.deleteMany({
                where: { tradingAccountId: testAccountId },
            });
            await prisma.tradingAccount.delete({
                where: { id: testAccountId },
            });
        }
        await prisma.ruleSetRule.deleteMany({
            where: { ruleSetId: testRuleSetId },
        });
        await prisma.ruleSet.delete({
            where: { id: testRuleSetId },
        });
        await prisma.tradingRule.deleteMany({
            where: {
                name: { in: ['Test Daily Loss', 'Test Max Drawdown'] },
            },
        });
        await prisma.user.delete({
            where: { id: testUserId },
        });
        await prisma.$disconnect();
    });
    describe('Missing Snapshot Detection', () => {
        it('should find accounts without snapshots', async () => {
            const account = await prisma.tradingAccount.create({
                data: {
                    userId: testUserId,
                    challengePlanId: testRuleSetId,
                    orderId: testRuleSetId,
                    ruleSetId: testRuleSetId,
                    accountNumber: `TEST-${Date.now()}`,
                    initialBalance: 10000,
                    currentBalance: 10000,
                    equity: 10000,
                    status: client_1.TradingAccountStatus.ACTIVE,
                },
            });
            testAccountId = account.id;
            const missing = await backfillService.findAccountsMissingSnapshots();
            const hasOurAccount = missing.some(a => a.id === testAccountId);
            expect(hasOurAccount).toBe(true);
            if (hasOurAccount) {
                const ourAccount = missing.find(a => a.id === testAccountId);
                expect(ourAccount?.ruleSetId).toBe(testRuleSetId);
            }
        });
    });
    describe('Snapshot Backfill', () => {
        it('should backfill missing snapshot successfully', async () => {
            const result = await backfillService.backfillAccountSnapshot(testAccountId);
            expect(result.success).toBe(true);
            const snapshot = await prisma.accountRuleSnapshot.findUnique({
                where: { tradingAccountId: testAccountId },
            });
            expect(snapshot).toBeDefined();
            expect(snapshot?.ruleSetId).toBe(testRuleSetId);
            expect(Array.isArray(snapshot?.rules)).toBe(true);
        });
        it('should not create duplicate snapshot', async () => {
            const result = await backfillService.backfillAccountSnapshot(testAccountId);
            expect(result.success).toBe(false);
            expect(result.message).toContain('already exists');
        });
        it('should validate account has snapshot', async () => {
            const validation = await backfillService.validateAccountHasSnapshot(testAccountId);
            expect(validation.valid).toBe(true);
            expect(validation.error).toBeUndefined();
        });
    });
    describe('Audit Logging', () => {
        it('should create audit log for backfill', async () => {
            const auditLogs = await prisma.auditLog.findMany({
                where: {
                    action: 'RULE_SNAPSHOT_BACKFILL',
                    entityId: testAccountId,
                },
            });
            expect(auditLogs.length).toBeGreaterThan(0);
            const log = auditLogs[0];
            expect(log.entityType).toBe('TradingAccount');
            expect(log.metadata).toBeDefined();
        });
    });
});
//# sourceMappingURL=rule-snapshot-backfill.integration.spec.js.map