import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleSnapshotService } from './rule-snapshot.service';
import { AccountStateService } from './account-state.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { AccountsQueryDto } from './dto/accounts-query.dto';
import {
  TradingAccountStatus,
  AccountStage,
  WalletLedgerType,
  LedgerDirection,
} from '@prisma/client';
import Decimal from 'decimal.js';

export interface CreateTradingAccountDto {
  initialFundingAmount?: string | number;
}

@Injectable()
export class TradingAccountsService {
  private readonly logger = new Logger(TradingAccountsService.name);

  constructor(
    private prisma: PrismaService,
    private ruleSnapshot: RuleSnapshotService,
    private accountState: AccountStateService,
    private accountSnapshots: AccountSnapshotsService,
  ) {}

  async createWalletFundedAccount(userId: string, dto?: CreateTradingAccountDto) {
    const fundingAmount = dto?.initialFundingAmount
      ? new Decimal(dto.initialFundingAmount)
      : new Decimal(0);

    if (fundingAmount.isNaN() || fundingAmount.lessThan(0)) {
      throw new BadRequestException('Initial funding amount must be a valid non-negative number');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Verify user exists
      const user = await tx.user.findUnique({
        where: { id: userId },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // 2. If funding amount > 0, check and debit wallet
      let wallet: any = null;
      let balanceBefore = new Decimal(0);
      let balanceAfter = new Decimal(0);

      if (fundingAmount.greaterThan(0)) {
        wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new BadRequestException('Wallet not found. Please deposit funds first.');
        }

        balanceBefore = new Decimal(wallet.balance);
        if (balanceBefore.lessThan(fundingAmount)) {
          throw new BadRequestException(
            `Insufficient wallet balance. Available: $${balanceBefore.toFixed(2)}, Requested: $${fundingAmount.toFixed(2)}`,
          );
        }

        balanceAfter = balanceBefore.minus(fundingAmount);

        // Debit wallet
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter.toFixed(2) },
        });
      }

      // 3. Find default or first active ruleSet
      let ruleSet = await tx.ruleSet.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!ruleSet) {
        ruleSet = await tx.ruleSet.findFirst();
      }

      if (!ruleSet) {
        throw new BadRequestException('No trading rule set found in system');
      }

      // 4. Generate unique sequential account number
      const accountNumber = await this.generateAccountNumber(tx);

      // 5. Create trading account with stage FUNDED and executionMode SIMULATED
      const tradingAccount = await tx.tradingAccount.create({
        data: {
          userId,
          ruleSetId: ruleSet.id,
          accountNumber,
          initialBalance: fundingAmount.toFixed(2),
          currentBalance: fundingAmount.toFixed(2),
          equity: fundingAmount.toFixed(2),
          status: TradingAccountStatus.ACTIVE,
          executionMode: 'SIMULATED',
          stage: AccountStage.FUNDED,
          startedAt: new Date(),
        },
        include: {
          ruleSet: true,
          challengePlan: true,
        },
      });

      // 6. Record wallet ledger entry if funded
      if (fundingAmount.greaterThan(0) && wallet) {
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: WalletLedgerType.TRANSFER_TO_TRADING,
            direction: LedgerDirection.DEBIT,
            amount: fundingAmount.toFixed(2),
            balanceBefore: balanceBefore.toFixed(2),
            balanceAfter: balanceAfter.toFixed(2),
            currency: wallet.currency,
            referenceType: 'TRADING_ACCOUNT',
            referenceId: tradingAccount.id,
            description: `Initial funding for trading account ${tradingAccount.accountNumber}`,
            metadata: {
              tradingAccountId: tradingAccount.id,
              accountNumber: tradingAccount.accountNumber,
            },
            actorId: userId,
          },
        });
      }

      // 7. Initialize account state
      await this.accountState.initializeAccountState(
        tradingAccount.id,
        fundingAmount,
        tx,
        AccountStage.FUNDED,
      );

      // 8. Create immutable rule snapshot
      await this.ruleSnapshot.createRuleSnapshot(
        tradingAccount.id,
        ruleSet.id,
        tx,
      );

      // 9. Create initial snapshot
      await this.accountSnapshots.createSnapshot(
        tradingAccount.id,
        fundingAmount,
        fundingAmount,
        new Decimal(0),
        new Decimal(0),
        tx,
      );

      // 10. Audit log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'TRADING_ACCOUNT_CREATED',
          entityType: 'TradingAccount',
          entityId: tradingAccount.id,
          metadata: {
            accountNumber: tradingAccount.accountNumber,
            initialFunding: fundingAmount.toFixed(2),
            executionMode: 'SIMULATED',
            stage: 'FUNDED',
          },
        },
      });

      this.logger.log(
        `Created wallet-funded trading account ${tradingAccount.accountNumber} for user ${userId} with initial funding $${fundingAmount.toFixed(2)}`,
      );

      return {
        ...tradingAccount,
        walletBalance: fundingAmount.greaterThan(0) ? balanceAfter.toFixed(2) : undefined,
      };
    });
  }

  private async generateAccountNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();

    const latestAccount = await tx.tradingAccount.findFirst({
      where: {
        accountNumber: {
          startsWith: `TRD-${year}-`,
        },
      },
      orderBy: {
        accountNumber: 'desc',
      },
    });

    let sequence = 1;
    if (latestAccount) {
      const parts = latestAccount.accountNumber.split('-');
      if (parts.length >= 3 && !isNaN(parseInt(parts[2], 10))) {
        sequence = parseInt(parts[2], 10) + 1;
      }
    }

    return `TRD-${year}-${sequence.toString().padStart(6, '0')}`;
  }

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
