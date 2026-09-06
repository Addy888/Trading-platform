import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminTradesService {
  constructor(private prisma: PrismaService) {}

  async getTrades(params: {
    page: number;
    limit: number;
    status?: string;
    symbol?: string;
    userId?: string;
    accountId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { page, limit, status, symbol, userId, accountId, startDate, endDate, search } = params;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.TradeWhereInput = {};

    if (status) {
      where.status = status as any;
    }

    if (symbol) {
      where.symbol = { contains: symbol };
    }

    if (accountId) {
      where.tradingAccountId = accountId;
    }

    if (userId) {
      where.tradingAccount = {
        userId,
      };
    }

    if (startDate || endDate) {
      where.openedAt = {};
      if (startDate) {
        where.openedAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.openedAt.lte = new Date(endDate);
      }
    }

    if (search) {
      where.OR = [
        { symbol: { contains: search } },
        { tradingAccount: { accountNumber: { contains: search } } },
        { tradingAccount: { user: { email: { contains: search } } } },
      ];
    }

    // Get total count
    const total = await this.prisma.trade.count({ where });

    // Get trades with relations
    const trades = await this.prisma.trade.findMany({
      where,
      skip,
      take: limit,
      orderBy: { openedAt: 'desc' },
      include: {
        tradingAccount: {
          include: {
            user: {
              select: {
                id: true,
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
        },
      },
    });

    return {
      data: trades,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTradeById(id: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: {
        tradingAccount: {
          include: {
            user: {
              select: {
                id: true,
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
        },
      },
    });

    if (!trade) {
      throw new NotFoundException('Trade not found');
    }

    return trade;
  }

  async getTradeStats() {
    const [total, open, closed, aggregates] = await Promise.all([
      this.prisma.trade.count(),
      this.prisma.trade.count({ where: { status: 'OPEN' } }),
      this.prisma.trade.count({ where: { status: 'CLOSED' } }),
      this.prisma.trade.aggregate({
        _sum: {
          volume: true,
          realizedPnl: true,
          unrealizedPnl: true,
        },
      }),
    ]);

    // Calculate winning/losing trades
    const winningTrades = await this.prisma.trade.count({
      where: {
        status: 'CLOSED',
        realizedPnl: { gt: 0 },
      },
    });

    const losingTrades = await this.prisma.trade.count({
      where: {
        status: 'CLOSED',
        realizedPnl: { lt: 0 },
      },
    });

    const winRate = closed > 0 ? (winningTrades / closed) * 100 : 0;

    return {
      total,
      open,
      closed,
      totalVolume: aggregates._sum.volume?.toString() || '0',
      totalRealizedPnl: aggregates._sum.realizedPnl?.toString() || '0',
      totalUnrealizedPnl: aggregates._sum.unrealizedPnl?.toString() || '0',
      winningTrades,
      losingTrades,
      winRate: Math.round(winRate * 100) / 100,
    };
  }
}
