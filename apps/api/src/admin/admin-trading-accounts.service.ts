import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdminTradingAccountsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getTradingAccounts(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: TradingAccountStatus,
    challengePlanId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { accountNumber: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { firstName: { contains: search } } },
        { user: { lastName: { contains: search } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (challengePlanId) {
      where.challengePlanId = challengePlanId;
    }

    const [accounts, total] = await Promise.all([
      this.prisma.tradingAccount.findMany({
        where,
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
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              trades: true,
              snapshots: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.tradingAccount.count({ where }),
    ]);

    return {
      data: accounts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTradingAccountById(accountId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            country: true,
          },
        },
        challengePlan: true,
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
        order: {
          include: {
            payment: true,
          },
        },
        _count: {
          select: {
            trades: true,
            snapshots: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Get trading statistics
    const [openTrades, closedTrades, tradeStats] = await Promise.all([
      this.prisma.trade.findMany({
        where: {
          tradingAccountId: accountId,
          status: 'OPEN',
        },
        select: {
          id: true,
          symbol: true,
          side: true,
          volume: true,
          entryPrice: true,
          stopLoss: true,
          takeProfit: true,
          realizedPnl: true,
          openedAt: true,
        },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.trade.findMany({
        where: {
          tradingAccountId: accountId,
          status: 'CLOSED',
        },
        select: {
          id: true,
          symbol: true,
          side: true,
          volume: true,
          entryPrice: true,
          exitPrice: true,
          realizedPnl: true,
          openedAt: true,
          closedAt: true,
        },
        orderBy: { closedAt: 'desc' },
        take: 20,
      }),
      this.prisma.trade.aggregate({
        where: {
          tradingAccountId: accountId,
        },
        _count: true,
        _sum: {
          realizedPnl: true,
        },
      }),
    ]);

    // Get recent snapshots
    const recentSnapshots = await this.prisma.accountSnapshot.findMany({
      where: { tradingAccountId: accountId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get audit logs
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'TradingAccount', entityId: accountId },
          { entityType: 'Trade', metadata: { path: ['tradingAccountId'], equals: accountId } },
        ],
      },
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
      take: 20,
    });

    return {
      account,
      trading: {
        openTrades,
        closedTrades,
        statistics: {
          totalTrades: tradeStats._count,
          totalRealizedPnl: tradeStats._sum.realizedPnl?.toFixed(2) || '0.00',
        },
      },
      history: {
        snapshots: recentSnapshots,
        auditLogs,
      },
    };
  }

  async updateTradingAccountStatus(
    accountId: string,
    status: TradingAccountStatus,
    adminId: string,
  ) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountNumber: true,
        status: true,
        userId: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Validate status transition
    this.validateStatusTransition(account.status, status);

    const updatedAccount = await this.prisma.tradingAccount.update({
      where: { id: accountId },
      data: { status },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'TRADING_ACCOUNT_STATUS_CHANGED',
        entityType: 'TradingAccount',
        entityId: accountId,
        metadata: {
          accountNumber: account.accountNumber,
          previousStatus: account.status,
          newStatus: status,
        },
      },
    });

    // Emit event for admin notifications
    this.eventEmitter.emit('admin.account.status.changed', {
      accountId,
      accountNumber: account.accountNumber,
      userId: account.userId,
      userEmail: account.user.email,
      previousStatus: account.status,
      newStatus: status,
      adminId,
    });

    return updatedAccount;
  }

  private validateStatusTransition(
    currentStatus: TradingAccountStatus,
    newStatus: TradingAccountStatus,
  ) {
    // Define valid transitions
    const validTransitions: Record<TradingAccountStatus, TradingAccountStatus[]> = {
      [TradingAccountStatus.PENDING]: [TradingAccountStatus.ACTIVE, TradingAccountStatus.SUSPENDED],
      [TradingAccountStatus.ACTIVE]: [TradingAccountStatus.SUSPENDED, TradingAccountStatus.CLOSED, TradingAccountStatus.PASSED, TradingAccountStatus.BREACHED],
      [TradingAccountStatus.PASSED]: [TradingAccountStatus.SUSPENDED, TradingAccountStatus.CLOSED],
      [TradingAccountStatus.BREACHED]: [TradingAccountStatus.CLOSED],
      [TradingAccountStatus.SUSPENDED]: [TradingAccountStatus.ACTIVE, TradingAccountStatus.CLOSED],
      [TradingAccountStatus.CLOSED]: [], // Cannot transition from CLOSED
    };

    const allowedTransitions = validTransitions[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }
}
