import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, RuleType } from '@prisma/client';

/**
 * Notification Events Service
 * 
 * Listens to application events and creates notifications.
 * 
 * This service integrates with existing Day 8 events.
 * 
 * DAY 20: Added risk warning event handlers
 */
@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);
  private processedStatusChanges = new Set<string>();

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Handle trade opened event
   */
  @OnEvent('trade.opened')
  async handleTradeOpened(payload: { trade: any; accountNumber: string }) {
    try {
      const { trade } = payload;
      
      // Get account to find userId
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: trade.tradingAccountId },
        select: {
          id: true,
          userId: true,
          accountNumber: true,
        },
      });
      
      if (!account) return;

      await this.notificationsService.notifyTradeOpened(
        account.userId,
        trade.symbol,
        trade.side,
        trade.volume.toString(),
        trade.entryPrice.toString(),
      );
    } catch (error) {
      this.logger.error(`Error handling trade.opened: ${(error as Error).message}`);
    }
  }

  /**
   * Handle trade closed event
   */
  @OnEvent('trade.closed')
  async handleTradeClosed(payload: { trade: any; accountNumber: string }) {
    try {
      const { trade } = payload;
      
      // Get account to find userId
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: trade.tradingAccountId },
        select: {
          id: true,
          userId: true,
          accountNumber: true,
        },
      });
      
      if (!account) return;

      await this.notificationsService.notifyTradeClosed(
        account.userId,
        trade.symbol,
        trade.side,
        trade.exitPrice?.toString() || '0',
        trade.realizedPnl.toString(),
      );
    } catch (error) {
      this.logger.error(`Error handling trade.closed: ${(error as Error).message}`);
    }
  }

  /**
   * Handle account status change event
   */
  @OnEvent('account.status.changed')
  async handleAccountStatusChanged(payload: {
    accountId: string;
    previousStatus: TradingAccountStatus;
    newStatus: TradingAccountStatus;
    reason?: string;
  }) {
    try {
      const { accountId, previousStatus, newStatus, reason } = payload;
      
      // Prevent duplicate notifications
      const changeKey = `${accountId}:${previousStatus}:${newStatus}`;
      if (this.processedStatusChanges.has(changeKey)) {
        return;
      }
      this.processedStatusChanges.add(changeKey);

      // Get account to find userId and accountNumber
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          userId: true,
          accountNumber: true,
        },
      });
      
      if (!account) return;

      // Notify based on new status
      if (newStatus === TradingAccountStatus.PASSED) {
        await this.notificationsService.notifyAccountPassed(
          account.userId,
          account.accountNumber,
        );
      } else if (newStatus === TradingAccountStatus.BREACHED) {
        await this.notificationsService.notifyAccountBreached(
          account.userId,
          account.accountNumber,
          reason,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error handling account.status.changed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle trading account created event
   */
  @OnEvent('account.created')
  async handleAccountCreated(payload: {
    accountId: string;
    userId: string;
    accountNumber: string;
    challengeName: string;
  }) {
    try {
      const { userId, accountNumber, challengeName } = payload;

      await this.notificationsService.notifyAccountCreated(
        userId,
        accountNumber,
        challengeName,
      );
    } catch (error) {
      this.logger.error(`Error handling account.created: ${(error as Error).message}`);
    }
  }

  /**
   * Handle order created event
   */
  @OnEvent('order.created')
  async handleOrderCreated(payload: {
    orderId: string;
    userId: string;
    challengeName: string;
    amount: string;
  }) {
    try {
      const { orderId, userId, challengeName, amount } = payload;

      await this.notificationsService.notifyOrderCreated(
        userId,
        orderId,
        challengeName,
        amount,
      );
    } catch (error) {
      this.logger.error(`Error handling order.created: ${(error as Error).message}`);
    }
  }

  /**
   * Handle payment status change event
   */
  @OnEvent('payment.status.changed')
  async handlePaymentStatusChanged(payload: {
    orderId: string;
    userId: string;
    status: 'PENDING' | 'COMPLETED' | 'REJECTED';
    amount: string;
    previousStatus?: string;
    reason?: string;
  }) {
    try {
      const { orderId, userId, status, amount, previousStatus, reason } = payload;

      // Only notify on actual status changes
      if (previousStatus === status) {
        return;
      }

      await this.notificationsService.notifyPaymentStatus(
        userId,
        status,
        orderId,
        amount,
        reason,
      );
    } catch (error) {
      this.logger.error(
        `Error handling payment.status.changed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * DAY 20: Handle risk warning detected event
   * 
   * Triggered when risk metrics approach configured limits.
   * Creates appropriate notification based on warning level and rule type.
   */
  @OnEvent('risk.warning.detected')
  async handleRiskWarningDetected(payload: {
    accountId: string;
    warning: any;
    calculation: any;
  }) {
    try {
      const { accountId, warning } = payload;

      // Get account to find userId and accountNumber
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          userId: true,
          accountNumber: true,
        },
      });

      if (!account) return;

      const usagePercentage = warning.usagePercentage.toFixed(1);
      const level = warning.warningLevel;

      // Create notification based on rule type
      if (warning.ruleType === RuleType.DAILY_LOSS) {
        await this.notificationsService.notifyDailyLossWarning(
          account.userId,
          account.accountNumber,
          level,
          warning.message,
          usagePercentage,
        );
      } else if (warning.ruleType === RuleType.MAX_DRAWDOWN) {
        await this.notificationsService.notifyDrawdownWarning(
          account.userId,
          account.accountNumber,
          level,
          warning.message,
          usagePercentage,
        );
      } else if (warning.ruleType === RuleType.PROFIT_TARGET) {
        await this.notificationsService.notifyProfitTargetApproaching(
          account.userId,
          account.accountNumber,
          usagePercentage,
        );
      }

      this.logger.debug(
        `Risk warning notification created for account ${account.accountNumber}: ${warning.ruleType} ${level}`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling risk.warning.detected: ${(error as Error).message}`,
      );
    }
  }

  /**
   * DAY 20: Handle daily reset event
   * 
   * Triggered when daily reset is performed.
   * Creates notification informing user of reset.
   */
  @OnEvent('daily.reset.completed')
  async handleDailyResetCompleted(payload: {
    accountId: string;
    timezone: string;
  }) {
    try {
      const { accountId, timezone } = payload;

      // Get account to find userId and accountNumber
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          userId: true,
          accountNumber: true,
        },
      });

      if (!account) return;

      await this.notificationsService.notifyDailyReset(
        account.userId,
        account.accountNumber,
        timezone,
      );

      this.logger.debug(
        `Daily reset notification created for account ${account.accountNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling daily.reset.completed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * DAY 20: Handle order rejected event
   * 
   * Triggered when order fails risk validation.
   * Creates high-priority notification informing user.
   */
  @OnEvent('order.rejected')
  async handleOrderRejected(payload: {
    userId: string;
    symbol: string;
    reason: string;
  }) {
    try {
      const { userId, symbol, reason } = payload;

      await this.notificationsService.notifyOrderRejected(
        userId,
        symbol,
        reason,
      );

      this.logger.debug(
        `Order rejected notification created for user ${userId}: ${symbol}`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling order.rejected: ${(error as Error).message}`,
      );
    }
  }
}
