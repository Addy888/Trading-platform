import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleSnapshotService } from './rule-snapshot.service';
import { AccountsQueryDto } from './dto/accounts-query.dto';

@Injectable()
export class TradingAccountsService {
  constructor(
    private prisma: PrismaService,
    private ruleSnapshot: RuleSnapshotService,
  ) {}

  async findUserAccounts(userId: string) {
    return this.prisma.tradingAccount.findMany({
      where: { userId },
      include: {
        challengePlan: true,
        ruleSet: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUserAccount(accountId: string, userId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
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
        order: true,
        ruleSnapshot: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return account;
  }

  async findAllAccounts(query: AccountsQueryDto) {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { accountNumber: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { firstName: { contains: search } } },
        { user: { lastName: { contains: search } } },
      ];
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
          challengePlan: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.tradingAccount.count({ where }),
    ]);

    return {
      accounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAccountById(accountId: string) {
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
        order: true,
        ruleSnapshot: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    return account;
  }
}
