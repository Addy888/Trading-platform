import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { InactivityEvaluation } from './inactivity.service';

/**
 * Day 23: Inactivity Events Service
 * 
 * Handles inactivity-related events and notifications.
 * 
 * EVENTS HANDLED:
 * - account.inactivity.warning - Warns user of approaching inactivity
 * - account.suspended.inactivity - Notifies user account was suspended
 * 
 * NOTIFICATION RULES:
 * - User notification after successful state change
 * - Admin notification for suspended accounts
 * - Notification failure does NOT roll back state
 * - Audit log records notification attempt
 * 
 * DEDUPLICATION:
 * - Warnings: Once per 24 hours
 * - Suspension: Once per account
 * 
 * Day 23 Implementation - Trading Risk Engine
 */
@Injectable()
export class InactivityEventsService {
  private readonly logger = new Logger(InactivityEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle inactivity warning event
   * 
   * Sends warning notification to user.
   * 
   * @param payload Event payload
   */
  @OnEvent('account.inactivity.warning')
  async handleInactivityWarning(payload: {
    accountId: string;
    evaluation: InactivityEvaluation;
    daysRemaining: number | null;
  }) {
    try {
      const { accountId, evaluation, daysRemaining } = payload;

      // Load account with user
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: accountId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!account) {
        this.logger.warn(`Account ${accountId} not found for inactivity warning`);
        return;
      }

      // Create warning notification
      await this.prisma.notification.create({
        data: {
          userId: account.userId,
          type: NotificationType.SYSTEM_ALERT,
          title: 'Inactivity Warning',
          message: this.buildWarningMessage(evaluation, daysRemaining),
          metadata: {
            accountId,
            accountNumber: account.accountNumber,
            inactivityDays: evaluation.inactivityDays,
            daysSinceLastTrade: evaluation.daysSinceLastTrade,
            daysRemaining,
            lastTradeAt: evaluation.lastTradeAt?.toISOString(),
          },
        },
      });

      // Create audit log
      await this.prisma.auditLog.create({
        data: {
          actorId: null, // System
          action: 'INACTIVITY_WARNING_SENT',
          entityType: 'TradingAccount',
          entityId: accountId,
          metadata: {
            accountNumber: account.accountNumber,
            userId: account.userId,
            userEmail: account.user.email,
            inactivityDays: evaluation.inactivityDays,
            daysSinceLastTrade: evaluation.daysSinceLastTrade,
            daysRemaining,
          },
        },
      });

      this.logger.log(
        `Inactivity warning sent to user ${account.user.email} for account ${account.accountNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send inactivity warning: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - notification failure should not crash scheduler
    }
  }

  /**
   * Handle account suspended due to inactivity
   * 
   * Sends suspension notification to user and admin.
   * 
   * @param payload Event payload
   */
  @OnEvent('account.suspended.inactivity')
  async handleAccountSuspended(payload: {
    accountId: string;
    evaluation: InactivityEvaluation;
  }) {
    try {
      const { accountId, evaluation } = payload;

      // Load account with user
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: accountId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!account) {
        this.logger.warn(`Account ${accountId} not found for suspension notification`);
        return;
      }

      // Create user notification
      await this.prisma.notification.create({
        data: {
          userId: account.userId,
          type: NotificationType.ACCOUNT_BREACHED, // Using existing type
          title: 'Account Suspended - Inactivity',
          message: this.buildSuspensionMessage(evaluation),
          metadata: {
            accountId,
            accountNumber: account.accountNumber,
            reason: 'INACTIVITY',
            inactivityDays: evaluation.inactivityDays,
            daysSinceLastTrade: evaluation.daysSinceLastTrade,
            lastTradeAt: evaluation.lastTradeAt?.toISOString(),
          },
        },
      });

      // Create admin notification
      await this.createAdminNotification(account, evaluation);

      this.logger.log(
        `Account suspension notification sent to user ${account.user.email} ` +
        `for account ${account.accountNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send suspension notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - notification failure should not crash scheduler
    }
  }

  /**
   * Build warning message for user
   * 
   * @param evaluation Inactivity evaluation
   * @param daysRemaining Days until inactive
   * @returns Warning message
   */
  private buildWarningMessage(
    evaluation: InactivityEvaluation,
    daysRemaining: number | null,
  ): string {
    if (daysRemaining === null || daysRemaining === 0) {
      return `Your trading account will be suspended soon due to inactivity. ` +
             `You have not traded in ${evaluation.daysSinceLastTrade} days. ` +
             `Please place a trade to keep your account active.`;
    }

    return `Your trading account will be suspended in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} ` +
           `if no trading activity occurs. ` +
           `You have not traded in ${evaluation.daysSinceLastTrade} days. ` +
           `Please place a trade to keep your account active.`;
  }

  /**
   * Build suspension message for user
   * 
   * @param evaluation Inactivity evaluation
   * @returns Suspension message
   */
  private buildSuspensionMessage(evaluation: InactivityEvaluation): string {
    return `Your trading account has been suspended due to inactivity. ` +
           `You have not traded in ${evaluation.daysSinceLastTrade} days ` +
           `(threshold: ${evaluation.inactivityDays} days). ` +
           `Please contact support to reactivate your account.`;
  }

  /**
   * Create admin notification for suspended account
   * 
   * @param account Trading account
   * @param evaluation Inactivity evaluation
   */
  private async createAdminNotification(
    account: any,
    evaluation: InactivityEvaluation,
  ): Promise<void> {
    // Find admin users
    const admins = await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
      },
      select: {
        id: true,
      },
    });

    if (admins.length === 0) {
      this.logger.warn('No admin users found for inactivity notification');
      return;
    }

    // Create notification for each admin
    for (const admin of admins) {
      await this.prisma.notification.create({
        data: {
          userId: admin.id,
          type: NotificationType.ADMIN_ALERT,
          title: 'Account Suspended - Inactivity',
          message: `Trading account ${account.accountNumber} (${account.user.email}) ` +
                   `has been suspended due to ${evaluation.daysSinceLastTrade} days of inactivity.`,
          metadata: {
            accountId: account.id,
            accountNumber: account.accountNumber,
            userId: account.userId,
            userEmail: account.user.email,
            reason: 'INACTIVITY',
            inactivityDays: evaluation.inactivityDays,
            daysSinceLastTrade: evaluation.daysSinceLastTrade,
            lastTradeAt: evaluation.lastTradeAt?.toISOString(),
          },
        },
      });
    }
  }
}
