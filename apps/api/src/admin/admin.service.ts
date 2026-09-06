import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, OrderStatus, TradingAccountStatus, ChallengeStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalAdmins,
      totalChallengePlans,
      activeChallengePlans,
      totalOrders,
      pendingOrders,
      paidOrders,
      totalTradingAccounts,
      activeTradingAccounts,
      passedTradingAccounts,
      breachedTradingAccounts,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.user.count({ where: { role: Role.ADMIN } }),
      this.prisma.challengePlan.count(),
      this.prisma.challengePlan.count({ where: { status: ChallengeStatus.ACTIVE } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
      this.prisma.tradingAccount.count(),
      this.prisma.tradingAccount.count({ where: { status: TradingAccountStatus.ACTIVE } }),
      this.prisma.tradingAccount.count({ where: { status: TradingAccountStatus.PASSED } }),
      this.prisma.tradingAccount.count({ where: { status: TradingAccountStatus.BREACHED } }),
    ]);

    // Calculate financial metrics
    const [orderMetrics, totalTrades, openTrades] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { amount: true },
        where: { status: OrderStatus.PAID },
      }),
      this.prisma.trade.count(),
      this.prisma.trade.count({ where: { status: 'OPEN' } }),
    ]);

    // Get recent activity
    const [recentUsers, recentOrders, recentAccounts] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.order.findMany({
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          challengePlan: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.tradingAccount.findMany({
        select: {
          id: true,
          accountNumber: true,
          status: true,
          currentBalance: true,
          equity: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        admins: totalAdmins,
      },
      challengePlans: {
        total: totalChallengePlans,
        active: activeChallengePlans,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        paid: paidOrders,
      },
      tradingAccounts: {
        total: totalTradingAccounts,
        active: activeTradingAccounts,
        passed: passedTradingAccounts,
        breached: breachedTradingAccounts,
      },
      financial: {
        totalRevenue: orderMetrics._sum.amount?.toFixed(2) || '0.00',
      },
      trading: {
        totalTrades,
        openTrades,
        closedTrades: totalTrades - openTrades,
      },
      recentActivity: {
        users: recentUsers,
        orders: recentOrders,
        accounts: recentAccounts,
      },
    };
  }

  async getUsers(
    page: number = 1,
    limit: number = 20,
    search?: string,
    role?: Role,
    status?: 'active' | 'inactive',
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          country: true,
          role: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              tradingAccounts: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        country: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get user statistics
    const [
      orderStats,
      accountStats,
      recentOrders,
      recentAccounts,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      }),
      this.prisma.tradingAccount.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      }),
      this.prisma.order.findMany({
        where: { userId },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          challengePlan: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.tradingAccount.findMany({
        where: { userId },
        select: {
          id: true,
          accountNumber: true,
          status: true,
          currentBalance: true,
          equity: true,
          createdAt: true,
          challengePlan: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              trades: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.auditLog.findMany({
        where: { actorId: userId },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    // Format order statistics
    const orderStatistics = {
      total: orderStats.reduce((sum, stat) => sum + stat._count, 0),
      byStatus: orderStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {} as Record<string, number>),
    };

    // Format account statistics
    const accountStatistics = {
      total: accountStats.reduce((sum, stat) => sum + stat._count, 0),
      byStatus: accountStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {} as Record<string, number>),
    };

    return {
      user,
      statistics: {
        orders: orderStatistics,
        tradingAccounts: accountStatistics,
      },
      recentActivity: {
        orders: recentOrders,
        tradingAccounts: recentAccounts,
        auditLogs: recentAuditLogs,
      },
    };
  }

  async updateUserStatus(
    userId: string,
    isActive: boolean,
    adminId: string,
  ) {
    // Prevent admin from deactivating themselves
    if (userId === adminId && !isActive) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const previousUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, email: true, firstName: true, lastName: true },
    });

    if (!previousUser) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        country: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'USER_STATUS_CHANGED',
        entityType: 'User',
        entityId: userId,
        metadata: {
          previousStatus: previousUser.isActive,
          newStatus: isActive,
          email: previousUser.email,
        },
      },
    });

    // Emit event for notification
    this.eventEmitter.emit('admin.user.status.changed', {
      userId,
      email: previousUser.email,
      firstName: previousUser.firstName,
      lastName: previousUser.lastName,
      previousStatus: previousUser.isActive,
      newStatus: isActive,
      adminId,
    });

    return user;
  }

  async getAuditLogs(
    page: number = 1,
    limit: number = 20,
    search?: string,
    action?: string,
    actorId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
      ];
    }

    if (action) {
      where.action = action;
    }

    if (actorId) {
      where.actorId = actorId;
    }

    const [logs, total] = await Promise.all([
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
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getHealth() {
    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        database: 'connected',
        websocket: 'available',
        simulatedMarket: process.env.SIMULATED_MARKET_ENABLED === 'true' ? 'running' : 'stopped',
        notifications: 'available',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        database: 'error',
        websocket: 'unknown',
        simulatedMarket: 'unknown',
        notifications: 'unknown',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async sendNotification(
    adminId: string,
    userId: string | undefined,
    userIds: string[] | undefined,
    broadcastToAll: boolean,
    type: any,
    priority: any,
    title: string,
    message: string,
    data: any,
  ) {
    let targetUserIds: string[] = [];

    if (broadcastToAll) {
      // Get all active user IDs
      const users = await this.prisma.user.findMany({
        where: { isActive: true, role: Role.USER },
        select: { id: true },
      });
      targetUserIds = users.map(u => u.id);
    } else if (userIds && userIds.length > 0) {
      targetUserIds = userIds;
    } else if (userId) {
      targetUserIds = [userId];
    } else {
      throw new BadRequestException(
        'Must specify userId, userIds, or broadcastToAll',
      );
    }

    // Create notifications for all target users
    const notifications = await Promise.all(
      targetUserIds.map(uid =>
        this.prisma.notification.create({
          data: {
            userId: uid,
            type: type,
            priority: priority,
            title,
            message,
            data: data || {},
          },
        }),
      ),
    );

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ADMIN_NOTIFICATION_SENT',
        entityType: 'Notification',
        entityId: notifications[0]?.id || 'bulk',
        metadata: {
          recipientCount: targetUserIds.length,
          type,
          title,
          broadcastToAll,
        },
      },
    });

    // Emit events for real-time delivery
    notifications.forEach(notification => {
      this.eventEmitter.emit('notification.created', notification);
    });

    return {
      success: true,
      count: notifications.length,
      message: `Notification sent to ${notifications.length} user(s)`,
    };
  }
}
