import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { InitiateDepositDto } from './dto/initiate-deposit.dto';
import { TransferToTradingDto, TransferFromTradingDto } from './dto/transfer-funds.dto';
import { AdminAdjustmentDto } from './dto/admin-adjustment.dto';
import { PaymentsQueryDto } from './dto/payments-query.dto';
import {
  PaymentStatusExtended,
  WalletLedgerType,
  LedgerDirection,
  TradingAccountStatus,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Retrieves or initializes the user platform wallet
   */
  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          currency: 'USD',
          balance: new Decimal(0),
          lockedBalance: new Decimal(0),
        },
        include: {
          ledgerEntries: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
    }

    return wallet;
  }

  /**
   * Initiates a checkout deposit session
   */
  async initiateDeposit(userId: string, dto: InitiateDepositDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Decimal-safe validation of deposit amount
    let amount: Decimal;
    try {
      amount = new Decimal(dto.amount);
    } catch {
      throw new BadRequestException('Deposit amount must be a valid positive number');
    }

    if (amount.isNaN() || !amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Deposit amount must be a positive number');
    }

    if (amount.lessThan(5)) {
      throw new BadRequestException('Minimum deposit amount is 5.00');
    }

    const wallet = await this.getOrCreateWallet(userId);
    const internalReference = `DEP-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;
    const currency = dto.currency.toUpperCase();

    const provider = this.providerFactory.getProvider(dto.provider);

    // Create pending payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        walletId: wallet.id,
        amount: amount.toFixed(2),
        currency,
        status: PaymentStatusExtended.PENDING,
        provider: provider.name,
        reference: internalReference,
        idempotencyKey: internalReference,
      },
    });

    // Create checkout session with provider
    const session = await provider.createCheckoutSession({
      paymentId: payment.id,
      internalReference,
      userId,
      userEmail: user.email,
      amount: amount.toFixed(2),
      currency,
      description: `Wallet Deposit - ${user.email}`,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      metadata: {
        paymentId: payment.id,
        userId,
        walletId: wallet.id,
        internalReference,
      },
    });

    // Update payment with provider reference and metadata
    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerReference: session.providerReference,
        metadata: {
          checkoutUrl: session.checkoutUrl,
          ...session.providerData,
        },
      },
    });

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PAYMENT_INITIATED',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: {
          amount: amount.toFixed(2),
          currency,
          provider: provider.name,
          internalReference,
          providerReference: session.providerReference,
        },
      },
    });

    return {
      paymentId: updatedPayment.id,
      reference: internalReference,
      providerReference: session.providerReference,
      amount: new Decimal(updatedPayment.amount).toFixed(2),
      currency: updatedPayment.currency,
      status: updatedPayment.status,
      checkoutUrl: session.checkoutUrl,
      provider: provider.name,
    };
  }

  /**
   * Processes a verified provider webhook atomically and idempotently
   */
  async processWebhook(
    providerName: string,
    rawPayload: Buffer | string,
    signature: string,
    headers?: Record<string, string | string[] | undefined>,
  ) {
    const provider = this.providerFactory.getProvider(providerName);

    // 1. Verify signature and check replay attacks
    const verification = await provider.verifyWebhook(
      rawPayload,
      signature,
      headers,
    );

    if (!verification.isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const {
      providerReference,
      internalReference,
      amount: reportedAmount,
      currency: reportedCurrency,
      status: targetStatus,
      eventType,
    } = verification;

    // 2. Perform atomic, idempotent state transition in MySQL transaction
    return this.prisma.$transaction(async (tx) => {
      // Find the payment record by providerReference or internalReference
      const payment = await tx.payment.findFirst({
        where: {
          OR: [
            ...(providerReference ? [{ providerReference }] : []),
            ...(internalReference ? [{ reference: internalReference }] : []),
          ],
        },
        include: {
          wallet: true,
          user: true,
        },
      });

      if (!payment) {
        this.logger.warn(
          `Webhook received for unknown payment: providerRef=${providerReference}, internalRef=${internalReference}`,
        );
        throw new NotFoundException('Payment record not found for webhook');
      }

      // 3. Idempotency check: If already processed as SUCCESS or COMPLETED, return immediately
      if (
        payment.status === PaymentStatusExtended.SUCCESS ||
        payment.status === PaymentStatusExtended.COMPLETED
      ) {
        this.logger.log(
          `Duplicate webhook received for already completed payment: ${payment.id}. Double credit prevented.`,
        );
        return {
          success: true,
          message: 'Payment was already processed successfully',
          paymentId: payment.id,
          status: payment.status,
          alreadyProcessed: true,
        };
      }

      // Check if already in final failed/cancelled state
      if (
        (payment.status === PaymentStatusExtended.FAILED &&
          targetStatus === PaymentStatusExtended.FAILED) ||
        (payment.status === PaymentStatusExtended.CANCELLED &&
          targetStatus === PaymentStatusExtended.CANCELLED)
      ) {
        return {
          success: true,
          message: 'Payment already in final status',
          paymentId: payment.id,
          status: payment.status,
          alreadyProcessed: true,
        };
      }

      // 4. Validate amount and currency if reported by provider
      if (reportedAmount) {
        const expected = new Decimal(payment.amount);
        const received = new Decimal(reportedAmount);
        if (!expected.equals(received)) {
          this.logger.error(
            `Payment amount mismatch! Expected: ${expected.toFixed(2)}, Received: ${received.toFixed(2)} for payment ${payment.id}`,
          );
          await tx.auditLog.create({
            data: {
              actorId: payment.userId,
              action: 'PAYMENT_AMOUNT_MISMATCH_SECURITY_ALERT',
              entityType: 'Payment',
              entityId: payment.id,
              metadata: {
                expected: expected.toFixed(2),
                received: received.toFixed(2),
                providerReference,
              },
            },
          });
          throw new BadRequestException('Reported payment amount does not match expected amount');
        }
      }

      if (reportedCurrency && reportedCurrency.toUpperCase() !== payment.currency.toUpperCase()) {
        this.logger.error(
          `Currency mismatch! Expected: ${payment.currency}, Received: ${reportedCurrency} for payment ${payment.id}`,
        );
        throw new BadRequestException('Reported currency does not match expected currency');
      }

      // 5. Handle SUCCESS status -> Credit user wallet atomically
      if (targetStatus === PaymentStatusExtended.SUCCESS) {
        let wallet = payment.wallet;
        if (!wallet && payment.userId) {
          wallet = await tx.wallet.findUnique({
            where: { userId: payment.userId },
          });
          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                userId: payment.userId,
                currency: payment.currency,
                balance: new Decimal(0),
                lockedBalance: new Decimal(0),
              },
            });
          }
        }

        if (!wallet) {
          throw new BadRequestException('No wallet found to credit payment');
        }

        const balanceBefore = new Decimal(wallet.balance);
        const creditAmount = new Decimal(payment.amount);
        const balanceAfter = balanceBefore.plus(creditAmount);

        // Update wallet balance using decimal-safe calculation
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: balanceAfter.toFixed(2),
          },
        });

        // Insert immutable ledger entry
        const ledger = await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: WalletLedgerType.DEPOSIT,
            direction: LedgerDirection.CREDIT,
            amount: creditAmount.toFixed(2),
            balanceBefore: balanceBefore.toFixed(2),
            balanceAfter: balanceAfter.toFixed(2),
            currency: payment.currency,
            referenceType: 'PAYMENT',
            referenceId: payment.id,
            providerReference: providerReference || payment.providerReference,
            description: `Deposit via ${provider.name} (${providerReference || payment.reference})`,
            metadata: {
              eventType,
              provider: provider.name,
              providerReference,
            },
            actorId: payment.userId,
          },
        });

        // Update payment status to SUCCESS
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatusExtended.SUCCESS,
            providerReference: providerReference || payment.providerReference,
            walletId: wallet.id,
          },
        });

        // Audit log (sanitized, no sensitive payment credentials)
        await tx.auditLog.create({
          data: {
            actorId: payment.userId,
            action: 'WALLET_DEPOSIT_CREDITED',
            entityType: 'Wallet',
            entityId: wallet.id,
            metadata: {
              paymentId: payment.id,
              ledgerId: ledger.id,
              amount: creditAmount.toFixed(2),
              currency: payment.currency,
              balanceBefore: balanceBefore.toFixed(2),
              balanceAfter: balanceAfter.toFixed(2),
              provider: provider.name,
              providerReference: providerReference || payment.providerReference,
            },
          },
        });

        // Emit events outside the transaction
        setImmediate(() => {
          this.eventEmitter.emit('payment.status.changed', {
            paymentId: payment.id,
            userId: payment.userId,
            status: 'SUCCESS',
            amount: creditAmount.toFixed(2),
            currency: payment.currency,
          });

          this.eventEmitter.emit('wallet.balance.credited', {
            walletId: wallet.id,
            userId: payment.userId,
            amount: creditAmount.toFixed(2),
            newBalance: balanceAfter.toFixed(2),
          });
        });

        return {
          success: true,
          status: PaymentStatusExtended.SUCCESS,
          paymentId: updatedPayment.id,
          walletId: wallet.id,
          newBalance: balanceAfter.toFixed(2),
        };
      }

      // 6. Handle FAILED / CANCELLED / REFUNDED
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: targetStatus,
          providerReference: providerReference || payment.providerReference,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: payment.userId,
          action: `PAYMENT_${targetStatus}`,
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            status: targetStatus,
            provider: provider.name,
            providerReference,
            eventType,
          },
        },
      });

      return {
        success: true,
        status: targetStatus,
        paymentId: updatedPayment.id,
      };
    });
  }

  /**
   * Explicit, authorized, atomic transfer from User Wallet to a specific Trading Account
   */
  async transferToTradingAccount(userId: string, dto: TransferToTradingDto) {
    const amount = new Decimal(dto.amount);
    if (amount.isNaN() || !amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Transfer amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch and validate trading account ownership and status first
      const tradingAccount = await tx.tradingAccount.findUnique({
        where: { id: dto.tradingAccountId },
      });

      if (!tradingAccount) {
        throw new NotFoundException('Trading account not found');
      }

      if (tradingAccount.userId !== userId) {
        throw new ForbiddenException('Access denied: You do not own this trading account');
      }

      if (tradingAccount.status !== TradingAccountStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot fund trading account with status ${tradingAccount.status}. Only ACTIVE accounts can be funded.`,
        );
      }

      // 2. Fetch wallet with lock
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new NotFoundException('Platform wallet not found');
      }

      // Check sufficient balance
      const currentWalletBalance = new Decimal(wallet.balance);
      if (currentWalletBalance.lessThan(amount)) {
        throw new BadRequestException(
          `Insufficient wallet balance. Available: ${currentWalletBalance.toFixed(2)}, Requested: ${amount.toFixed(2)}`,
        );
      }

      // 3. Atomically debit wallet
      const newWalletBalance = currentWalletBalance.minus(amount);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newWalletBalance.toFixed(2),
        },
      });

      // 4. Create ledger entry for wallet debit
      const ledger = await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: WalletLedgerType.TRANSFER_TO_TRADING,
          direction: LedgerDirection.DEBIT,
          amount: amount.toFixed(2),
          balanceBefore: currentWalletBalance.toFixed(2),
          balanceAfter: newWalletBalance.toFixed(2),
          currency: wallet.currency,
          referenceType: 'TRADING_ACCOUNT',
          referenceId: tradingAccount.id,
          description: `Transfer to trading account ${tradingAccount.accountNumber}`,
          metadata: {
            tradingAccountId: tradingAccount.id,
            accountNumber: tradingAccount.accountNumber,
          },
          actorId: userId,
        },
      });

      // 5. Atomically credit trading account balance and equity
      const currentAccountBalance = new Decimal(tradingAccount.currentBalance);
      const currentEquity = new Decimal(tradingAccount.equity);
      const newAccountBalance = currentAccountBalance.plus(amount);
      const newEquity = currentEquity.plus(amount);

      const updatedAccount = await tx.tradingAccount.update({
        where: { id: tradingAccount.id },
        data: {
          currentBalance: newAccountBalance.toFixed(2),
          equity: newEquity.toFixed(2),
        },
      });

      // 6. Record audit log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'WALLET_TRANSFER_TO_TRADING_ACCOUNT',
          entityType: 'TradingAccount',
          entityId: tradingAccount.id,
          metadata: {
            walletId: wallet.id,
            ledgerId: ledger.id,
            amount: amount.toFixed(2),
            walletBalanceBefore: currentWalletBalance.toFixed(2),
            walletBalanceAfter: newWalletBalance.toFixed(2),
            accountBalanceBefore: currentAccountBalance.toFixed(2),
            accountBalanceAfter: newAccountBalance.toFixed(2),
          },
        },
      });

      return {
        success: true,
        walletBalance: newWalletBalance.toFixed(2),
        tradingAccountId: updatedAccount.id,
        accountNumber: updatedAccount.accountNumber,
        accountBalance: newAccountBalance.toFixed(2),
        accountEquity: newEquity.toFixed(2),
      };
    });
  }

  /**
   * Authorized transfer from Trading Account back to User Wallet
   */
  async transferFromTradingAccount(userId: string, dto: TransferFromTradingDto) {
    const amount = new Decimal(dto.amount);
    if (amount.isNaN() || !amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Transfer amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      const tradingAccount = await tx.tradingAccount.findUnique({
        where: { id: dto.tradingAccountId },
      });

      if (!tradingAccount) {
        throw new NotFoundException('Trading account not found');
      }

      if (tradingAccount.userId !== userId) {
        throw new ForbiddenException('Access denied: You do not own this trading account');
      }

      if (tradingAccount.status !== TradingAccountStatus.ACTIVE) {
        throw new BadRequestException('Cannot transfer from inactive or breached trading account');
      }

      const currentBalance = new Decimal(tradingAccount.currentBalance);
      const currentEquity = new Decimal(tradingAccount.equity);

      // Must have sufficient balance
      if (currentBalance.lessThan(amount) || currentEquity.lessThan(amount)) {
        throw new BadRequestException(
          `Insufficient trading account balance. Available: ${currentBalance.toFixed(2)}, Requested: ${amount.toFixed(2)}`,
        );
      }

      const wallet = await this.getOrCreateWallet(userId);
      const currentWalletBalance = new Decimal(wallet.balance);
      const newWalletBalance = currentWalletBalance.plus(amount);

      const newAccountBalance = currentBalance.minus(amount);
      const newEquity = currentEquity.minus(amount);

      // Debit trading account
      await tx.tradingAccount.update({
        where: { id: tradingAccount.id },
        data: {
          currentBalance: newAccountBalance.toFixed(2),
          equity: newEquity.toFixed(2),
        },
      });

      // Credit wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newWalletBalance.toFixed(2),
        },
      });

      // Create ledger entry
      const ledger = await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: WalletLedgerType.TRANSFER_FROM_TRADING,
          direction: LedgerDirection.CREDIT,
          amount: amount.toFixed(2),
          balanceBefore: currentWalletBalance.toFixed(2),
          balanceAfter: newWalletBalance.toFixed(2),
          currency: wallet.currency,
          referenceType: 'TRADING_ACCOUNT',
          referenceId: tradingAccount.id,
          description: `Transfer from trading account ${tradingAccount.accountNumber}`,
          actorId: userId,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'TRADING_ACCOUNT_TRANSFER_TO_WALLET',
          entityType: 'TradingAccount',
          entityId: tradingAccount.id,
          metadata: {
            amount: amount.toFixed(2),
            walletBalanceAfter: newWalletBalance.toFixed(2),
            accountBalanceAfter: newAccountBalance.toFixed(2),
            ledgerId: ledger.id,
          },
        },
      });

      return {
        success: true,
        walletBalance: newWalletBalance.toFixed(2),
        accountBalance: newAccountBalance.toFixed(2),
      };
    });
  }

  /**
   * Admin auditable manual balance adjustment with mandatory ledger entry & audit trail
   */
  async adminAdjustBalance(adminId: string, dto: AdminAdjustmentDto) {
    const amount = new Decimal(dto.amount);
    if (amount.isNaN() || !amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Adjustment amount must be a positive number');
    }

    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('Mandatory audit reason must be at least 5 characters');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException('Target user not found');
      }

      let wallet = await tx.wallet.findUnique({
        where: { userId: dto.userId },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: dto.userId,
            currency: 'USD',
            balance: new Decimal(0),
            lockedBalance: new Decimal(0),
          },
        });
      }

      const balanceBefore = new Decimal(wallet.balance);
      let balanceAfter: Decimal;

      if (dto.direction === LedgerDirection.CREDIT) {
        balanceAfter = balanceBefore.plus(amount);
      } else {
        if (balanceBefore.lessThan(amount)) {
          throw new BadRequestException(
            `Cannot debit more than available wallet balance. Current: ${balanceBefore.toFixed(2)}, Debit: ${amount.toFixed(2)}`,
          );
        }
        balanceAfter = balanceBefore.minus(amount);
      }

      // Update wallet balance
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter.toFixed(2),
        },
      });

      // Insert mandatory ledger entry
      const ledger = await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: WalletLedgerType.ADMIN_ADJUSTMENT,
          direction: dto.direction,
          amount: amount.toFixed(2),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceAfter.toFixed(2),
          currency: wallet.currency,
          referenceType: 'ADMIN_ADJUSTMENT',
          description: dto.reason.trim(),
          actorId: adminId,
          metadata: {
            adjustedBy: adminId,
            userEmail: user.email,
            reason: dto.reason.trim(),
          },
        },
      });

      // Insert audit log
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'ADMIN_WALLET_ADJUSTMENT',
          entityType: 'Wallet',
          entityId: wallet.id,
          metadata: {
            targetUserId: user.id,
            targetEmail: user.email,
            direction: dto.direction,
            amount: amount.toFixed(2),
            balanceBefore: balanceBefore.toFixed(2),
            balanceAfter: balanceAfter.toFixed(2),
            reason: dto.reason.trim(),
            ledgerId: ledger.id,
          },
        },
      });

      return {
        success: true,
        walletId: wallet.id,
        userId: user.id,
        direction: dto.direction,
        amount: amount.toFixed(2),
        balanceBefore: balanceBefore.toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        ledgerId: ledger.id,
        reason: dto.reason,
      };
    });
  }

  /**
   * User wallet ledger history
   */
  async getUserLedgerHistory(userId: string, query: PaymentsQueryDto) {
    const wallet = await this.getOrCreateWallet(userId);
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      this.prisma.walletLedger.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletLedger.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      wallet: {
        id: wallet.id,
        balance: wallet.balance.toString(),
        currency: wallet.currency,
      },
      data: entries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * User payments history
   */
  async getUserPayments(userId: string, query: PaymentsQueryDto) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              challengePlan: {
                select: { name: true },
              },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: List all payments & deposits
   */
  async getAdminPayments(query: PaymentsQueryDto) {
    const { page = 1, limit = 20, status, provider, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { reference: { contains: search } },
        { providerReference: { contains: search } },
        { user: { email: { contains: search } } },
      ];
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          order: {
            select: {
              id: true,
              challengePlan: {
                select: { name: true },
              },
            },
          },
          wallet: {
            select: {
              id: true,
              balance: true,
              currency: true,
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
