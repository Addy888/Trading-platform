import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { AdminAdjustmentDto } from '../payments/dto/admin-adjustment.dto';
import { PaymentStatusExtended, WalletLedgerType, LedgerDirection } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class AdminPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async getPayments(
    page: number,
    limit: number,
    search?: string,
    status?: string,
    provider?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { reference: { contains: search } },
        { providerReference: { contains: search } },
        {
          user: {
            email: { contains: search },
          },
        },
        {
          order: {
            user: {
              email: { contains: search },
            },
          },
        },
      ];
    }

    if (status) {
      where.status = status as any;
    }

    if (provider) {
      where.provider = provider;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

  async getPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
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
        order: {
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
            tradingAccount: true,
          },
        },
        wallet: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async updatePaymentStatus(id: string, status: string, notes?: string, actorId?: string) {
    const targetStatus = status as PaymentStatusExtended;

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id },
        include: {
          user: true,
          wallet: true,
        },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const previousStatus = payment.status;
      const metadata = (payment.metadata as any) || {};
      if (notes) {
        metadata['adminNotes'] = notes;
        metadata['statusUpdatedAt'] = new Date().toISOString();
        if (actorId) metadata['updatedBy'] = actorId;
      }

      // If transitioning to SUCCESS / COMPLETED and wasn't already credited
      if (
        (targetStatus === PaymentStatusExtended.SUCCESS ||
          targetStatus === PaymentStatusExtended.COMPLETED) &&
        previousStatus !== PaymentStatusExtended.SUCCESS &&
        previousStatus !== PaymentStatusExtended.COMPLETED
      ) {
        const userId = payment.userId || (payment as any).order?.userId;
        let wallet = payment.wallet;
        if (!wallet && userId) {
          wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                userId,
                currency: payment.currency,
                balance: new Decimal(0),
                lockedBalance: new Decimal(0),
              },
            });
          }
        }

        if (wallet) {
          const balanceBefore = new Decimal(wallet.balance);
          const creditAmount = new Decimal(payment.amount);
          const balanceAfter = balanceBefore.plus(creditAmount);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: balanceAfter.toFixed(2) },
          });

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
              providerReference: payment.providerReference,
              description: `Admin approved payment credit: ${notes || 'Approved by administrator'}`,
              metadata: {
                approvedBy: actorId,
                notes,
              },
              actorId,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId,
              action: 'ADMIN_PAYMENT_APPROVED_AND_CREDITED',
              entityType: 'Payment',
              entityId: payment.id,
              metadata: {
                walletId: wallet.id,
                ledgerId: ledger.id,
                amount: creditAmount.toFixed(2),
                balanceBefore: balanceBefore.toFixed(2),
                balanceAfter: balanceAfter.toFixed(2),
                notes,
              },
            },
          });
        }
      } else {
        // Record audit log for non-crediting status changes
        await tx.auditLog.create({
          data: {
            actorId,
            action: `ADMIN_PAYMENT_STATUS_UPDATE_${targetStatus}`,
            entityType: 'Payment',
            entityId: payment.id,
            metadata: {
              previousStatus,
              newStatus: targetStatus,
              notes,
            },
          },
        });
      }

      return tx.payment.update({
        where: { id },
        data: {
          status: targetStatus,
          metadata,
        },
      });
    });
  }

  async adjustBalance(adminId: string, dto: AdminAdjustmentDto) {
    return this.paymentsService.adminAdjustBalance(adminId, dto);
  }

  async getPaymentStats() {
    const [
      totalPayments,
      pendingPayments,
      completedPayments,
      totalAmount,
      completedAmount,
    ] = await Promise.all([
      this.prisma.payment.count(),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.count({
        where: {
          status: {
            in: [PaymentStatusExtended.COMPLETED, PaymentStatusExtended.SUCCESS],
          },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: {
            in: [PaymentStatusExtended.COMPLETED, PaymentStatusExtended.SUCCESS],
          },
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalPayments,
      pendingPayments,
      completedPayments,
      totalAmount: totalAmount._sum.amount?.toString() || '0',
      completedAmount: completedAmount._sum.amount?.toString() || '0',
    };
  }
}
