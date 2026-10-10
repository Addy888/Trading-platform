import { Test, TestingModule } from '@nestjs/testing';
import { KycGateService } from './kyc-gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus } from '@prisma/client';

describe('KycGateService', () => {
  let service: KycGateService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-1',
    email: 'john@example.com',
  };

  const mockKycSubmission = {
    id: 'kyc-1',
    userId: 'user-1',
    status: KycStatus.APPROVED,
    submittedAt: new Date('2024-10-01'),
    reviewedAt: new Date('2024-10-02'),
    reviewNotes: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycGateService,
        {
          provide: PrismaService,
          useValue: {
            kycSubmission: {
              findFirst: jest.fn(),
            },
            tradingAccount: {
              findUnique: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<KycGateService>(KycGateService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkEligibility', () => {
    it('should return not eligible when no KYC submission exists', async () => {
      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(null);

      const result = await service.checkEligibility('user-1');

      expect(result.eligible).toBe(false);
      expect(result.status).toBe('NOT_SUBMITTED');
      expect(result.reason).toContain('KYC verification required');
      expect(result.kycSubmissionId).toBeNull();
      expect(result.requiresKyc).toBe(true);
    });

    it('should return eligible when KYC is approved', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.APPROVED,
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.checkEligibility('user-1');

      expect(result.eligible).toBe(true);
      expect(result.status).toBe('APPROVED');
      expect(result.reason).toBe('KYC verification approved');
      expect(result.kycSubmissionId).toBe('kyc-1');
      expect(result.requiresKyc).toBe(true);
    });

    it('should return not eligible when KYC is pending', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.PENDING,
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.checkEligibility('user-1');

      expect(result.eligible).toBe(false);
      expect(result.status).toBe('PENDING');
      expect(result.reason).toContain('under review');
      expect(result.kycSubmissionId).toBe('kyc-1');
    });

    it('should return not eligible when KYC is rejected', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.REJECTED,
        reviewNotes: 'Document not clear',
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.checkEligibility('user-1');

      expect(result.eligible).toBe(false);
      expect(result.status).toBe('REJECTED');
      expect(result.reason).toContain('rejected');
      expect(result.reason).toContain('Document not clear');
      expect(result.kycSubmissionId).toBe('kyc-1');
    });

    it('should return not eligible when resubmission requested', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.RESUBMISSION_REQUESTED,
        reviewNotes: 'Additional documents needed',
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.checkEligibility('user-1');

      expect(result.eligible).toBe(false);
      expect(result.status).toBe('RESUBMISSION_REQUESTED');
      expect(result.reason).toContain('Additional information required');
      expect(result.reason).toContain('Additional documents needed');
      expect(result.kycSubmissionId).toBe('kyc-1');
    });

    it('should include payout context in evaluation', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.APPROVED,
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.checkEligibility('user-1', {
        tradingAccountId: 'account-1',
        accountNumber: 'ACC-001234',
        requestedAmount: 1000,
      });

      expect(result.eligible).toBe(true);
      expect(result.status).toBe('APPROVED');
    });

    it('should get latest KYC submission (most recent)', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.APPROVED,
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      await service.checkEligibility('user-1');

      expect(prisma.kycSubmission.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });
  });

  describe('verifyAccountOwnership', () => {
    it('should return true when user owns account', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        userId: 'user-1',
      } as any);

      const result = await service.verifyAccountOwnership('user-1', 'account-1');

      expect(result).toBe(true);
    });

    it('should return false when user does not own account', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        userId: 'user-2',
      } as any);

      const result = await service.verifyAccountOwnership('user-1', 'account-1');

      expect(result).toBe(false);
    });

    it('should return false when account not found', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(null);

      const result = await service.verifyAccountOwnership('user-1', 'account-1');

      expect(result).toBe(false);
    });
  });

  describe('hasApprovedKyc', () => {
    it('should return true when user has approved KYC', async () => {
      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue({
        id: 'kyc-1',
      } as any);

      const result = await service.hasApprovedKyc('user-1');

      expect(result).toBe(true);
      expect(prisma.kycSubmission.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: KycStatus.APPROVED,
        },
        select: { id: true },
      });
    });

    it('should return false when user has no approved KYC', async () => {
      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(null);

      const result = await service.hasApprovedKyc('user-1');

      expect(result).toBe(false);
    });
  });

  describe('getKycStatusSummary', () => {
    it('should return summary when KYC exists', async () => {
      const kyc = {
        id: 'kyc-1',
        status: KycStatus.APPROVED,
        fullName: 'John Doe',
        submittedAt: new Date('2024-10-01'),
        reviewedAt: new Date('2024-10-02'),
        reviewNotes: null,
        createdAt: new Date('2024-10-01'),
        updatedAt: new Date('2024-10-02'),
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.getKycStatusSummary('user-1');

      expect(result.hasKyc).toBe(true);
      expect(result.status).toBe(KycStatus.APPROVED);
      expect(result.isApproved).toBe(true);
      expect(result.isPending).toBe(false);
      expect(result.isRejected).toBe(false);
      expect(result.submittedAt).toEqual(kyc.submittedAt);
      expect(result.reviewedAt).toEqual(kyc.reviewedAt);
    });

    it('should return summary when no KYC exists', async () => {
      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(null);

      const result = await service.getKycStatusSummary('user-1');

      expect(result.hasKyc).toBe(false);
      expect(result.status).toBe('NOT_SUBMITTED');
      expect(result.isApproved).toBe(false);
      expect(result.isPending).toBe(false);
      expect(result.isRejected).toBe(false);
      expect(result.submittedAt).toBeNull();
      expect(result.reviewedAt).toBeNull();
    });

    it('should mark as rejected when status is REJECTED', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.REJECTED,
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.getKycStatusSummary('user-1');

      expect(result.isRejected).toBe(true);
      expect(result.isApproved).toBe(false);
    });

    it('should mark as rejected when status is RESUBMISSION_REQUESTED', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.RESUBMISSION_REQUESTED,
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.getKycStatusSummary('user-1');

      expect(result.isRejected).toBe(true);
      expect(result.isApproved).toBe(false);
    });
  });

  describe('recordKycGateCheck', () => {
    it('should create audit log for gate check', async () => {
      const gateResult = {
        eligible: true,
        status: 'APPROVED' as const,
        reason: 'KYC verification approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      };

      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await service.recordKycGateCheck('user-1', gateResult, {
        tradingAccountId: 'account-1',
        accountNumber: 'ACC-001234',
        requestedAmount: 1000,
        action: 'PAYOUT_KYC_VERIFIED',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          action: 'PAYOUT_KYC_VERIFIED',
          entityType: 'KycSubmission',
          entityId: 'kyc-1',
          metadata: {
            eligible: true,
            kycStatus: 'APPROVED',
            reason: 'KYC verification approved',
            tradingAccountId: 'account-1',
            accountNumber: 'ACC-001234',
            requestedAmount: 1000,
          },
        },
      });
    });
  });

  describe('recordPayoutBlocked', () => {
    it('should create audit log for blocked payout', async () => {
      const gateResult = {
        eligible: false,
        status: 'PENDING' as const,
        reason: 'KYC under review',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      };

      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await service.recordPayoutBlocked('user-1', gateResult, {
        tradingAccountId: 'account-1',
        accountNumber: 'ACC-001234',
        requestedAmount: 1000,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          action: 'PAYOUT_BLOCKED_KYC',
          entityType: 'TradingAccount',
          entityId: 'account-1',
          metadata: {
            accountNumber: 'ACC-001234',
            requestedAmount: 1000,
            kycStatus: 'PENDING',
            reason: 'KYC under review',
            kycSubmissionId: 'kyc-1',
          },
        },
      });
    });
  });

  describe('security tests', () => {
    it('should not expose sensitive document URLs in gate result', async () => {
      const kyc = {
        ...mockKycSubmission,
        status: KycStatus.APPROVED,
        documentFrontUrl: 'https://secret.com/doc.jpg',
        documentBackUrl: 'https://secret.com/doc2.jpg',
      };

      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(kyc as any);

      const result = await service.checkEligibility('user-1');

      // Result should not contain document URLs
      expect(JSON.stringify(result)).not.toContain('documentFrontUrl');
      expect(JSON.stringify(result)).not.toContain('documentBackUrl');
      expect(JSON.stringify(result)).not.toContain('secret.com');
    });

    it('should only select safe fields from KYC submission', async () => {
      jest.spyOn(prisma.kycSubmission, 'findFirst').mockResolvedValue(mockKycSubmission as any);

      await service.checkEligibility('user-1');

      expect(prisma.kycSubmission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            status: true,
            submittedAt: true,
            reviewedAt: true,
            reviewNotes: true,
          }),
        }),
      );
    });
  });
});
