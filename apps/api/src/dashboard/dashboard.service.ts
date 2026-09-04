import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, TradeStatus, OrderStatus } from '@prisma/client';
import Decimal from 'decimal.js';

export interface UserDashboardSummary {
  accounts: {
    total: number;
    active: number;
    passed: number;
    breached: number;
  };
  financial: {
    totalInitialBalance: string;
    totalCurrentBalance: string;
    totalEquity: string;
    totalPnl: string;
  };
  recentTrades: any[];
  recentOrders: any[];
}

export interface AdminDashboardSummary {
  platform: {
    totalUsers: number;
    activeUsers: number;
    totalChallengePlans: number;
    activeChallengePlans: number;
    totalOrders: number;
    pendingOrders: number;
    paidOrders: number;
    totalTradingAccounts: number;
    activeTradingAccounts: number;
    passedAccounts: number;
    breachedAccounts: number;
  };
  financial: {
    totalOrderValue: string;
    totalPaidOrderValue: string;
    pendingPaymentValue: string;
  };
  trading: {
    totalTrades: number;
    openPositions: number;
    closedTrades: number;
    aggregateRealizedPnl: string;
    aggregateUnrealizedPnl: string;
  };
  recentActivity: {
    recentUsers: any[];
    recentOrders: any[];
    recentAccounts: any[];
    recentTrades: any[];
  };
}

