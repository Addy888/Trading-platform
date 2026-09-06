import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { KycStatus } from '@prisma/client';

@Injectable()
export class KycService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async submitKyc(userId: string, submitKycDto: SubmitKycDto) {
    // Check if user already has a pending or approved KYC
    const existingKyc = await this.prisma.kycSubmission.findFirst({
      where: {
        userId,
        status: {
          in: [KycStatus.PENDING, KycStatus.APPROVED],
        },
      },
    });

    if (existingKyc) {
      if (existingKyc.status === KycStatus.APPROVED) {
        throw new BadRequestException('KYC is already approved');
      }
      throw new BadRequestException(
        'You already have a pending KYC submission',
      );
    }

    // Create KYC submission
    const kyc = await this.prisma.kycSubmission.create({
      data: {
        userId,
        status: KycStatus.PENDING,
        fullName: submitKycDto.fullName,
        dateOfBirth: new Date(submitKycDto.dateOfBirth),
        address: submitKycDto.address,
        city: submitKycDto.city,
        country: submitKycDto.country,
        postalCode: submitKycDto.postalCode,
        documentType: submitKycDto.documentType,
        documentNumber: submitKycDto.documentNumber,
        documentFrontUrl: submitKycDto.documentFrontUrl,
        documentBackUrl: submitKycDto.documentBackUrl,
        selfieUrl: submitKycDto.selfieUrl,
        submittedAt: new Date(),
        metadata: submitKycDto.metadata || {},
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
        action: 'KYC_SUBMITTED',
        entityType: 'KycSubmission',
        entityId: kyc.id,
        metadata: {
          fullName: submitKycDto.fullName,
          documentType: submitKycDto.documentType,
        },
      },
    });

    // Emit event for admin notification
    this.eventEmitter.emit('kyc.submitted', {
      kycId: kyc.id,
      userId,
      userEmail: kyc.user.email,
      userName: `${kyc.user.firstName} ${kyc.user.lastName}`,
    });

    return kyc;
  }

  async getUserKyc(userId: string) {
    const kyc = await this.prisma.kycSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        fullName: true,
        dateOfBirth: true,
        address: true,
        city: true,
        country: true,
        postalCode: true,
        documentType: true,
        documentNumber: true,
        documentFrontUrl: true,
        documentBackUrl: true,
        selfieUrl: true,
        submittedAt: true,
        reviewedAt: true,
        reviewNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return kyc;
  }

  async getKycDetails(id: string, userId: string) {
    const kyc = await this.prisma.kycSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        fullName: true,
        dateOfBirth: true,
        address: true,
        city: true,
        country: true,
        postalCode: true,
        documentType: true,
        documentNumber: true,
        documentFrontUrl: true,
        documentBackUrl: true,
        selfieUrl: true,
        submittedAt: true,
        reviewedAt: true,
        reviewNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!kyc) {
      throw new NotFoundException('KYC submission not found');
    }

    // Verify ownership
    if (kyc.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return kyc;
  }

  async updateKyc(id: string, userId: string, updateKycDto: UpdateKycDto) {
    const existingKyc = await this.prisma.kycSubmission.findUnique({
      where: { id },
    });

    if (!existingKyc) {
      throw new NotFoundException('KYC submission not found');
    }

    // Verify ownership
    if (existingKyc.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Only allow updates if status is REJECTED or RESUBMISSION_REQUESTED
    if (
      existingKyc.status !== KycStatus.REJECTED &&
      existingKyc.status !== KycStatus.RESUBMISSION_REQUESTED
    ) {
      throw new BadRequestException(
        'Can only update rejected or resubmission-requested KYC',
      );
    }

    // Update KYC
    const kyc = await this.prisma.kycSubmission.update({
      where: { id },
      data: {
        status: KycStatus.PENDING,
        fullName: updateKycDto.fullName ?? existingKyc.fullName,
        dateOfBirth: updateKycDto.dateOfBirth
          ? new Date(updateKycDto.dateOfBirth)
          : existingKyc.dateOfBirth,
        address: updateKycDto.address ?? existingKyc.address,
        city: updateKycDto.city ?? existingKyc.city,
        country: updateKycDto.country ?? existingKyc.country,
        postalCode: updateKycDto.postalCode ?? existingKyc.postalCode,
        documentType: updateKycDto.documentType ?? existingKyc.documentType,
        documentNumber:
          updateKycDto.documentNumber ?? existingKyc.documentNumber,
        documentFrontUrl:
          updateKycDto.documentFrontUrl ?? existingKyc.documentFrontUrl,
        documentBackUrl:
          updateKycDto.documentBackUrl ?? existingKyc.documentBackUrl,
        selfieUrl: updateKycDto.selfieUrl ?? existingKyc.selfieUrl,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'KYC_RESUBMITTED',
        entityType: 'KycSubmission',
        entityId: id,
        metadata: {
          previousStatus: existingKyc.status,
          newStatus: KycStatus.PENDING,
        },
      },
    });

    // Emit event
    this.eventEmitter.emit('kyc.resubmitted', {
      kycId: id,
      userId,
    });

    return kyc;
  }
}
