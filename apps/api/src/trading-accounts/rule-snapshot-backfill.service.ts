import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleSnapshotService } from './rule-snapshot.service';
import { Prisma } from '@prisma/client';

/**
 * Rule Snapshot Backfill Service
 * 
 * Repairs accounts that are missing rule snapshots.
 * 
 * CRITICAL SAFETY:
 * - Only backfills accounts that have a ruleSetId
 * - Uses the original ruleSetId from account creation
 * - Creates audit log for each backfill
 * - Transactional to prevent partial updates
 * - Does NOT modify existing snapshots
 */
@Injectable()
export class RuleSnapshotBackfillService {
  private readonly logger = new Logger(RuleSnapshotBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleSnapshot: RuleSnapshotService,
  ) {}

  /**
   * Find accounts missing rule snapshots
   */
  async findAccountsMissingSnapshots(): Promise<Array<{ id: string; accountNumber: string; ruleSetId: string | null }>> {
    const accounts = await this.prisma.tradingAccount.findMany({
      where: {
        ruleSnapshot: null,
      },
      select: {
        id: true,
        accountNumber: true,
        ruleSetId: true,
        status: true,
        createdAt: true,
      },
    });

    this.logger.log(`Found ${accounts.length} accounts without rule snapshots`);

    return accounts.map(a => ({
      id: a.id,
      accountNumber: a.accountNumber,
      ruleSetId: a.ruleSetId,
    }));
  }

  /**
   * Backfill rule snapshot for a single account
   * 
   * SAFETY: Only works if account has a ruleSetId
   */
  async backfillAccountSnapshot(accountId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Get account details
        const account = await tx.tradingAccount.findUnique({
          where: { id: accountId },
          select: {
            id: true,
            accountNumber: true,
            ruleSetId: true,
            userId: true,
            ruleSnapshot: true,
          },
        });

        if (!account) {
          throw new Error(`Account ${accountId} not found`);
        }

        // Check if snapshot already exists
        if (account.ruleSnapshot) {
          return { success: false, message: 'Snapshot already exists' };
        }

        // Check if account has ruleSetId
        if (!account.ruleSetId) {
          throw new Error(
            `Account ${account.accountNumber} has no ruleSetId. Cannot backfill without knowing original rules.`
          );
        }

        // Create snapshot using original ruleSetId
        await this.ruleSnapshot.createRuleSnapshot(accountId, account.ruleSetId, tx);

        // Create audit log
        await tx.auditLog.create({
          data: {
            actorId: null, // System-initiated
            action: 'RULE_SNAPSHOT_BACKFILL',
            entityType: 'TradingAccount',
            entityId: accountId,
            metadata: {
              accountNumber: account.accountNumber,
              ruleSetId: account.ruleSetId,
              userId: account.userId,
              backfilledAt: new Date().toISOString(),
              reason: 'Missing snapshot detected during system repair',
            },
          },
        });

        this.logger.log(
          `✅ Backfilled rule snapshot for account ${account.accountNumber} using ruleSet ${account.ruleSetId}`
        );
      });

      return { success: true, message: 'Snapshot backfilled successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to backfill snapshot for account ${accountId}: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Backfill all accounts missing snapshots
   */
  async backfillAllMissingSnapshots(): Promise<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
    details: Array<{ accountId: string; accountNumber: string; result: string }>;
  }> {
    const accounts = await this.findAccountsMissingSnapshots();
    
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const details: Array<{ accountId: string; accountNumber: string; result: string }> = [];

    this.logger.log(`Starting backfill for ${accounts.length} accounts`);

    for (const account of accounts) {
      if (!account.ruleSetId) {
        skippedCount++;
        details.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          result: 'SKIPPED: No ruleSetId',
        });
        continue;
      }

      const result = await this.backfillAccountSnapshot(account.id);
      
      if (result.success) {
        successCount++;
        details.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          result: 'SUCCESS',
        });
      } else {
        failedCount++;
        details.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          result: `FAILED: ${result.message}`,
        });
      }
    }

    this.logger.log(
      `Backfill completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`
    );

    return {
      total: accounts.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      details,
    };
  }

  /**
   * Validate that an account has required snapshot before trading
   * 
   * This should be called during order validation
   */
  async validateAccountHasSnapshot(accountId: string): Promise<{ valid: boolean; error?: string }> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountNumber: true,
        ruleSnapshot: true,
        ruleSetId: true,
      },
    });

    if (!account) {
      return { valid: false, error: 'Account not found' };
    }

    if (!account.ruleSnapshot) {
      // Attempt automatic backfill
      if (account.ruleSetId) {
        this.logger.warn(
          `Account ${account.accountNumber} missing snapshot. Attempting automatic backfill...`
        );
        
        const backfillResult = await this.backfillAccountSnapshot(accountId);
        
        if (backfillResult.success) {
          this.logger.log(
            `✅ Automatically backfilled snapshot for account ${account.accountNumber}`
          );
          return { valid: true };
        } else {
          return {
            valid: false,
            error: `Missing rule snapshot and backfill failed: ${backfillResult.message}`,
          };
        }
      } else {
        return {
          valid: false,
          error: 'Account has no rule snapshot and no ruleSetId for backfill. Contact support.',
        };
      }
    }

    return { valid: true };
  }
}
