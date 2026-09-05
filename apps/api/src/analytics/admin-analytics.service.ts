import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getAdminAnalytics(timeRange: string) {
    const now = new Date();
    let startDate: Date;

    // Calculate start date based on time range
    switch (timeRange) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // User Metrics
    const [
      totalUsers,
      activeUsers,
      newRegistrations,
      usersBeforeRange,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: startDate } } }),
      this.prisma.user.count({ where: { createdAt: { lt: startDate } } }),
    ]);

    const userGrowth = totalUsers - usersBeforeRange;

    // Revenue Metrics
    const [totalOrderValue, paidOrderValue, pendingOrderValue, paidOrders] =
      await Promise.all([
        this.prisma.order.aggregate({
          _sum: { amount: true },
        }),
        this.prisma.order.aggregate({
          where: { status: 'PAID' },
          _sum: { amount: true },
        }),
        this.prisma.order.aggregate({
          where: { status: 'PENDING' },
          _sum: { amount: true },
        }),
        this.prisma.order.count({ where: { status: 'PAID' } }),
      ]);

    const totalRevenue = paidOrderValue._sum.amount ? parseFloat(paidOrderValue._sum.amount.toString()) : 0;
    const averageOrderValue = paidOrders > 0 ? totalRevenue / paidOrders : 0;

    // Get previous period revenue for growth calculation
    const previousPeriodRevenue = await this.prisma.order.aggregate({
      where: {
        status: 'PAID',
        createdAt: {
          lt: startDate,
          gte: new Date(startDate.getTime() - (now.getTime() - startDate.getTime())),
        },
      },
      _sum: { amount: true },
    });

    const prevRevenue = previousPeriodRevenue._sum.amount ? parseFloat(previousPeriodRevenue._sum.amount.toString()) : 0;
    const revenueGrowth =
      prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    // Trading Account Metrics
    const [
      totalAccounts,
      activeAccounts,
      passedAccounts,
      breachedAccounts,
    ] = await Promise.all([
      this.prisma.tradingAccount.count(),
      this.prisma.tradingAccount.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tradingAccount.count({ where: { status: 'PASSED' } }),
      this.prisma.tradingAccount.count({ where: { status: 'BREACHED' } }),
    ]);

    const passRate =
      totalAccounts > 0 ? (passedAccounts / totalAccounts) * 100 : 0;

    // Trading Activity
    const [
      totalTrades,
      openPositions,
      closedTrades,
      realizedPnl,
      unrealizedPnl,
    ] = await Promise.all([
      this.prisma.trade.count(),
      this.prisma.trade.count({ where: { status: 'OPEN' } }),
      this.prisma.trade.count({ where: { status: 'CLOSED' } }),
      this.prisma.trade.aggregate({
        where: { status: 'CLOSED' },
        _sum: { realizedPnl: true },
      }),
      this.prisma.trade.aggregate({
        where: { status: 'OPEN' },
        _sum: { unrealizedPnl: true },
      }),
    ]);

    const winningTrades = await this.prisma.trade.count({
      where: {
        status: 'CLOSED',
        realizedPnl: { gt: '0' },
      },
    });

    const winRate = closedTrades > 0 ? (winningTrades / closedTrades) * 100 : 0;
    const totalPnl =
      (realizedPnl._sum.realizedPnl ? parseFloat(realizedPnl._sum.realizedPnl.toString()) : 0) +
      (unrealizedPnl._sum.unrealizedPnl ? parseFloat(unrealizedPnl._sum.unrealizedPnl.toString()) : 0);

    // Payout Metrics (if payout model exists)
    let payoutMetrics;
    try {
      const [totalPayouts, pendingPayouts, completedPayouts, payoutAmount] =
        await Promise.all([
          this.prisma.payout.count(),
          this.prisma.payout.count({ where: { status: 'PENDING' } }),
          this.prisma.payout.count({ where: { status: 'COMPLETED' } }),
          this.prisma.payout.aggregate({
            _sum: { amount: true },
          }),
        ]);

      payoutMetrics = {
        total: totalPayouts,
        pending: pendingPayouts,
        completed: completedPayouts,
        totalAmount: payoutAmount._sum.amount || '0',
      };
    } catch (error) {
      // Payout table might not exist yet
      payoutMetrics = null;
    }

    // Popular Challenge Plans
    const popularPlans = await this.prisma.challengePlan.findMany({
      take: 5,
      orderBy: {
        orders: {
          _count: 'desc',
        },
      },
      select: {
        id: true,
        name: true,
        startingBalance: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newRegistrations,
        growth: userGrowth,
        retention: totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0,
      },
      revenue: {
        total: totalRevenue,
        growth: revenueGrowth,
        averageOrderValue,
        paidOrders,
        pending: pendingOrderValue._sum.amount ? parseFloat(pendingOrderValue._sum.amount.toString()) : 0,
      },
      accounts: {
        total: totalAccounts,
        active: activeAccounts,
        passed: passedAccounts,
        breached: breachedAccounts,
        passRate,
      },
      trading: {
        totalTrades,
        openPositions,
        closedTrades,
        winRate,
        realizedPnl: realizedPnl._sum.realizedPnl || '0',
        unrealizedPnl: unrealizedPnl._sum.unrealizedPnl || '0',
        totalPnl: totalPnl.toString(),
      },
      payouts: payoutMetrics,
      popularPlans: popularPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        startingBalance: plan.startingBalance,
        orderCount: plan._count.orders,
      })),
    };
  }
}
