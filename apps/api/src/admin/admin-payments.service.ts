import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminPaymentsService {
  constructor(private prisma: PrismaService) {}

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
        { id: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        {
          order: {
            user: {
              email: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    if (status) {
      where.status = status;
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
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async updatePaymentStatus(id: string, status: string, notes?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const metadata = (payment.metadata as any) || {};
    if (notes) {
      metadata['adminNotes'] = notes;
      metadata['statusUpdatedAt'] = new Date().toISOString();
    }

    return this.prisma.payment.update({
      where: { id },
      data: {
        status: status as any,
        metadata,
      },
    });
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
      this.prisma.payment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalPayments,
      pendingPayments,
      completedPayments,
      totalAmount: totalAmount._sum.amount || '0',
      completedAmount: completedAmount._sum.amount || '0',
    };
  }
}
