import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { PayoutStatus, TradingAccountStatus } from '@prisma/client';
import { Decimal } from 'decimal.js';

@Injectable()
export class PayoutsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async requestPayout(userId: string, requestPayoutDto: RequestPayoutDto) {
    const { tradingAccountId, amount, method, destination, notes } =
      requestPayoutDto;

    // Verify account ownership and status
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
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
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Check account status - only PASSED or ACTIVE accounts can request payouts
    if (
      account.status !== TradingAccountStatus.PASSED &&
      account.status !== TradingAccountStatus.ACTIVE
    ) {
      throw new BadRequestException(
        'Only passed or active accounts can request payouts',
      );
    }

    // Check if account has sufficient profit
    const profit = parseFloat(account.equity.toString()) - parseFloat(account.initialBalance.toString());
    if (profit <= 0) {
      throw new BadRequestException('Account has no profit to withdraw');
    }

    // Check if requested amount is valid
    if (amount > profit) {
      throw new BadRequestException(
        `Requested amount exceeds available profit (${profit.toFixed(2)})`,
      );
    }

    // Check for pending payout requests
    const pendingPayout = await this.prisma.payout.findFirst({
      where: {
        userId,
        tradingAccountId,
        status: PayoutStatus.PENDING,
      },
    });

    if (pendingPayout) {
      throw new BadRequestException(
        'You already have a pending payout request for this account',
      );
    }

    // Create payout request
    const payout = await this.prisma.payout.create({
      data: {
        userId,
        tradingAccountId,
        amount: new Decimal(amount),
        currency: 'USD',
        status: PayoutStatus.PENDING,
        method: method || 'Bank Transfer',
        destination,
        notes,
        requestedAt: new Date(),
      },
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

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PAYOUT_REQUESTED',
        entityType: 'Payout',
        entityId: payout.id,
        metadata: {
          tradingAccountId,
          accountNumber: account.accountNumber,
          amount: amount.toString(),
          method: method || 'Bank Transfer',
        },
      },
    });

    // Emit event for admin notification
    this.eventEmitter.emit('payout.requested', {
      payoutId: payout.id,
      userId,
      userEmail: payout.user.email,
      userName: `${payout.user.firstName} ${payout.user.lastName}`,
      accountNumber: account.accountNumber,
      amount,
    });

    return payout;
  }

  async getUserPayouts(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where: { userId },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payout.count({ where: { userId } }),
    ]);

    return {
      data: payouts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPayoutDetails(id: string, userId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
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

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    // Verify ownership
    if (payout.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return payout;
  }

  async checkPayoutEligibility(tradingAccountId: string, userId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Check if account status allows payouts
    const statusEligible =
      account.status === TradingAccountStatus.PASSED ||
      account.status === TradingAccountStatus.ACTIVE;

    // Calculate profit
    const profit = parseFloat(account.equity.toString()) - parseFloat(account.initialBalance.toString());
    const hasProfit = profit > 0;

    // Check for pending payouts
    const pendingPayout = await this.prisma.payout.findFirst({
      where: {
        userId,
        tradingAccountId,
        status: PayoutStatus.PENDING,
      },
    });

    // Check minimum trading days if rule exists
    const minTradingDaysRule = account.ruleSet.ruleSetRules.find(
      (rsr) => rsr.rule.type === 'MIN_TRADING_DAYS',
    );

    let minTradingDaysMet = true;
    if (minTradingDaysRule && account.startedAt) {
      const daysSinceStart = Math.floor(
        (Date.now() - account.startedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      minTradingDaysMet =
        daysSinceStart >= parseFloat(minTradingDaysRule.rule.value.toString());
    }

    const eligible =
      statusEligible &&
      hasProfit &&
      !pendingPayout &&
      minTradingDaysMet;

    return {
      eligible,
      reasons: {
        statusEligible,
        hasProfit,
        hasPendingPayout: !!pendingPayout,
        minTradingDaysMet,
      },
      accountStatus: account.status,
      availableProfit: profit > 0 ? profit.toFixed(2) : '0.00',
      balance: account.currentBalance.toString(),
      equity: account.equity.toString(),
    };
  }
}
