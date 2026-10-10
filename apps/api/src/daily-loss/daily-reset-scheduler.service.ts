import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DailyLossService } from './daily-loss.service';

/**
 * Day 18: Daily Reset Scheduler Service
 * 
 * Responsible for scheduling and executing daily resets at configured times
 * for all supported timezones.
 * 
 * CRITICAL FEATURES:
 * - Timezone-aware reset scheduling
 * - DST (Daylight Saving Time) handling
 * - Idempotent execution
 * - No duplicate schedulers
 * - Error recovery
 * - Efficient account batching
 * 
 * TIMEZONE SUPPORT:
 * - UTC (default)
 * - America/New_York (EST/EDT)
 * - Europe/London (GMT/BST)
 * - Asia/Tokyo (JST)
 * - Additional timezones can be configured
 * 
 * RESET TIME:
 * - Configurable per timezone (default: midnight)
 * - Accounts reset at their configured timezone midnight
 * - Server timezone does NOT affect reset time
 * 
 * IMPLEMENTATION NOTE:
 * This is a basic scheduler implementation using setInterval.
 * For production, consider using:
 * - @nestjs/schedule with cron expressions
 * - Bull/BullMQ for distributed job queues
 * - External scheduler (e.g., Kubernetes CronJob)
 */
@Injectable()
export class DailyResetSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(DailyResetSchedulerService.name);
  private schedulerIntervals: NodeJS.Timeout[] = [];

  // Supported timezones with their reset hours (24-hour format)
  private readonly timezoneConfigs = [
    { timezone: 'UTC', resetHour: 0 },
    { timezone: 'America/New_York', resetHour: 0 },
    { timezone: 'Europe/London', resetHour: 0 },
    { timezone: 'Asia/Tokyo', resetHour: 0 },
  ];

  // Check interval: every 1 minute
  private readonly CHECK_INTERVAL_MS = 60 * 1000;

  // Track last reset date per timezone to prevent duplicate resets
  private lastResetDate = new Map<string, string>();

  constructor(private readonly dailyLossService: DailyLossService) {}

  /**
   * Initialize scheduler on module startup
   */
  async onModuleInit() {
    this.logger.log('Daily Reset Scheduler initialized');
    
    // Start scheduler for each timezone
    for (const config of this.timezoneConfigs) {
      this.startSchedulerForTimezone(config.timezone, config.resetHour);
    }
  }

  /**
   * Start scheduler for a specific timezone
   * 
   * Checks every minute if it's time to reset for this timezone.
   * 
   * @param timezone Timezone string (e.g., 'UTC', 'America/New_York')
   * @param resetHour Hour to reset (0-23)
   */
  private startSchedulerForTimezone(timezone: string, resetHour: number): void {
    this.logger.log(
      `Starting scheduler for timezone ${timezone} (reset hour: ${resetHour})`,
    );

    const interval = setInterval(async () => {
      try {
        await this.checkAndExecuteReset(timezone, resetHour);
      } catch (error) {
        this.logger.error(
          `Scheduler error for timezone ${timezone}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }, this.CHECK_INTERVAL_MS);

    this.schedulerIntervals.push(interval);
  }

  /**
   * Check if it's time to reset for this timezone and execute if needed
   * 
   * @param timezone Timezone string
   * @param resetHour Hour to reset (0-23)
   */
  private async checkAndExecuteReset(
    timezone: string,
    resetHour: number,
  ): Promise<void> {
    const now = new Date();
    
    // Get current time in the target timezone
    const timezoneNow = this.getTimezoneDate(now, timezone);
    const currentHour = timezoneNow.getHours();
    const currentDate = this.getDateKey(timezoneNow);

    // Check if it's the reset hour
    if (currentHour !== resetHour) {
      return;
    }

    // Check if we already reset today for this timezone (idempotency)
    const lastReset = this.lastResetDate.get(timezone);
    if (lastReset === currentDate) {
      return; // Already reset today
    }

    // Execute reset
    this.logger.log(
      `Executing daily reset for timezone ${timezone} at ${now.toISOString()}`,
    );

    try {
      const resetCount = await this.dailyLossService.performDailyResetForAllAccounts(
        now,
        timezone,
      );

      // Mark as reset for today
      this.lastResetDate.set(timezone, currentDate);

      this.logger.log(
        `Daily reset completed for timezone ${timezone}: ${resetCount} accounts reset`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to execute daily reset for timezone ${timezone}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't mark as reset if it failed - will retry next interval
    }
  }

  /**
   * Get current date in a specific timezone
   * 
   * Note: This is a simplified implementation.
   * For production, consider using libraries like:
   * - date-fns-tz
   * - moment-timezone
   * - luxon
   * 
   * @param date Date to convert
   * @param timezone Timezone string
   * @returns Date in target timezone
   */
  private getTimezoneDate(date: Date, timezone: string): Date {
    // Use Intl.DateTimeFormat to get timezone offset
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');

    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * Get date key for idempotency check (YYYY-MM-DD)
   * 
   * @param date Date to convert
   * @returns Date key string
   */
  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Manually trigger reset for a specific timezone (admin/testing)
   * 
   * @param timezone Timezone to reset
   * @returns Number of accounts reset
   */
  async manualReset(timezone: string = 'UTC'): Promise<number> {
    this.logger.log(`Manual reset triggered for timezone ${timezone}`);

    const resetCount = await this.dailyLossService.performDailyResetForAllAccounts(
      new Date(),
      timezone,
    );

    // Update last reset date
    const now = new Date();
    const timezoneNow = this.getTimezoneDate(now, timezone);
    const currentDate = this.getDateKey(timezoneNow);
    this.lastResetDate.set(timezone, currentDate);

    this.logger.log(
      `Manual reset completed for timezone ${timezone}: ${resetCount} accounts reset`,
    );

    return resetCount;
  }

  /**
   * Stop all schedulers (for testing/shutdown)
   */
  stopSchedulers(): void {
    this.logger.log('Stopping all schedulers');
    
    for (const interval of this.schedulerIntervals) {
      clearInterval(interval);
    }
    
    this.schedulerIntervals = [];
    this.lastResetDate.clear();
  }
}
