import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus } from '@prisma/client';

/**
 * KYC Gate Result
 */
export interface KycGateResult {
  eligible: boolean;
  status: 'APPROVED' | 'NOT_SUBMITTED' | 'PENDING' | 'REJECTED' | 'RESUBMISSION_REQUESTED';
  reason: string;
  kycSubmissionId: string | null;
  requiresKyc: boolean;
}

/**
 * Day 24: KYC Gate Service
 * 
 * Backend-authoritative KYC verification gate for payout processing.
 * 
 * KEY PRINCIPLES:
 * - KYC required before EVERY payout (not just first)
 * - Backend-only verification (frontend cannot bypass)
 * - Uses authoritative KYC status from database
 * - Immutable audit trail
 * - User cannot self-verify
 * 
 * KYC GATE LOGIC:
 * - APPROVED → Eligible for payout
 * - NOT_SUBMITTED → Not eligible (must submit KYC)
 * - PENDING → Not eligible (under review)
 * - REJECTED → Not eligible (must resubmit)
 * - RESUBMISSION_REQUESTED → Not eligible (must resubmit)
 * 
 * SECURITY:
 * - User can only check their own KYC
 * - Admin approval required for verification
 * - Cannot bypass through API manipulation
 * - JWT-derived user identity
 * 
 * Day 24 Implementation - Trading Risk Engine
 */
