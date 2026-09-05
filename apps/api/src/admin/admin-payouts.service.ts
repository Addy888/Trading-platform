import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminPayoutsService {
  constructor(private prisma: PrismaService) {}

  async getPayouts(
    page: number,
    limit: number,
    search?: string,
    status?: string,
    userId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        {
          user: {
            email: { contains: search, mode: 'insensitive' },
          },
        },
        {
          tradingAccount: {
            accountNumber: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (userId) {
      where.userId = userId;
    }

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { requestedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          tradingAccount: {
            select: {
              id: true,
              accountNumber: true,
              challengePlan: {
                select: {
                  name: true,
                },
              },
            },
          },
          reviewer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data: payouts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPayoutById(id: string) {
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
        tradingAccount: {
          include: {
            challengePlan: true,
          },
        },
        reviewer: {
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

    return payout;
  }

  async approvePayout(id: string, adminId: string, notes?: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status !== 'PENDING') {
      throw new BadRequestException('Only pending payouts can be approved');
    }

    return this.prisma.payout.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        notes: notes || payout.notes,
      },
    });
  }

  async rejectPayout(id: string, adminId: string, reason: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status !== 'PENDING') {
      throw new BadRequestException('Only pending payouts can be rejected');
    }

    return this.prisma.payout.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        notes: reason,
      },
    });
  }

  async markPayoutPaid(id: string, adminId: string, reference: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status !== 'APPROVED') {
      throw new BadRequestException('Only approved payouts can be marked as paid');
    }

    return this.prisma.payout.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        reference,
        completedAt: new Date(),
      },
    });
  }

  async getPayoutStats() {
    const [
      totalPayouts,
      pendingPayouts,
      completedPayouts,
      totalAmount,
      completedAmount,
    ] = await Promise.all([
      this.prisma.payout.count(),
      this.prisma.payout.count({ where: { status: 'PENDING' } }),
      this.prisma.payout.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payout.aggregate({
        _sum: { amount: true },
      }),
      this.prisma.payout.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalPayouts,
      pendingPayouts,
      completedPayouts,
      totalAmount: totalAmount._sum.amount || '0',
      completedAmount: completedAmount._sum.amount || '0',
    };
  }
}
