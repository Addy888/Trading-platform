import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminKYCService {
  constructor(private prisma: PrismaService) {}

  async getKYCSubmissions(
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
        { fullName: { contains: search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
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

    const [submissions, total] = await Promise.all([
      this.prisma.kycSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
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
      this.prisma.kycSubmission.count({ where }),
    ]);

    return {
      data: submissions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getKYCSubmissionById(id: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id },
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

    if (!submission) {
      throw new NotFoundException('KYC submission not found');
    }

    return submission;
  }

  async approveKYC(id: string, adminId: string, notes?: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id },
    });

    if (!submission) {
      throw new NotFoundException('KYC submission not found');
    }

    if (submission.status !== 'PENDING') {
      throw new BadRequestException('Only pending KYC submissions can be approved');
    }

    return this.prisma.kycSubmission.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });
  }

  async rejectKYC(id: string, adminId: string, reason: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id },
    });

    if (!submission) {
      throw new NotFoundException('KYC submission not found');
    }

    if (submission.status !== 'PENDING') {
      throw new BadRequestException('Only pending KYC submissions can be rejected');
    }

    return this.prisma.kycSubmission.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      },
    });
  }

  async requestResubmission(id: string, adminId: string, reason: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id },
    });

    if (!submission) {
      throw new NotFoundException('KYC submission not found');
    }

    if (submission.status !== 'PENDING') {
      throw new BadRequestException(
        'Only pending KYC submissions can request resubmission',
      );
    }

    return this.prisma.kycSubmission.update({
      where: { id },
      data: {
        status: 'RESUBMISSION_REQUESTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      },
    });
  }

  async getKYCStats() {
    const [totalSubmissions, pendingSubmissions, approvedSubmissions] =
      await Promise.all([
        this.prisma.kycSubmission.count(),
        this.prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
        this.prisma.kycSubmission.count({ where: { status: 'APPROVED' } }),
      ]);

    return {
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
    };
  }
}