@Injectable()
export class KycGateService {
  private readonly logger = new Logger(KycGateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check KYC eligibility for payout
   * 
   * Verifies that user has approved KYC before allowing payout.
   * Called for EVERY payout request (not just first).
   * 
   * @param userId User ID (from authenticated JWT)
   * @param payoutContext Optional context for audit logging
   * @returns KYC gate result
   */
  async checkEligibility(
    userId: string,
    payoutContext?: {
      tradingAccountId?: string;
      accountNumber?: string;
      requestedAmount?: number;
    },
  ): Promise<KycGateResult> {
    // Get latest KYC submission for user
    const kycSubmission = await this.prisma.kycSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        reviewNotes: true,
      },
    });

    // No KYC submission
    if (!kycSubmission) {
      return {
        eligible: false,
        status: 'NOT_SUBMITTED',
        reason: 'KYC verification required. Please submit your identity documents before requesting a payout.',
        kycSubmissionId: null,
        requiresKyc: true,
      };
    }

    // KYC approved
    if (kycSubmission.status === KycStatus.APPROVED) {
      return {
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC verification approved',
        kycSubmissionId: kycSubmission.id,
        requiresKyc: true,
      };
    }

    // KYC pending review
    if (kycSubmission.status === KycStatus.PENDING) {
      return {
        eligible: false,
        status: 'PENDING',
        reason: 'KYC verification is under review. Please wait for admin approval before requesting a payout.',
        kycSubmissionId: kycSubmission.id,
        requiresKyc: true,
      };
    }

    // KYC rejected
    if (kycSubmission.status === KycStatus.REJECTED) {
      const reviewNotes = kycSubmission.reviewNotes 
        ? ` Reason: ${kycSubmission.reviewNotes}` 
        : '';
      
      return {
        eligible: false,
        status: 'REJECTED',
        reason: `KYC verification was rejected.${reviewNotes} Please resubmit your documents.`,
        kycSubmissionId: kycSubmission.id,
        requiresKyc: true,
      };
    }

    // KYC resubmission requested
    if (kycSubmission.status === KycStatus.RESUBMISSION_REQUESTED) {
      const reviewNotes = kycSubmission.reviewNotes 
        ? ` Reason: ${kycSubmission.reviewNotes}` 
        : '';
      
      return {
        eligible: false,
        status: 'RESUBMISSION_REQUESTED',
        reason: `Additional information required for KYC verification.${reviewNotes} Please resubmit your documents.`,
        kycSubmissionId: kycSubmission.id,
        requiresKyc: true,
      };
    }

    // Unknown status (fallback)
    return {
      eligible: false,
      status: 'NOT_SUBMITTED',
      reason: 'KYC verification status unknown. Please contact support.',
      kycSubmissionId: kycSubmission.id,
      requiresKyc: true,
    };
  }

  /**
   * Verify user owns the trading account
   * 
   * Additional security check to ensure user can only request
   * payouts for their own accounts.
   * 
   * @param userId User ID (from JWT)
   * @param tradingAccountId Trading account ID
   * @returns True if user owns account
   */
  async verifyAccountOwnership(
    userId: string,
    tradingAccountId: string,
  ): Promise<boolean> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      select: { userId: true },
    });

    if (!account) {
      return false;
    }

    return account.userId === userId;
  }

  /**
   * Get user's latest KYC submission
   * 
   * Safe method that only returns metadata (no documents).
   * 
   * @param userId User ID
   * @returns KYC submission metadata or null
   */
  async getLatestKycSubmission(userId: string) {
    return this.prisma.kycSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        fullName: true,
        submittedAt: true,
        reviewedAt: true,
        reviewNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Check if user has approved KYC (fast check)
   * 
   * @param userId User ID
   * @returns True if user has approved KYC
   */
  async hasApprovedKyc(userId: string): Promise<boolean> {
    const kyc = await this.prisma.kycSubmission.findFirst({
      where: {
        userId,
        status: KycStatus.APPROVED,
      },
      select: { id: true },
    });

    return !!kyc;
  }

  /**
   * Get KYC status summary for user
   * 
   * Returns safe summary without sensitive documents.
   * 
   * @param userId User ID
   * @returns KYC status summary
   */
  async getKycStatusSummary(userId: string) {
    const kyc = await this.getLatestKycSubmission(userId);

    if (!kyc) {
      return {
        hasKyc: false,
        status: 'NOT_SUBMITTED' as const,
        isApproved: false,
        isPending: false,
        isRejected: false,
        submittedAt: null,
        reviewedAt: null,
      };
    }

    return {
      hasKyc: true,
      status: kyc.status,
      isApproved: kyc.status === KycStatus.APPROVED,
      isPending: kyc.status === KycStatus.PENDING,
      isRejected: kyc.status === KycStatus.REJECTED || kyc.status === KycStatus.RESUBMISSION_REQUESTED,
      submittedAt: kyc.submittedAt,
      reviewedAt: kyc.reviewedAt,
      reviewNotes: kyc.reviewNotes,
    };
  }

  /**
   * Record KYC gate check in audit log
   * 
   * Creates immutable audit trail of KYC checks.
   * Does NOT include sensitive document data.
   * 
   * @param userId User ID
   * @param gateResult KYC gate result
   * @param context Additional context
   */
  async recordKycGateCheck(
    userId: string,
    gateResult: KycGateResult,
    context?: {
      tradingAccountId?: string;
      accountNumber?: string;
      requestedAmount?: number;
      action?: string;
    },
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: context?.action || 'KYC_GATE_CHECK',
        entityType: 'KycSubmission',
        entityId: gateResult.kycSubmissionId,
        metadata: {
          eligible: gateResult.eligible,
          kycStatus: gateResult.status,
          reason: gateResult.reason,
          tradingAccountId: context?.tradingAccountId,
          accountNumber: context?.accountNumber,
          requestedAmount: context?.requestedAmount,
        },
      },
    });
  }

  /**
   * Record payout blocked by KYC gate
   * 
   * Special audit log for blocked payouts.
   * 
   * @param userId User ID
   * @param gateResult KYC gate result
   * @param context Payout context
   */
  async recordPayoutBlocked(
    userId: string,
    gateResult: KycGateResult,
    context: {
      tradingAccountId: string;
      accountNumber: string;
      requestedAmount: number;
    },
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PAYOUT_BLOCKED_KYC',
        entityType: 'TradingAccount',
        entityId: context.tradingAccountId,
        metadata: {
          accountNumber: context.accountNumber,
          requestedAmount: context.requestedAmount,
          kycStatus: gateResult.status,
          reason: gateResult.reason,
          kycSubmissionId: gateResult.kycSubmissionId,
        },
      },
    });

    this.logger.warn(
      `Payout blocked for user ${userId}, account ${context.accountNumber}: KYC status ${gateResult.status}`,
    );
  }
}
