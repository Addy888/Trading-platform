import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Decimal from 'decimal.js';

import {
  NotificationType,
  NotificationPriority,
  Notification,
} from '@prisma/client';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { EmailService } from '../email/email.service';

/**
 * Notification Service
 * 
 * Central service for managing notifications.
 * 
 * Responsibilities:
 * - Create notifications
 * - Check user preferences
 * - Emit real-time events
 * - Send email notifications
 * - Mark as read
 * - Get unread count
 * - Enforce ownership
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a notification
   * 
   * @param dto Notification data
   * @returns Created notification
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    try {
      // Check user preferences
      const preferences = await this.getUserPreferences(dto.userId);

      if (!preferences.inAppEnabled) {
        this.logger.debug(`In-app notifications disabled for user ${dto.userId}`);
        return null;
      }

      // Check if notification type is enabled
      if (!this.isNotificationTypeEnabled(dto.type, preferences)) {
        this.logger.debug(
          `Notification type ${dto.type} disabled for user ${dto.userId}`,
        );
        return null;
      }

      // Create notification
      const notification = await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          priority: dto.priority || NotificationPriority.NORMAL,
          title: dto.title,
          message: dto.message,
          data: dto.data || {},
        },
      });

      // Emit real-time notification event
      this.eventEmitter.emit('notification.created', notification);

      // Send email if enabled
      if (preferences.emailEnabled && this.shouldSendEmail(dto.type)) {
        await this.sendEmailForNotification(notification, preferences);
      }

      this.logger.log(
        `Notification created: ${notification.id} for user ${dto.userId}`,
      );

      return notification;
    } catch (error) {
      this.logger.error(
        `Failed to create notification: ${(error as Error).message}`,
      );
      // Do not throw - notification failure should not break business logic
      return null;
    }
  }

  /**
   * Get user preferences with safe fallback
   */
  private async getUserPreferences(userId: string) {
    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Create default preferences if not exist
    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: {
          userId,
          inAppEnabled: true,
          emailEnabled: false,
          tradeNotifications: true,
          accountNotifications: true,
          challengeNotifications: true,
          orderNotifications: true,
          systemNotifications: true,
        },
      });
    }

    return preferences;
  }

  /**
   * Check if notification type is enabled in preferences
   */
  private isNotificationTypeEnabled(
    type: NotificationType,
    preferences: any,
  ): boolean {
    switch (type) {
      case NotificationType.TRADE_OPENED:
      case NotificationType.TRADE_CLOSED:
        return preferences.tradeNotifications;

      case NotificationType.ACCOUNT_CREATED:
      case NotificationType.ACCOUNT_PASSED:
      case NotificationType.ACCOUNT_BREACHED:
      case NotificationType.DAILY_LOSS_WARNING:
      case NotificationType.DRAWDOWN_WARNING:
      case NotificationType.PROFIT_TARGET_APPROACHING:
      case NotificationType.DAILY_RESET:
        return preferences.accountNotifications || preferences.challengeNotifications;

      case NotificationType.ORDER_CREATED:
      case NotificationType.ORDER_REJECTED:
      case NotificationType.PAYMENT_PENDING:
      case NotificationType.PAYMENT_COMPLETED:
      case NotificationType.PAYMENT_REJECTED:
        return preferences.orderNotifications;

      case NotificationType.SYSTEM_ALERT:
      case NotificationType.ADMIN_ALERT:
        return preferences.systemNotifications;

      default:
        return true;
    }
  }

  /**
   * Determine if email should be sent for notification type
   */
  private shouldSendEmail(type: NotificationType): boolean {
    const emailTypes: NotificationType[] = [
      NotificationType.ACCOUNT_PASSED,
      NotificationType.ACCOUNT_BREACHED,
      NotificationType.PAYMENT_COMPLETED,
      NotificationType.PAYMENT_REJECTED,
    ];
    return emailTypes.includes(type);
  }

  /**
   * Send email for notification
   */
  private async sendEmailForNotification(
    notification: Notification,
    preferences: any,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: notification.userId },
      });

      if (!user) return;

      const data = notification.data as any;

      switch (notification.type) {
        case NotificationType.ACCOUNT_PASSED:
          await this.emailService.sendAccountPassedEmail(
            user.email,
            data.accountNumber,
          );
          break;

        case NotificationType.ACCOUNT_BREACHED:
          await this.emailService.sendAccountBreachedEmail(
            user.email,
            data.accountNumber,
            data.reason,
          );
          break;

        case NotificationType.PAYMENT_COMPLETED:
          await this.emailService.sendPaymentCompletedEmail(
            user.email,
            data.challengeName || 'Challenge',
            data.amount,
          );
          break;

        case NotificationType.PAYMENT_REJECTED:
          await this.emailService.sendPaymentRejectedEmail(
            user.email,
            data.challengeName || 'Challenge',
            data.amount,
          );
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to send email: ${(error as Error).message}`);
    }
  }

  /**
   * Get notifications for a user
   */
  async findAll(userId: string, query: QueryNotificationsDto) {
    const { page = 1, limit = 20, read, type } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (read !== undefined) {
      where.isRead = read;
    }

    if (type) {
      where.type = type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this notification',
      );
    }

    // If already read, return as is
    if (notification.isRead) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      count: result.count,
      message: `${result.count} notification(s) marked as read`,
    };
  }

  /**
   * Delete a notification
   */
  async delete(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this notification',
      );
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { message: 'Notification deleted successfully' };
  }

  /**
   * Create notification for account created
   */
  async notifyAccountCreated(userId: string, accountNumber: string, challengeName: string) {
    return this.create({
      userId,
      type: NotificationType.ACCOUNT_CREATED,
      priority: NotificationPriority.NORMAL,
      title: 'Trading Account Created',
      message: `Your trading account ${accountNumber} for ${challengeName} has been created successfully.`,
      data: { accountNumber, challengeName },
    });
  }

  /**
   * Create notification for trade opened
   */
  async notifyTradeOpened(
    userId: string,
    symbol: string,
    side: string,
    volume: string,
    entryPrice: string,
  ) {
    return this.create({
      userId,
      type: NotificationType.TRADE_OPENED,
      priority: NotificationPriority.NORMAL,
      title: 'Trade Opened',
      message: `${side} ${volume} ${symbol} @ ${entryPrice}`,
      data: { symbol, side, volume, entryPrice },
    });
  }

  /**
   * Create notification for trade closed
   */
  async notifyTradeClosed(
    userId: string,
    symbol: string,
    side: string,
    exitPrice: string,
    realizedPnl: string,
  ) {
    const pnlDecimal = new Decimal(realizedPnl);
    const pnlFormatted = pnlDecimal.greaterThanOrEqualTo(0) ? `+${realizedPnl}` : realizedPnl;
    
    return this.create({
      userId,
      type: NotificationType.TRADE_CLOSED,
      priority: NotificationPriority.NORMAL,
      title: 'Trade Closed',
      message: `${side} ${symbol} closed @ ${exitPrice}. PnL: $${pnlFormatted}`,
      data: { symbol, side, exitPrice, realizedPnl },
    });
  }

  /**
   * Create notification for account passed
   */
  async notifyAccountPassed(userId: string, accountNumber: string) {
    return this.create({
      userId,
      type: NotificationType.ACCOUNT_PASSED,
      priority: NotificationPriority.HIGH,
      title: '🎉 Challenge Passed!',
      message: `Congratulations! Your account ${accountNumber} has passed the challenge.`,
      data: { accountNumber },
    });
  }

  /**
   * Create notification for account breached
   */
  async notifyAccountBreached(userId: string, accountNumber: string, reason?: string) {
    return this.create({
      userId,
      type: NotificationType.ACCOUNT_BREACHED,
      priority: NotificationPriority.CRITICAL,
      title: 'Challenge Breached',
      message: `Account ${accountNumber} has breached challenge rules${reason ? `: ${reason}` : '.'}`,
      data: { accountNumber, reason },
    });
  }

  /**
   * DAY 20: Create notification for daily loss warning
   */
  async notifyDailyLossWarning(
    userId: string,
    accountNumber: string,
    level: string,
    message: string,
    usagePercentage: string,
  ) {
    const priority = level === 'CRITICAL' 
      ? NotificationPriority.CRITICAL 
      : level === 'WARNING' 
        ? NotificationPriority.HIGH 
        : NotificationPriority.NORMAL;

    return this.create({
      userId,
      type: NotificationType.DAILY_LOSS_WARNING,
      priority,
      title: 'Daily Loss Warning',
      message,
      data: { accountNumber, level, usagePercentage },
    });
  }

  /**
   * DAY 20: Create notification for drawdown warning
   */
  async notifyDrawdownWarning(
    userId: string,
    accountNumber: string,
    level: string,
    message: string,
    usagePercentage: string,
  ) {
    const priority = level === 'CRITICAL' 
      ? NotificationPriority.CRITICAL 
      : level === 'WARNING' 
        ? NotificationPriority.HIGH 
        : NotificationPriority.NORMAL;

    return this.create({
      userId,
      type: NotificationType.DRAWDOWN_WARNING,
      priority,
      title: 'Drawdown Warning',
      message,
      data: { accountNumber, level, usagePercentage },
    });
  }

  /**
   * DAY 20: Create notification for profit target approaching
   */
  async notifyProfitTargetApproaching(
    userId: string,
    accountNumber: string,
    progressPercentage: string,
  ) {
    return this.create({
      userId,
      type: NotificationType.PROFIT_TARGET_APPROACHING,
      priority: NotificationPriority.HIGH,
      title: '🎯 Profit Target Approaching',
      message: `Great work! Account ${accountNumber} is ${progressPercentage}% toward profit target.`,
      data: { accountNumber, progressPercentage },
    });
  }

  /**
   * DAY 20: Create notification for daily reset
   */
  async notifyDailyReset(userId: string, accountNumber: string, timezone: string) {
    return this.create({
      userId,
      type: NotificationType.DAILY_RESET,
      priority: NotificationPriority.LOW,
      title: 'Daily Reset Completed',
      message: `Daily tracking reset for account ${accountNumber} (${timezone}).`,
      data: { accountNumber, timezone },
    });
  }

  /**
   * DAY 20: Create notification for order rejected
   */
  async notifyOrderRejected(
    userId: string,
    symbol: string,
    reason: string,
  ) {
    return this.create({
      userId,
      type: NotificationType.ORDER_REJECTED,
      priority: NotificationPriority.HIGH,
      title: 'Order Rejected',
      message: `Order for ${symbol} was rejected: ${reason}`,
      data: { symbol, reason },
    });
  }

  /**
   * Create notification for order created
   */
  async notifyOrderCreated(userId: string, orderId: string, challengeName: string, amount: string) {
    return this.create({
      userId,
      type: NotificationType.ORDER_CREATED,
      priority: NotificationPriority.NORMAL,
      title: 'Order Created',
      message: `Your order for ${challengeName} ($${amount}) has been created.`,
      data: { orderId, challengeName, amount },
    });
  }

  /**
   * Create notification for payment status changes
   */
  async notifyPaymentStatus(
    userId: string,
    status: 'PENDING' | 'COMPLETED' | 'REJECTED',
    orderId: string,
    amount: string,
    reason?: string,
  ) {
    let type: NotificationType;
    let priority: NotificationPriority;
    let title: string;
    let message: string;

    switch (status) {
      case 'PENDING':
        type = NotificationType.PAYMENT_PENDING;
        priority = NotificationPriority.NORMAL;
        title = 'Payment Pending';
        message = `Your payment of $${amount} is being processed.`;
        break;
      case 'COMPLETED':
        type = NotificationType.PAYMENT_COMPLETED;
        priority = NotificationPriority.HIGH;
        title = 'Payment Successful';
        message = `Your payment of $${amount} has been completed successfully.`;
        break;
      case 'REJECTED':
        type = NotificationType.PAYMENT_REJECTED;
        priority = NotificationPriority.HIGH;
        title = 'Payment Failed';
        message = reason 
          ? `Your payment of $${amount} was rejected. Reason: ${reason}` 
          : `Your payment of $${amount} was not successful. Please contact support.`;
        break;
    }

    return this.create({
      userId,
      type,
      priority,
      title,
      message,
      data: { orderId, amount, status, reason },
    });
  }
}
