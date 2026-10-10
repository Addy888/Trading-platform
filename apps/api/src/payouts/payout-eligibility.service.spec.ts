import { Test, TestingModule } from '@nestjs/testing';
import { PayoutEligibilityService } from './payout-eligibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { KycGateService } from '../kyc/kyc-gate.service';
import { MinTradingDaysService } from '../risk-engine/min-trading-days.service';
import { InactivityService } from '../risk-engine/inactivity.service';
import { ConsistencyService } from '../risk-engine/consistency.service';
import { TradingAccountStatus, PayoutStatus } from '@prisma/client';
import Decimal from 'decimal.js';

describe('PayoutEligibilityService', () => {
  let service: PayoutEligibilityService;
  let prisma: PrismaService;
  let kycGate: KycGateService;
  let minTradingDays: MinTradingDaysService;
  let inactivity: InactivityService;
  let consistency: ConsistencyService;

  const mockAccount = {
    id: 'account-1',
    userId: 'user-1',
    accountNumber: 'ACC-001234',
    status: TradingAccountStatus.PASSED,
    currentBalance: new Decimal(110000),
    equity: new Decimal(115000),
    initialBalance: new Decimal(100000),
    passedAt: new Date('2024-10-01'),
    lastTradeAt: new Date('2024-10-07'),
    timezone: 'America/New_York',
    ruleSnapshot: {
      snapshotVersion: 'v1-001234',
      rules: [
        { type: 'MIN_TRADING_DAYS', value: 5 },
        { type: 'INACTIVITY', value: 30 },
        { type: 'CONSISTENCY', value: 50 },
      ],
    },
    user: {
      id: 'user-1',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutEligibilityService,
        {
          provide: PrismaService,
          useValue: {
            tradingAccount: {
              findUnique: jest.fn(),
            },
            payout: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: KycGateService,
          useValue: {
            checkEligibility: jest.fn(),
          },
        },
        {
          provide: MinTradingDaysService,
          useValue: {
            calculateProgress: jest.fn(),
          },
        },
        {
          provide: InactivityService,
          useValue: {
            evaluateInactivity: jest.fn(),
          },
        },
        {
          provide: ConsistencyService,
          useValue: {
            calculateConsistency: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PayoutEligibilityService>(PayoutEligibilityService);
    prisma = module.get<PrismaService>(PrismaService);
    kycGate = module.get<KycGateService>(KycGateService);
    minTradingDays = module.get<MinTradingDaysService>(MinTradingDaysService);
    inactivity = module.get<InactivityService>(InactivityService);
    consistency = module.get<ConsistencyService>(ConsistencyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluate - Full Eligibility', () => {
    it('should pass all checks for eligible payout', async () => {
      // Setup mocks for all passing checks
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      
      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 5,
        completedDays: 7,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(140),
        tradingDaysMap: new Map(),
        firstTradeDate: new Date('2024-10-01'),
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-10-07'),
        daysSinceLastTrade: 1,
        isInactive: false,
        timezone: 'America/New_York',
        evaluatedAt: new Date(),
      });

      jest.spyOn(consistency, 'calculateConsistency').mockResolvedValue({
        tradingAccountId: 'account-1',
        ruleSnapshotVersion: 'v1-001234',
        totalProfit: new Decimal(15000),
        highestProfitableDay: new Decimal(3000),
        highestProfitableDayDate: new Date('2024-10-05'),
        consistencyPercentage: new Decimal(20),
        requiredThreshold: new Decimal(50),
        passed: true,
        profitableDaysCount: 5,
        totalTradingDays: 7,
        dailyProfits: new Map(),
        evaluatedAt: new Date(),
      });

      jest.spyOn(prisma.payout, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.payout, 'findFirst').mockResolvedValue(null);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(true);
      expect(result.rejectionCode).toBeNull();
      expect(result.checks).toHaveLength(9);
      expect(result.checks.every((check) => check.passed || !check.required)).toBe(true);
    });

    it('should reject if account not found', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(null);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-invalid',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('ACCOUNT_INVALID');
      expect(result.safeMessage).toContain('not found');
    });

    it('should reject if user does not own account', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      const result = await service.evaluate({
        userId: 'user-different',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('ACCOUNT_INVALID');
      expect(result.safeMessage).toContain('do not own');
    });
  });

  describe('Account Status Check', () => {
    it('should pass for PASSED status', async () => {
      const account = { ...mockAccount, status: TradingAccountStatus.PASSED };
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 0,
        completedDays: 0,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(100),
        tradingDaysMap: new Map(),
        firstTradeDate: null,
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      });

      jest.spyOn(consistency, 'calculateConsistency').mockResolvedValue({
        tradingAccountId: 'account-1',
        ruleSnapshotVersion: 'v1',
        totalProfit: new Decimal(15000),
        highestProfitableDay: new Decimal(3000),
        highestProfitableDayDate: new Date(),
        consistencyPercentage: new Decimal(20),
        requiredThreshold: null,
        passed: true,
        profitableDaysCount: 5,
        totalTradingDays: 7,
        dailyProfits: new Map(),
        evaluatedAt: new Date(),
      });

      jest.spyOn(prisma.payout, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.payout, 'findFirst').mockResolvedValue(null);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      const statusCheck = result.checks.find((c) => c.checkName === 'ACCOUNT_STATUS');
      expect(statusCheck?.passed).toBe(true);
    });

    it('should reject BREACHED status', async () => {
      const account = {
        ...mockAccount,
        status: TradingAccountStatus.BREACHED,
        breachedAt: new Date('2024-10-05'),
        breachReason: 'Daily loss limit exceeded',
      };
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      const breachCheck = result.checks.find((c) => c.checkName === 'NOT_BREACHED');
      expect(breachCheck?.passed).toBe(false);
    });

    it('should reject PENDING status', async () => {
      const account = { ...mockAccount, status: TradingAccountStatus.PENDING };
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('ACCOUNT_STATUS_INVALID');
    });
  });

  describe('KYC Gate Check', () => {
    it('should reject if KYC not approved', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: false,
        status: 'PENDING',
        reason: 'KYC under review',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('KYC_NOT_VERIFIED');
      expect(result.safeMessage).toContain('KYC');
    });
  });

  describe('Minimum Trading Days Check', () => {
    it('should reject if minimum days not met', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 5,
        completedDays: 3,
        remainingDays: 2,
        reached: false,
        progressPercentage: new Decimal(60),
        tradingDaysMap: new Map(),
        firstTradeDate: new Date('2024-10-01'),
      });

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('MIN_TRADING_DAYS_NOT_MET');
    });

    it('should pass if no minimum days configured', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 0,
        completedDays: 0,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(100),
        tradingDaysMap: new Map(),
        firstTradeDate: null,
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      });

      jest.spyOn(consistency, 'calculateConsistency').mockResolvedValue({
        tradingAccountId: 'account-1',
        ruleSnapshotVersion: 'v1',
        totalProfit: new Decimal(15000),
        highestProfitableDay: new Decimal(3000),
        highestProfitableDayDate: new Date(),
        consistencyPercentage: new Decimal(20),
        requiredThreshold: null,
        passed: true,
        profitableDaysCount: 5,
        totalTradingDays: 7,
        dailyProfits: new Map(),
        evaluatedAt: new Date(),
      });

      jest.spyOn(prisma.payout, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.payout, 'findFirst').mockResolvedValue(null);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      const minDaysCheck = result.checks.find((c) => c.checkName === 'MINIMUM_TRADING_DAYS');
      expect(minDaysCheck?.passed).toBe(true);
      expect(minDaysCheck?.required).toBe(false);
    });
  });

  describe('Inactivity Check', () => {
    it('should reject if account is inactive', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 5,
        completedDays: 7,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(140),
        tradingDaysMap: new Map(),
        firstTradeDate: new Date('2024-09-01'),
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: true,
        inactivityDays: 30,
        lastTradeAt: new Date('2024-08-01'),
        daysSinceLastTrade: 65,
        isInactive: true,
        timezone: 'America/New_York',
        evaluatedAt: new Date(),
      });

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('Profit Check', () => {
    it('should reject if no profit', async () => {
      const account = {
        ...mockAccount,
        equity: new Decimal(100000), // Same as initial = no profit
      };
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 0,
        completedDays: 0,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(100),
        tradingDaysMap: new Map(),
        firstTradeDate: null,
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      });

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('INSUFFICIENT_PROFIT');
    });
  });

  describe('Payout Amount Validation', () => {
    it('should reject if amount exceeds available profit', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 0,
        completedDays: 0,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(100),
        tradingDaysMap: new Map(),
        firstTradeDate: null,
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      });

      jest.spyOn(consistency, 'calculateConsistency').mockResolvedValue({
        tradingAccountId: 'account-1',
        ruleSnapshotVersion: 'v1',
        totalProfit: new Decimal(15000),
        highestProfitableDay: new Decimal(3000),
        highestProfitableDayDate: new Date(),
        consistencyPercentage: new Decimal(20),
        requiredThreshold: null,
        passed: true,
        profitableDaysCount: 5,
        totalTradingDays: 7,
        dailyProfits: new Map(),
        evaluatedAt: new Date(),
      });

      jest.spyOn(prisma.payout, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.payout, 'findFirst').mockResolvedValue(null);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 20000, // Exceeds profit of 15000
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('INVALID_PAYOUT_AMOUNT');
      expect(result.safeMessage).toContain('exceeds available profit');
    });

    it('should account for pending payouts', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 0,
        completedDays: 0,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(100),
        tradingDaysMap: new Map(),
        firstTradeDate: null,
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      });

      jest.spyOn(consistency, 'calculateConsistency').mockResolvedValue({
        tradingAccountId: 'account-1',
        ruleSnapshotVersion: 'v1',
        totalProfit: new Decimal(15000),
        highestProfitableDay: new Decimal(3000),
        highestProfitableDayDate: new Date(),
        consistencyPercentage: new Decimal(20),
        requiredThreshold: null,
        passed: true,
        profitableDaysCount: 5,
        totalTradingDays: 7,
        dailyProfits: new Map(),
        evaluatedAt: new Date(),
      });

      // Mock pending payout of 8000
      jest.spyOn(prisma.payout, 'findMany').mockResolvedValue([
        { amount: new Decimal(8000) },
      ] as any);
      
      jest.spyOn(prisma.payout, 'findFirst').mockResolvedValue(null);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000, // Would exceed remaining 7000
      });

      expect(result.eligible).toBe(false);
      expect(result.amountValidation?.pendingPayouts.toString()).toBe('8000');
    });
  });

  describe('Concurrent Payout Check', () => {
    it('should reject if pending payout exists', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);

      jest.spyOn(kycGate, 'checkEligibility').mockResolvedValue({
        eligible: true,
        status: 'APPROVED',
        reason: 'KYC approved',
        kycSubmissionId: 'kyc-1',
        requiresKyc: true,
      });

      jest.spyOn(minTradingDays, 'calculateProgress').mockResolvedValue({
        requiredDays: 0,
        completedDays: 0,
        remainingDays: 0,
        reached: true,
        progressPercentage: new Decimal(100),
        tradingDaysMap: new Map(),
        firstTradeDate: null,
      });

      jest.spyOn(inactivity, 'evaluateInactivity').mockResolvedValue({
        accountId: 'account-1',
        inactivityEnabled: false,
        inactivityDays: null,
        lastTradeAt: null,
        daysSinceLastTrade: null,
        isInactive: false,
        timezone: 'UTC',
        evaluatedAt: new Date(),
      });

      jest.spyOn(consistency, 'calculateConsistency').mockResolvedValue({
        tradingAccountId: 'account-1',
        ruleSnapshotVersion: 'v1',
        totalProfit: new Decimal(15000),
        highestProfitableDay: new Decimal(3000),
        highestProfitableDayDate: new Date(),
        consistencyPercentage: new Decimal(20),
        requiredThreshold: null,
        passed: true,
        profitableDaysCount: 5,
        totalTradingDays: 7,
        dailyProfits: new Map(),
        evaluatedAt: new Date(),
      });

      jest.spyOn(prisma.payout, 'findMany').mockResolvedValue([]);
      
      jest.spyOn(prisma.payout, 'findFirst').mockResolvedValue({
        id: 'payout-pending',
        status: PayoutStatus.PENDING,
      } as any);

      const result = await service.evaluate({
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      });

      expect(result.eligible).toBe(false);
      expect(result.rejectionCode).toBe('PENDING_PAYOUT_EXISTS');
    });
  });

  describe('Audit Logging', () => {
    it('should record eligibility evaluation in audit log', async () => {
      const mockResult = {
        eligible: true,
        rejectionCode: null,
        safeMessage: 'Eligible',
        checks: [],
        amountValidation: null,
        evaluatedAt: new Date(),
        ruleSnapshotVersion: 'v1',
        accountSnapshot: {
          accountId: 'account-1',
          accountNumber: 'ACC-001234',
          status: TradingAccountStatus.PASSED,
          balance: '110000',
          equity: '115000',
          profit: '15000.00',
        },
      };

      const context = {
        userId: 'user-1',
        tradingAccountId: 'account-1',
        requestedAmount: 10000,
      };

      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await service.recordEligibilityEvaluation('user-1', mockResult, context);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'user-1',
          action: 'PAYOUT_ELIGIBILITY_PASSED',
          entityType: 'TradingAccount',
          entityId: 'account-1',
        }),
      });
    });
  });
});
