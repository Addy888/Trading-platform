import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Day 19: Risk Events Service
 * 
 * Centralized service for querying risk-related audit events.
 * 
 * IMMUTABILITY GUARANTEE:
 * - This service provides READ-ONLY access to risk events
 * - NO update() or delete() methods
 * - NO mutation of historical data
 * - Events are append-only
 * 
 * RISK EVENT TYPES:
 * - ACCOUNT_BREACHED (Day 16)
 * - ACCOUNT_PASSED (Day 17)
 * - DAILY_RESET (Day 18)
 * - TRADE_OPENED
 * - TRADE_CLOSED
 * - ORDER_SUBMITTED
 * - POSITION_UPDATED
 * - And other risk-related actions
 * 
 * ACCESS CONTROL:
 * - Users can only view their own account's risk events
 * - Admins can view all risk events (enforced by controller RBAC)
 * 
 * Day 19 Implementation - Trading Risk Engine
 */
@Injectable()
export class RiskEventsService {
  private readonly logger = new Logger(RiskEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Risk-related audit log actions
   * 
   * These represent immutable risk events tracked by the system.
   */
  private readonly RISK_EVENT_TYPES = [
    // Risk State Changes (Days 16-17)
    'ACCOUNT_BREACHED',
    'ACCOUNT_PASSED',
    
    // Daily Reset (Day 18)
    'DAILY_RESET',
    
    // Trading Actions
    'TRADE_OPENED',
    'TRADE_CLOSED',
    'POSITION_UPDATED',
    
    // Order Gateway
    'ORDER_SUBMITTED',
    'ORDER_REJECTED',
    
    // Account State
    'TRADING_ACCOUNT_CREATED',
    'ACCOUNT_STATUS_CHANGED',
    
    // Admin Actions
    'ADMIN_RISK_OVERRIDE',
    'ADMIN_STATUS_OVERRIDE',
    
    // Payout Risk
    'PAYOUT_REQUESTED',
    'PAYOUT_APPROVED',
    'PAYOUT_REJECTED',
  ];

  /**
   * Get risk events for a specific trading account
   * 
   * Returns paginated list of risk-related audit logs.
   * 
   * @param accountId Trading account ID
   * @param options Query options
   * @returns Paginated risk events
   */
  async getAccountRiskEvents(
    accountId: string,
    options: {
      page?: number;
      limit?: number;
      eventTypes?: string[];
      startDate?: Date;
      endDate?: Date;
    } = {},
  ) {
    const {
      page = 1,
      limit = 50,
      eventTypes,
      startDate,
      endDate,
    } = options;

    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      entityId: accountId,
      entityType: 'TradingAccount',
      action: eventTypes ? { in: eventTypes } : { in: this.RISK_EVENT_TYPES },
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all risk events for a user's accounts
   * 
   * @param userId User ID
   * @param options Query options
   * @returns Paginated risk events across all user's accounts
   */
  async getUserRiskEvents(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      eventTypes?: string[];
      startDate?: Date;
      endDate?: Date;
    } = {},
  ) {
    const {
      page = 1,
      limit = 50,
      eventTypes,
      startDate,
      endDate,
    } = options;

    const skip = (page - 1) * limit;

    // Get user's trading account IDs
    const userAccounts = await this.prisma.tradingAccount.findMany({
      where: { userId },
      select: { id: true },
    });

    const accountIds = userAccounts.map(a => a.id);

    if (accountIds.length === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    const where: Prisma.AuditLogWhereInput = {
      entityId: { in: accountIds },
      entityType: 'TradingAccount',
      action: eventTypes ? { in: eventTypes } : { in: this.RISK_EVENT_TYPES },
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get breach events across all accounts (Admin only)
   * 
   * @param options Query options
   * @returns Paginated breach events
   */
  async getBreachEvents(options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
    } = options;

    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      action: 'ACCOUNT_BREACHED',
      entityType: 'TradingAccount',
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get pass events across all accounts (Admin only)
   * 
   * @param options Query options
   * @returns Paginated pass events
   */
  async getPassEvents(options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
    } = options;

    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      action: 'ACCOUNT_PASSED',
      entityType: 'TradingAccount',
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get daily reset events for an account
   * 
   * @param accountId Trading account ID
   * @param options Query options
   * @returns Paginated daily reset events
   */
  async getDailyResetEvents(
    accountId: string,
    options: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ) {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
    } = options;

    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      entityId: accountId,
      entityType: 'TradingAccount',
      action: 'DAILY_RESET',
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get risk event by ID (with ownership check)
   * 
   * @param eventId Audit log ID
   * @param userId User ID (for ownership check, null for admin)
   * @returns Risk event details
   */
  async getRiskEventById(eventId: string, userId?: string) {
    const event = await this.prisma.auditLog.findUnique({
      where: { id: eventId },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    if (!event) {
      return null;
    }

    // Ownership check for non-admin users
    if (userId && event.entityType === 'TradingAccount') {
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: event.entityId || '' },
        select: { userId: true },
      });

      if (!account || account.userId !== userId) {
        return null; // User doesn't own this account
      }
    }

    return event;
  }

  /**
   * Get risk event statistics for an account
   * 
   * @param accountId Trading account ID
   * @returns Risk event statistics
   */
  async getAccountRiskStatistics(accountId: string) {
    const [
      totalEvents,
      breachEvents,
      passEvents,
      resetEvents,
      tradeEvents,
    ] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          entityId: accountId,
          entityType: 'TradingAccount',
          action: { in: this.RISK_EVENT_TYPES },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          entityId: accountId,
          entityType: 'TradingAccount',
          action: 'ACCOUNT_BREACHED',
        },
      }),
      this.prisma.auditLog.count({
        where: {
          entityId: accountId,
          entityType: 'TradingAccount',
          action: 'ACCOUNT_PASSED',
        },
      }),
      this.prisma.auditLog.count({
        where: {
          entityId: accountId,
          entityType: 'TradingAccount',
          action: 'DAILY_RESET',
        },
      }),
      this.prisma.auditLog.count({
        where: {
          entityId: accountId,
          entityType: 'TradingAccount',
          action: { in: ['TRADE_OPENED', 'TRADE_CLOSED'] },
        },
      }),
    ]);

    return {
      total: totalEvents,
      byType: {
        breach: breachEvents,
        pass: passEvents,
        dailyReset: resetEvents,
        trades: tradeEvents,
      },
    };
  }

  /**
   * Search risk events (Admin only)
   * 
   * @param query Search query
   * @param options Query options
   * @returns Matching risk events
   */
  async searchRiskEvents(
    query: string,
    options: {
      page?: number;
      limit?: number;
      eventTypes?: string[];
      startDate?: Date;
      endDate?: Date;
    } = {},
  ) {
    const {
      page = 1,
      limit = 50,
      eventTypes,
      startDate,
      endDate,
    } = options;

    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      action: eventTypes ? { in: eventTypes } : { in: this.RISK_EVENT_TYPES },
      OR: [
        { entityId: { contains: query } },
        { actorId: { contains: query } },
      ],
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