/**
 * Dashboard Service
 * 
 * Provides summary data for:
 * - User dashboard
 * - Admin dashboard
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user dashboard summary
   * @param userId User ID
   */
  async getUserDashboard(userId: string): Promise<UserDashboardSummary> {
    // Get user's trading accounts
    const accounts = await this.prisma.tradingAccount.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        initialBalance: true,
        currentBalance: true,
        equity: true,
      },
    });

    // Count by status
    const total = accounts.length;
    const active = accounts.filter(
      (a) => a.status === TradingAccountStatus.ACTIVE,
    ).length;
    const passed = accounts.filter(
      (a) => a.status === TradingAccountStatus.PASSED,
    ).length;
    const breached = accounts.filter(
      (a) => a.status === TradingAccountStatus.BREACHED,
    ).length;

    // Calculate financial totals
    const totalInitialBalance = accounts.reduce(
      (sum, a) => sum.plus(a.initialBalance),
      new Decimal(0),
    );
    const totalCurrentBalance = accounts.reduce(
      (sum, a) => sum.plus(a.currentBalance),
      new Decimal(0),
    );
    const totalEquity = accounts.reduce(
      (sum, a) => sum.plus(a.equity),
      new Decimal(0),
    );
    const totalPnl = totalEquity.minus(totalInitialBalance);

    // Get recent trades (last 5)
    const recentTrades = await this.prisma.trade.findMany({
      where: {
        tradingAccount: { userId },
      },
      orderBy: { openedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        symbol: true,
        side: true,
        volume: true,
        realizedPnl: true,
        status: true,
        openedAt: true,
        closedAt: true,
      },
    });

    // Get recent orders (last 5)
    const recentOrders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        challengePlan: {
          select: {
            name: true,
          },
        },
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      accounts: {
        total,
        active,
        passed,
        breached,
      },
      financial: {
        totalInitialBalance: totalInitialBalance.toFixed(2),
        totalCurrentBalance: totalCurrentBalance.toFixed(2),
        totalEquity: totalEquity.toFixed(2),
        totalPnl: totalPnl.toFixed(2),
      },
      recentTrades: recentTrades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        volume: t.volume.toString(),
        realizedPnl: t.realizedPnl.toFixed(2),
        status: t.status,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        challengeName: o.challengePlan.name,
        amount: o.amount.toFixed(2),
        currency: o.currency,
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
  }

  /**
   * Get admin dashboard summary
   */
  async getAdminDashboard(): Promise<AdminDashboardSummary> {
    // Platform metrics (parallel queries)
    const [
      totalUsers,
      activeUsers,
      totalChallengePlans,
      activeChallengePlans,
      totalOrders,
      pendingOrders,
      paidOrders,
      totalTradingAccounts,
      activeTradingAccounts,
      passedAccounts,
      breachedAccounts,
      totalTrades,
      openPositions,
      closedTrades,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.challengePlan.count(),
      this.prisma.challengePlan.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
      this.prisma.tradingAccount.count(),
      this.prisma.tradingAccount.count({
        where: { status: TradingAccountStatus.ACTIVE },
      }),
      this.prisma.tradingAccount.count({
        where: { status: TradingAccountStatus.PASSED },
      }),
      this.prisma.tradingAccount.count({
        where: { status: TradingAccountStatus.BREACHED },
      }),
      this.prisma.trade.count(),
      this.prisma.trade.count({ where: { status: TradeStatus.OPEN } }),
      this.prisma.trade.count({ where: { status: TradeStatus.CLOSED } }),
    ]);

    // Financial metrics
    const orders = await this.prisma.order.findMany({
      select: {
        amount: true,
        status: true,
      },
    });

    const totalOrderValue = orders.reduce(
      (sum, o) => sum.plus(o.amount),
      new Decimal(0),
    );
    const totalPaidOrderValue = orders
      .filter((o) => o.status === OrderStatus.PAID)
      .reduce((sum, o) => sum.plus(o.amount), new Decimal(0));
    const pendingPaymentValue = orders
      .filter((o) => o.status === OrderStatus.PENDING)
      .reduce((sum, o) => sum.plus(o.amount), new Decimal(0));

    // Trading metrics
    const trades = await this.prisma.trade.findMany({
      where: { status: TradeStatus.CLOSED },
      select: { realizedPnl: true },
    });

    const aggregateRealizedPnl = trades.reduce(
      (sum, t) => sum.plus(t.realizedPnl),
      new Decimal(0),
    );

    // For now, unrealized PnL aggregate would require market prices
    // Simplified to 0 for admin overview
    const aggregateUnrealizedPnl = new Decimal(0);

    // Recent activity
    const recentUsers = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    const recentOrders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
        challengePlan: {
          select: { name: true },
        },
        amount: true,
        status: true,
        createdAt: true,
      },
    });

    const recentAccounts = await this.prisma.tradingAccount.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        accountNumber: true,
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
        challengePlan: {
          select: { name: true },
        },
        status: true,
        initialBalance: true,
        createdAt: true,
      },
    });

    const recentTrades = await this.prisma.trade.findMany({
      orderBy: { openedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        tradingAccount: {
          select: {
            accountNumber: true,
            user: {
              select: { email: true },
            },
          },
        },
        symbol: true,
        side: true,
        volume: true,
        realizedPnl: true,
        status: true,
        openedAt: true,
        closedAt: true,
      },
    });

    return {
      platform: {
        totalUsers,
        activeUsers,
        totalChallengePlans,
        activeChallengePlans,
        totalOrders,
        pendingOrders,
        paidOrders,
        totalTradingAccounts,
        activeTradingAccounts,
        passedAccounts,
        breachedAccounts,
      },
      financial: {
        totalOrderValue: totalOrderValue.toFixed(2),
        totalPaidOrderValue: totalPaidOrderValue.toFixed(2),
        pendingPaymentValue: pendingPaymentValue.toFixed(2),
      },
      trading: {
        totalTrades,
        openPositions,
        closedTrades,
        aggregateRealizedPnl: aggregateRealizedPnl.toFixed(2),
        aggregateUnrealizedPnl: aggregateUnrealizedPnl.toFixed(2),
      },
      recentActivity: {
        recentUsers: recentUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
          createdAt: u.createdAt,
        })),
        recentOrders: recentOrders.map((o) => ({
          id: o.id,
          user: `${o.user.firstName} ${o.user.lastName}`,
          userEmail: o.user.email,
          challenge: o.challengePlan.name,
          amount: o.amount.toFixed(2),
          status: o.status,
          createdAt: o.createdAt,
        })),
        recentAccounts: recentAccounts.map((a) => ({
          id: a.id,
          accountNumber: a.accountNumber,
          user: `${a.user.firstName} ${a.user.lastName}`,
          userEmail: a.user.email,
          challenge: a.challengePlan.name,
          initialBalance: a.initialBalance.toFixed(2),
          status: a.status,
          createdAt: a.createdAt,
        })),
        recentTrades: recentTrades.map((t) => ({
          id: t.id,
          accountNumber: t.tradingAccount.accountNumber,
          userEmail: t.tradingAccount.user.email,
          symbol: t.symbol,
          side: t.side,
          volume: t.volume.toString(),
          realizedPnl: t.realizedPnl.toFixed(2),
          status: t.status,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
        })),
      },
    };
  }
}
