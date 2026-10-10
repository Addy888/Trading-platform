import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InactivityService } from './inactivity.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Day 23: Inactivity Scheduler Service
 * 
 * Responsible for periodically checking accounts for inactivity.
 * 
 * FEATURES:
 * - Batch processing of accounts
 * - Idempotent execution (safe to retry)
 * - Error isolation (one account failure doesn't stop batch)
 * - Configurable check interval
 * - Manual trigger support
 * 
 * SCHEDULER LOGIC:
 * 1. Find accounts eligible for evaluation
 * 2. Load pinned rules
 * 3. Calculate inactivity
 * 4. Apply lifecycle action if threshold reached
 * 5. Send notifications
 * 6. Record audit events
 * 
 * CONCURRENCY PROTECTION:
 * - Transaction-based updates
 * - Re-check status before transition
 * - Idempotent operations
 * 
 * IMPLEMENTATION NOTE:
 * Uses simple setInterval for scheduling.
 * For production, consider:
 * - @nestjs/schedule with cron
 * - Bull/BullMQ job queue
 * - External scheduler (Kubernetes CronJob)
 */
@Injectable()
export class InactivitySchedulerService implements OnModuleInit {
  private readonly logger = new Logger(InactivitySchedulerService.name);
  private schedulerInterval: NodeJS.Timeout | null = null;

  // Check interval: every 6 hours
  private readonly CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

  // Batch size for account processing
  private readonly BATCH_SIZE = 50;

  // Track last check timestamp
  private lastCheckTimestamp: Date | null = null;

  constructor(
    private readonly inactivityService: InactivityService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Initialize scheduler on module startup
   */
  async onModuleInit() {
    this.logger.log('Inactivity Scheduler initialized');
    
    // Start scheduler
    this.startScheduler();
  }

  /**
   * Start the inactivity checker
   */
  private startScheduler(): void {
    if (this.schedulerInterval) {
      this.logger.warn('Scheduler already running');
      return;
    }

    this.logger.log(
      `Starting inactivity scheduler (check interval: ${this.CHECK_INTERVAL_MS / 1000}s)`,
    );

    // Run immediately on startup
    this.checkInactivityForAllAccounts().catch((error) => {
      this.logger.error(
        `Initial inactivity check failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    });

    // Schedule periodic checks
    this.schedulerInterval = setInterval(async () => {
      try {
        await this.checkInactivityForAllAccounts();
      } catch (error) {
        this.logger.error(
          `Scheduler error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Check inactivity for all eligible accounts
   * 
   * Processes accounts in batches to avoid overwhelming the system.
   * 
   * @returns Number of accounts processed
   */
  async checkInactivityForAllAccounts(): Promise<{
    total: number;
    suspended: number;
    warned: number;
    errors: number;
  }> {
    const startTime = Date.now();
    this.logger.log('Starting inactivity check for all accounts');

    const stats = {
      total: 0,
      suspended: 0,
      warned: 0,
      errors: 0,
    };

    try {
      // Get eligible accounts
      const accountIds = await this.inactivityService.getAccountsForEvaluation(
        this.BATCH_SIZE,
      );

      if (accountIds.length === 0) {
        this.logger.log('No accounts eligible for inactivity evaluation');
        this.lastCheckTimestamp = new Date();
        return stats;
      }

      this.logger.log(
        `Found ${accountIds.length} accounts eligible for inactivity evaluation`,
      );

      // Process each account
      for (const accountId of accountIds) {
        try {
          stats.total++;
          
          const result = await this.evaluateAccountInactivity(accountId);
          
          if (result.suspended) stats.suspended++;
          if (result.warned) stats.warned++;
        } catch (error) {
          stats.errors++;
          this.logger.error(
            `Failed to evaluate inactivity for account ${accountId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // Continue processing other accounts
        }
      }

      this.lastCheckTimestamp = new Date();
      const duration = Date.now() - startTime;

      this.logger.log(
        `Inactivity check completed in ${duration}ms: ` +
        `${stats.total} evaluated, ${stats.suspended} suspended, ` +
        `${stats.warned} warned, ${stats.errors} errors`,
      );

      return stats;
    } catch (error) {
      this.logger.error(
        `Fatal error in inactivity check: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Evaluate inactivity for a single account
   * 
   * @param accountId Trading account ID
   * @returns Evaluation result
   */
  private async evaluateAccountInactivity(accountId: string): Promise<{
    suspended: boolean;
    warned: boolean;
  }> {
    const result = { suspended: false, warned: false };

    // Evaluate inactivity
    const evaluation = await this.inactivityService.evaluateInactivity(accountId);

    // If inactivity not enabled, skip
    if (!evaluation.inactivityEnabled) {
      return result;
    }

    // If account is inactive, suspend it
    if (evaluation.isInactive) {
      await this.prisma.$transaction(async (tx) => {
        await this.inactivityService.markAccountInactive(accountId, evaluation, tx);
      });

      result.suspended = true;

      // Emit event for notification (after transaction)
      this.eventEmitter.emit('account.suspended.inactivity', {
        accountId,
        evaluation,
      });

      return result;
    }

    // Check if warning should be sent
    if (this.inactivityService.shouldWarn(evaluation)) {
      // Check if warning already sent recently (within last 24 hours)
      const recentWarning = await this.hasRecentInactivityWarning(accountId);
      
      if (!recentWarning) {
        result.warned = true;

        // Emit event for warning notification
        this.eventEmitter.emit('account.inactivity.warning', {
          accountId,
          evaluation,
          daysRemaining: this.inactivityService.getDaysUntilInactive(evaluation),
        });
      }
    }

    return result;
  }

  /**
   * Check if account has recent inactivity warning
   * 
   * Prevents spam by checking if warning sent in last 24 hours.
   * 
   * @param accountId Trading account ID
   * @returns True if recent warning exists
   */
  private async hasRecentInactivityWarning(accountId: string): Promise<boolean> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentWarning = await this.prisma.auditLog.findFirst({
      where: {
        entityId: accountId,
        entityType: 'TradingAccount',
        action: 'INACTIVITY_WARNING_SENT',
        createdAt: {
          gte: twentyFourHoursAgo,
        },
      },
    });

    return !!recentWarning;
  }

  /**
   * Manually trigger inactivity check (admin/testing)
   * 
   * @returns Check statistics
   */
  async manualCheck(): Promise<{
    total: number;
    suspended: number;
    warned: number;
    errors: number;
  }> {
    this.logger.log('Manual inactivity check triggered');
    return this.checkInactivityForAllAccounts();
  }

  /**
   * Get scheduler status
   * 
   * @returns Scheduler information
   */
  getStatus() {
    return {
      running: !!this.schedulerInterval,
      checkIntervalMs: this.CHECK_INTERVAL_MS,
      lastCheckTimestamp: this.lastCheckTimestamp,
      batchSize: this.BATCH_SIZE,
    };
  }

  /**
   * Stop scheduler (for testing/shutdown)
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      this.logger.log('Stopping inactivity scheduler');
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}
