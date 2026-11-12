import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
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
  testFunding?: boolean;
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

  async getTestFundingStatus(userId: string) {
    if (!this.isTestFundingAuthorized(userId)) {
      return { enabled: false, initialBalance: null, currency: null, label: null };
    }

    const existingTestAccount = await this.prisma.tradingAccount.findFirst({
      where: { userId, isTestAccount: true },
      select: { id: true },
    });
    const enabled = !existingTestAccount;
    const initialBalance = enabled ? this.getSimulatedTestBalance().toFixed(2) : null;
    return {
      enabled,
      initialBalance,
      currency: enabled ? 'USD' : null,
      label: enabled ? 'SIMULATED TEST FUNDS' : null,
    };
  }

  async createWalletFundedAccount(userId: string, dto?: CreateTradingAccountDto) {
    const testFunding = dto?.testFunding === true;
    if (testFunding && !this.isTestFundingAuthorized(userId)) {
      throw new ForbiddenException('Simulated test funding is disabled or this user is not authorized.');
    }

    if (testFunding && dto?.initialFundingAmount !== undefined) {
      throw new BadRequestException('Test-funded accounts use the server-configured simulated balance.');
    }

    let fundingAmount: Decimal;
    if (testFunding) {
      fundingAmount = this.getSimulatedTestBalance();
    } else {
      try {
        fundingAmount = dto?.initialFundingAmount
          ? new Decimal(dto.initialFundingAmount)
          : new Decimal(0);
      } catch {
        throw new BadRequestException('Initial funding amount must be a valid non-negative number');
      }
    }

    if (!fundingAmount.isFinite() || fundingAmount.lessThan(0)) {
      throw new BadRequestException('Initial funding amount must be a valid non-negative number');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Verify user exists
        const user = await tx.user.findUnique({
          where: { id: userId },
        });
        if (!user) {
          throw new NotFoundException('User not found');
        }

        if (testFunding) {
          const existingTestAccount = await tx.tradingAccount.findFirst({
            where: { userId, isTestAccount: true },
            select: { id: true },
          });
          if (existingTestAccount) {
            throw new ConflictException('This user already has a simulated test account.');
          }
        }

        // 2. If funding amount > 0, check and debit wallet
        let wallet: any = null;
        let balanceBefore = new Decimal(0);
        let balanceAfter = new Decimal(0);

        if (!testFunding && fundingAmount.greaterThan(0)) {
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
            isTestAccount: testFunding,
            testFundingUserId: testFunding ? userId : null,
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
                fundingType: 'WALLET',
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
              fundingType: testFunding ? 'SIMULATED_TEST_FUNDS' : 'WALLET',
              testAccount: testFunding,
              executionMode: 'SIMULATED',
              stage: 'FUNDED',
            },
          },
        });

        this.logger.log(
          `Created ${testFunding ? 'simulated test' : 'wallet-funded'} trading account ${tradingAccount.accountNumber} for user ${userId} with initial balance $${fundingAmount.toFixed(2)}`,
        );

        return {
          ...tradingAccount,
          walletBalance: !testFunding && fundingAmount.greaterThan(0) ? balanceAfter.toFixed(2) : undefined,
        };
        });
    } catch (error) {
      if (
        testFunding &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002' &&
        'meta' in error &&
        typeof error.meta === 'object' &&
        error.meta !== null &&
        'target' in error.meta &&
        String(error.meta.target).includes('testFundingUserId')
      ) {
        throw new ConflictException('This user already has a simulated test account.');
      }
      throw error;
    }
  }

  private isTestFundingAuthorized(userId: string): boolean {
    const environment = process.env.NODE_ENV;
    const enabled = process.env.SIMULATED_TEST_FUNDING_ENABLED === 'true';
    const allowedUserIds = (process.env.SIMULATED_TEST_USER_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    return environment !== 'production' && (environment === 'development' || environment === 'test')
      && enabled
      && allowedUserIds.includes(userId);
  }

  private getSimulatedTestBalance(): Decimal {
    let balance: Decimal;
    try {
      balance = new Decimal(process.env.SIMULATED_TEST_INITIAL_BALANCE || '10000.00');
    } catch {
      throw new ServiceUnavailableException(
        'SIMULATED_TEST_INITIAL_BALANCE must be a positive USD amount with at most two decimal places.',
      );
    }

    if (
      !balance.isFinite() ||
      balance.lessThanOrEqualTo(0) ||
      balance.decimalPlaces() > 2 ||
      balance.greaterThan('9999999999.99')
    ) {
      throw new ServiceUnavailableException(
        'SIMULATED_TEST_INITIAL_BALANCE must be a positive USD amount with at most two decimal places.',
      );
    }
    return balance;
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
