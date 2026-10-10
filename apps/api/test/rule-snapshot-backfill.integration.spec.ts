import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { RuleSnapshotService } from '../src/trading-accounts/rule-snapshot.service';
import { RuleSnapshotBackfillService } from '../src/trading-accounts/rule-snapshot-backfill.service';
import { TradingAccountStatus, RuleType } from '@prisma/client';

describe('Rule Snapshot Backfill (Integration)', () => {
  let prisma: PrismaService;
  let ruleSnapshotService: RuleSnapshotService;
  let backfillService: RuleSnapshotBackfillService;
  let testUserId: string;
  let testRuleSetId: string;
  let testAccountId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        RuleSnapshotService,
        RuleSnapshotBackfillService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    ruleSnapshotService = module.get<RuleSnapshotService>(RuleSnapshotService);
    backfillService = module.get<RuleSnapshotBackfillService>(RuleSnapshotBackfillService);

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@test.com`,
        passwordHash: 'test',
        firstName: 'Test',
        lastName: 'User',
      },
    });
    testUserId = user.id;

    // Create test rules
    const rule1 = await prisma.tradingRule.create({
      data: {
        name: 'Test Daily Loss',
        type: RuleType.DAILY_LOSS,
        value: 5,
        isPercentage: true,
      },
    });

    const rule2 = await prisma.tradingRule.create({
      data: {
        name: 'Test Max Drawdown',
        type: RuleType.MAX_DRAWDOWN,
        value: 10,
        isPercentage: true,
      },
    });

    // Create test rule set
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
    // Clean up test data
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
      // Create account without snapshot
      const account = await prisma.tradingAccount.create({
        data: {
          userId: testUserId,
          challengePlanId: testRuleSetId, // Using ruleSetId as planId for test
          orderId: testRuleSetId, // Using ruleSetId as orderId for test  
          ruleSetId: testRuleSetId,
          accountNumber: `TEST-${Date.now()}`,
          initialBalance: 10000,
          currentBalance: 10000,
          equity: 10000,
          status: TradingAccountStatus.ACTIVE,
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
      
      // Verify snapshot was created
      const snapshot = await prisma.accountRuleSnapshot.findUnique({
        where: { tradingAccountId: testAccountId },
      });
      
      expect(snapshot).toBeDefined();
      expect(snapshot?.ruleSetId).toBe(testRuleSetId);
      expect(Array.isArray(snapshot?.rules)).toBe(true);
    });

    it('should not create duplicate snapshot', async () => {
      // Try to backfill again
      const result = await backfillService.backfillAccountSnapshot(testAccountId);
      
      // Should report already exists
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
