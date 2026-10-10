import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

/**
 * Day 24: KYC Events Service
 * 
 * Handles KYC-related events and notifications.
 * 
 * EVENTS HANDLED:
 * - kyc.submitted - User submitted KYC
 * - kyc.approved - Admin approved KYC
 * - kyc.rejected - Admin rejected KYC
 * - kyc.resubmission_requested - Admin requested resubmission
 * 
 * NOTIFICATION RULES:
 * - User notification after KYC status change
 * - Admin notification when KYC submitted
 * - Notification failure does NOT roll back state
 * - No sensitive document data in notifications
 * 
 * Day 24 Implementation - Trading Risk Engine
 */
@Injectable()
export class KycEventsService {
  private readonly logger = new Logger(KycEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle KYC submitted event
   * 
   * Sends confirmation to user and alerts admin.
   * 
   * @param payload Event payload
   */
  @OnEvent('kyc.submitted')
  async handleKycSubmitted(payload: {
    kycId: string;
    userId: string;
    userEmail: string;
    userName: string;
  }) {
    try {
      const { kycId, userId, userEmail, userName } = payload;

      // Create user notification
      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM_ALERT,
          title: 'KYC Submitted',
          message: 'Your identity verification documents have been submitted successfully. ' +
                   'Our team will review them shortly. You will be notified once the review is complete.',
          metadata: {
            kycId,
            status: 'PENDING',
          },
        },
      });

      // Create admin notifications
      await this.createAdminNotifications({
        title: 'New KYC Submission',
        message: `${userName} (${userEmail}) has submitted KYC documents for review.`,
        metadata: {
          kycId,
          userId,
          userEmail,
          userName,
          action: 'REVIEW_REQUIRED',
        },
      });

      this.logger.log(`KYC submitted notification sent for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC submitted notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - notification failure should not crash
    }
  }

  /**
   * Handle KYC approved event
   * 
   * Notifies user that KYC is approved and they can request payouts.
   * 
   * @param payload Event payload
   */
  @OnEvent('kyc.approved')
  async handleKycApproved(payload: {
    kycId: string;
    userId: string;
    reviewedBy: string;
    reviewNotes?: string;
  }) {
    try {
      const { kycId, userId, reviewNotes } = payload;

      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found for KYC approval notification`);
        return;
      }

      // Create user notification
      const message = reviewNotes
        ? `Your identity verification has been approved. ${reviewNotes} You can now request payouts.`
        : 'Your identity verification has been approved. You can now request payouts.';

      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM_ALERT,
          title: 'KYC Approved',
          message,
          metadata: {
            kycId,
            status: 'APPROVED',
            reviewNotes,
          },
        },
      });

      this.logger.log(`KYC approved notification sent to user ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC approved notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Handle KYC rejected event
   * 
   * Notifies user that KYC was rejected with reason.
   * 
   * @param payload Event payload
   */
  @OnEvent('kyc.rejected')
  async handleKycRejected(payload: {
    kycId: string;
    userId: string;
    reviewedBy: string;
    reviewNotes: string;
  }) {
    try {
      const { kycId, userId, reviewNotes } = payload;

      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found for KYC rejection notification`);
        return;
      }

      // Create user notification
      const message = `Your identity verification was rejected. Reason: ${reviewNotes}. ` +
                     'Please review the requirements and resubmit your documents.';

      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM_ALERT,
          title: 'KYC Rejected',
          message,
          metadata: {
            kycId,
            status: 'REJECTED',
            reviewNotes,
          },
        },
      });

      this.logger.log(`KYC rejected notification sent to user ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC rejected notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Handle KYC resubmission requested event
   * 
   * Notifies user that additional information is needed.
   * 
   * @param payload Event payload
   */
  @OnEvent('kyc.resubmission_requested')
  async handleKycResubmissionRequested(payload: {
    kycId: string;
    userId: string;
    reviewedBy: string;
    reviewNotes: string;
  }) {
    try {
      const { kycId, userId, reviewNotes } = payload;

      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found for KYC resubmission notification`);
        return;
      }

      // Create user notification
      const message = `Additional information required for identity verification. ${reviewNotes}. ` +
                     'Please update and resubmit your documents.';

      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM_ALERT,
          title: 'KYC Resubmission Required',
          message,
          metadata: {
            kycId,
            status: 'RESUBMISSION_REQUESTED',
            reviewNotes,
          },
        },
      });

      this.logger.log(`KYC resubmission notification sent to user ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC resubmission notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Handle KYC resubmitted event
   * 
   * Notifies admins that user resubmitted KYC.
   * 
   * @param payload Event payload
   */
  @OnEvent('kyc.resubmitted')
  async handleKycResubmitted(payload: {
    kycId: string;
    userId: string;
  }) {
    try {
      const { kycId, userId } = payload;

      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found for KYC resubmission admin notification`);
        return;
      }

      // Create admin notifications
      await this.createAdminNotifications({
        title: 'KYC Resubmitted',
        message: `${user.firstName} ${user.lastName} (${user.email}) has resubmitted KYC documents for review.`,
        metadata: {
          kycId,
          userId,
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          action: 'REVIEW_REQUIRED',
        },
      });

      this.logger.log(`KYC resubmitted admin notification sent for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC resubmitted admin notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Create admin notifications
   * 
   * Sends notification to all admin users.
   * 
   * @param notification Notification data
   */
  private async createAdminNotifications(notification: {
    title: string;
    message: string;
    metadata?: any;
  }): Promise<void> {
    // Find admin users
    const admins = await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
      },
      select: {
        id: true,
      },
    });

    if (admins.length === 0) {
      this.logger.warn('No admin users found for KYC notification');
      return;
    }

    // Create notification for each admin
    for (const admin of admins) {
      await this.prisma.notification.create({
        data: {
          userId: admin.id,
          type: NotificationType.ADMIN_ALERT,
          title: notification.title,
          message: notification.message,
          metadata: notification.metadata,
        },
      });
    }
  }
}
