import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus } from '@prisma/client';

/**
 * Notification Events Service
 * 
 * Listens to application events and creates notifications.
 * 
 * This service integrates with existing Day 8 events.
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
}
