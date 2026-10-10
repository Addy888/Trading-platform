import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Create adapter
const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'trading_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tradeing_db',
  allowPublicKeyRetrieval: true,
  connectionLimit: 10,
  acquireTimeout: 10000,
  idleTimeout: 60000,
});

const prisma = new PrismaClient({ adapter });

interface BackfillResult {
  accountId: string;
  accountNumber: string;
  success: boolean;
  error?: string;
  snapshotCreated?: boolean;
}

async function backfillRuleSnapshots(dryRun: boolean = true): Promise<BackfillResult[]> {
  console.log('🔍 Rule Snapshot Backfill Script');
  console.log('═'.repeat(80));
  console.log(`Mode: ${dryRun ? '🧪 DRY RUN (no changes will be made)' : '✅ LIVE (will create snapshots)'}\n`);

  // Find accounts missing snapshots
  const accounts = await prisma.tradingAccount.findMany({
    where: {
      ruleSnapshot: null,
    },
    select: {
      id: true,
      accountNumber: true,
      ruleSetId: true,
      status: true,
      createdAt: true,
      userId: true,
    },
  });

  console.log(`Found ${accounts.length} accounts without rule snapshots\n`);

  if (accounts.length === 0) {
    console.log('✅ No accounts need backfilling');
    return [];
  }

  const results: BackfillResult[] = [];

  for (const account of accounts) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Account: ${account.accountNumber} (${account.id})`);
    console.log(`Rule Set ID: ${account.ruleSetId}`);
    console.log(`Status: ${account.status}`);

    try {
      // Check if ruleSetId exists
      if (!account.ruleSetId) {
        console.log('❌ ERROR: Account has no ruleSetId - cannot backfill');
        results.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          success: false,
          error: 'No ruleSetId on account',
        });
        continue;
      }

      // Fetch the rule set to validate it exists and get rules
      const ruleSet = await prisma.ruleSet.findUnique({
        where: { id: account.ruleSetId },
        include: {
          ruleSetRules: {
            include: {
              rule: true,
            },
          },
        },
      });

      if (!ruleSet) {
        console.log(`❌ ERROR: RuleSet ${account.ruleSetId} not found in database`);
        results.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          success: false,
          error: `RuleSet ${account.ruleSetId} not found`,
        });
        continue;
      }

      console.log(`✅ RuleSet found: ${ruleSet.name}`);
      console.log(`   Rules count: ${ruleSet.ruleSetRules.length}`);

      // Build snapshot data
      const rules = ruleSet.ruleSetRules.map((rsr) => ({
        id: rsr.rule.id,
        name: rsr.rule.name,
        description: rsr.rule.description,
        type: rsr.rule.type,
        value: rsr.rule.value.toString(),
        isPercentage: rsr.rule.isPercentage,
        isActive: rsr.rule.isActive,
      }));

      const snapshotVersion = new Date().toISOString();

      if (dryRun) {
        console.log('🧪 DRY RUN: Would create snapshot with:');
        console.log(`   Snapshot Version: ${snapshotVersion}`);
        console.log(`   Rules: ${JSON.stringify(rules, null, 2)}`);
        results.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          success: true,
          snapshotCreated: false,
        });
      } else {
        // Actually create the snapshot in a transaction
        await prisma.$transaction(async (tx) => {
          // Double-check snapshot doesn't exist (race condition protection)
          const existing = await tx.accountRuleSnapshot.findUnique({
            where: { tradingAccountId: account.id },
          });

          if (existing) {
            console.log('⚠️  Snapshot already exists (created during this run?) - skipping');
            return;
          }

          // Create snapshot
          await tx.accountRuleSnapshot.create({
            data: {
              tradingAccountId: account.id,
              ruleSetId: ruleSet.id,
              ruleSetName: ruleSet.name,
              snapshotVersion,
              rules: rules,
            },
          });

          // Create audit log
          await tx.auditLog.create({
            data: {
              actorId: null, // System-initiated
              action: 'RULE_SNAPSHOT_BACKFILL',
              entityType: 'TradingAccount',
              entityId: account.id,
              metadata: {
                accountNumber: account.accountNumber,
                ruleSetId: ruleSet.id,
                ruleSetName: ruleSet.name,
                snapshotVersion,
                backfilledAt: new Date().toISOString(),
                reason: 'Missing snapshot detected - automatic backfill',
              },
            },
          });

          console.log('✅ Snapshot created successfully');
        });

        results.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          success: true,
          snapshotCreated: true,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ ERROR: ${errorMessage}`);
      results.push({
        accountId: account.id,
        accountNumber: account.accountNumber,
        success: false,
        error: errorMessage,
      });
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('BACKFILL SUMMARY');
  console.log('═'.repeat(80));

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const created = results.filter((r) => r.snapshotCreated).length;

  console.log(`Total accounts processed: ${results.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  if (!dryRun) {
    console.log(`Snapshots created: ${created}`);
  }

  if (failed > 0) {
    console.log('\n⚠️  Failed accounts:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`   - ${r.accountNumber}: ${r.error}`);
      });
  }

  if (dryRun && successful > 0) {
    console.log('\n✅ Dry run completed successfully');
    console.log('To apply these changes, run:');
    console.log('   npx ts-node scripts/backfill-rule-snapshots.ts --apply');
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  try {
    await backfillRuleSnapshots(dryRun);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
