import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { SimulationPaymentProvider } from './providers/simulation.provider';
import { StripePaymentProvider } from './providers/stripe.provider';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatusExtended,
  WalletLedgerType,
  LedgerDirection,
  TradingAccountStatus,
} from '@prisma/client';
import Decimal from 'decimal.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let simulationProvider: SimulationPaymentProvider;
  let providerFactory: PaymentProviderFactory;

  const mockUserId = 'user-uuid-123';
  const mockWalletId = 'wallet-uuid-456';
  const mockPaymentId = 'payment-uuid-789';
  const mockTradingAccountId = 'account-uuid-999';

  const mockWallet = {
    id: mockWalletId,
    userId: mockUserId,
    currency: 'USD',
    balance: new Decimal('100.00'),
    lockedBalance: new Decimal('0.00'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPendingPayment = {
    id: mockPaymentId,
    userId: mockUserId,
    walletId: mockWalletId,
    amount: new Decimal('50.00'),
    currency: 'USD',
    status: PaymentStatusExtended.PENDING,
    provider: 'SIMULATION',
    reference: 'DEP-12345-ABC',
    providerReference: 'SIM-999-XYZ',
    createdAt: new Date(),
    updatedAt: new Date(),
    wallet: mockWallet,
    user: { id: mockUserId, email: 'test@tradeing.local' },
  };

  beforeEach(async () => {
    simulationProvider = new SimulationPaymentProvider();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        SimulationPaymentProvider,
        StripePaymentProvider,
        PaymentProviderFactory,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
            wallet: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            payment: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            walletLedger: {
              create: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            tradingAccount: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
            $transaction: jest.fn((callback: any) => callback(prisma)),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    providerFactory = module.get<PaymentProviderFactory>(PaymentProviderFactory);
  });

  describe('Wallet Retrieval & Initialization', () => {
    it('should return existing wallet', async () => {
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(mockWallet as any);

      const result = await service.getOrCreateWallet(mockUserId);
      expect(result).toBeDefined();
      expect(result.id).toBe(mockWalletId);
    });

    it('should create new wallet if user does not have one', async () => {
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.wallet, 'create').mockResolvedValue(mockWallet as any);

      const result = await service.getOrCreateWallet(mockUserId);
      expect(prisma.wallet.create).toHaveBeenCalled();
      expect(result.id).toBe(mockWalletId);
    });
  });

  describe('Deposit Initiation', () => {
    it('should initiate checkout deposit with positive decimal amount', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUserId,
        email: 'user@test.com',
      } as any);
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(mockWallet as any);
      jest.spyOn(prisma.payment, 'create').mockResolvedValue(mockPendingPayment as any);
      jest.spyOn(prisma.payment, 'update').mockResolvedValue({
        ...mockPendingPayment,
        providerReference: 'SIM-999-XYZ',
      } as any);

      const result = await service.initiateDeposit(mockUserId, {
        amount: '50.00',
        currency: 'USD',
      });

      expect(result).toBeDefined();
      expect(result.amount).toBe('50.00');
      expect(result.status).toBe(PaymentStatusExtended.PENDING);
      expect(result.checkoutUrl).toBeDefined();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PAYMENT_INITIATED' }),
        }),
      );
    });

    it('should reject deposit amount less than minimum (5.00)', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUserId,
        email: 'user@test.com',
      } as any);

      await expect(
        service.initiateDeposit(mockUserId, {
          amount: '4.00',
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-positive or invalid deposit amounts', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUserId,
        email: 'user@test.com',
      } as any);

      await expect(
        service.initiateDeposit(mockUserId, {
          amount: '-10.00',
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.initiateDeposit(mockUserId, {
          amount: 'abc',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Webhook Processing & Atomic Balance Crediting', () => {
    it('should verify signature and credit user wallet exactly once on success', async () => {
      const { payload, signature } = simulationProvider.generateSignedPayload({
        event: 'payment.succeeded',
        providerReference: 'SIM-999-XYZ',
        internalReference: 'DEP-12345-ABC',
        amount: '50.00',
        currency: 'USD',
      });

      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(mockPendingPayment as any);
      jest.spyOn(prisma.wallet, 'update').mockResolvedValue({
        ...mockWallet,
        balance: new Decimal('150.00'),
      } as any);
      jest.spyOn(prisma.walletLedger, 'create').mockResolvedValue({ id: 'ledger-1' } as any);
      jest.spyOn(prisma.payment, 'update').mockResolvedValue({
        ...mockPendingPayment,
        status: PaymentStatusExtended.SUCCESS,
      } as any);

      const result = await service.processWebhook('SIMULATION', payload, signature);

      expect(result.success).toBe(true);
      expect(result.status).toBe(PaymentStatusExtended.SUCCESS);
      expect(result.newBalance).toBe('150.00');

      // Verify wallet was updated with exact decimal arithmetic (100.00 + 50.00 = 150.00)
      expect(prisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balance: '150.00' },
        }),
      );

      // Verify ledger record was created
      expect(prisma.walletLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: WalletLedgerType.DEPOSIT,
            direction: LedgerDirection.CREDIT,
            amount: '50.00',
            balanceBefore: '100.00',
            balanceAfter: '150.00',
          }),
        }),
      );
    });

    it('should reject webhook with invalid signature', async () => {
      const { payload } = simulationProvider.generateSignedPayload({
        event: 'payment.succeeded',
        providerReference: 'SIM-999-XYZ',
      });

      const badSignature = 't=1697000000,v1=wrong_invalid_hex_signature';

      await expect(
        service.processWebhook('SIMULATION', payload, badSignature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should prevent replay attacks if webhook timestamp is expired', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const { payload, signature } = simulationProvider.generateSignedPayload(
        {
          event: 'payment.succeeded',
          providerReference: 'SIM-999-XYZ',
        },
        undefined,
        oldTimestamp,
      );

      await expect(
        service.processWebhook('SIMULATION', payload, signature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should NOT credit wallet balance on duplicate webhook (idempotency)', async () => {
      const { payload, signature } = simulationProvider.generateSignedPayload({
        event: 'payment.succeeded',
        providerReference: 'SIM-999-XYZ',
        amount: '50.00',
        currency: 'USD',
      });

      // Payment already completed
      const alreadyCompletedPayment = {
        ...mockPendingPayment,
        status: PaymentStatusExtended.SUCCESS,
      };

      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(alreadyCompletedPayment as any);

      const result = await service.processWebhook('SIMULATION', payload, signature);

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);

      // Crucial: wallet.update and ledger.create must NOT have been called!
      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.walletLedger.create).not.toHaveBeenCalled();
    });

    it('should reject payment if reported amount does not match expected amount', async () => {
      const { payload, signature } = simulationProvider.generateSignedPayload({
        event: 'payment.succeeded',
        providerReference: 'SIM-999-XYZ',
        amount: '10.00', // Expected is 50.00!
        currency: 'USD',
      });

      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(mockPendingPayment as any);

      await expect(
        service.processWebhook('SIMULATION', payload, signature),
      ).rejects.toThrow(BadRequestException);

      // Verify wallet was NOT credited
      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });

    it('should reject payment if reported currency does not match', async () => {
      const { payload, signature } = simulationProvider.generateSignedPayload({
        event: 'payment.succeeded',
        providerReference: 'SIM-999-XYZ',
        amount: '50.00',
        currency: 'EUR', // Expected is USD
      });

      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(mockPendingPayment as any);

      await expect(
        service.processWebhook('SIMULATION', payload, signature),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });

    it('should NEVER increase balance when payment fails', async () => {
      const { payload, signature } = simulationProvider.generateSignedPayload({
        event: 'payment.failed',
        providerReference: 'SIM-999-XYZ',
      });

      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(mockPendingPayment as any);
      jest.spyOn(prisma.payment, 'update').mockResolvedValue({
        ...mockPendingPayment,
        status: PaymentStatusExtended.FAILED,
      } as any);

      const result = await service.processWebhook('SIMULATION', payload, signature);

      expect(result.status).toBe(PaymentStatusExtended.FAILED);
      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.walletLedger.create).not.toHaveBeenCalled();
    });
  });

  describe('Wallet to Trading Account Transfer (Separation of Funds)', () => {
    const mockTradingAccount = {
      id: mockTradingAccountId,
      userId: mockUserId,
      accountNumber: 'TRD-2026-000001',
      status: TradingAccountStatus.ACTIVE,
      currentBalance: new Decimal('10000.00'),
      equity: new Decimal('10000.00'),
    };

    it('should atomically transfer wallet funds to trading account with ledger record', async () => {
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(mockWallet as any);
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockTradingAccount as any);
      jest.spyOn(prisma.wallet, 'update').mockResolvedValue({
        ...mockWallet,
        balance: new Decimal('60.00'),
      } as any);
      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({
        ...mockTradingAccount,
        currentBalance: new Decimal('10040.00'),
        equity: new Decimal('10040.00'),
      } as any);
      jest.spyOn(prisma.walletLedger, 'create').mockResolvedValue({ id: 'ledger-transfer' } as any);

      const result = await service.transferToTradingAccount(mockUserId, {
        tradingAccountId: mockTradingAccountId,
        amount: '40.00',
      });

      expect(result.success).toBe(true);
      expect(result.walletBalance).toBe('60.00');
      expect(result.accountBalance).toBe('10040.00');

      // Verify wallet debit ledger
      expect(prisma.walletLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: WalletLedgerType.TRANSFER_TO_TRADING,
            direction: LedgerDirection.DEBIT,
            amount: '40.00',
            balanceBefore: '100.00',
            balanceAfter: '60.00',
          }),
        }),
      );
    });

    it('should reject transfer if wallet balance is insufficient', async () => {
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(mockWallet as any); // Balance is 100

      await expect(
        service.transferToTradingAccount(mockUserId, {
          tradingAccountId: mockTradingAccountId,
          amount: '150.00', // Requesting 150
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transfer to an account not owned by user', async () => {
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(mockWallet as any);
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        ...mockTradingAccount,
        userId: 'other-user-uuid',
      } as any);

      await expect(
        service.transferToTradingAccount(mockUserId, {
          tradingAccountId: mockTradingAccountId,
          amount: '10.00',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject transfer to a breached or inactive account', async () => {
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(mockWallet as any);
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue({
        ...mockTradingAccount,
        status: TradingAccountStatus.BREACHED,
      } as any);

      await expect(
        service.transferToTradingAccount(mockUserId, {
          tradingAccountId: mockTradingAccountId,
          amount: '10.00',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Admin Auditable Balance Adjustment', () => {
    it('should credit balance with mandatory ledger entry and audit log', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUserId,
        email: 'user@test.com',
      } as any);
      jest.spyOn(prisma.wallet, 'findUnique').mockResolvedValue(mockWallet as any);
      jest.spyOn(prisma.wallet, 'update').mockResolvedValue({
        ...mockWallet,
        balance: new Decimal('125.00'),
      } as any);
      jest.spyOn(prisma.walletLedger, 'create').mockResolvedValue({ id: 'adj-1' } as any);

      const result = await service.adminAdjustBalance('admin-123', {
        userId: mockUserId,
        amount: '25.00',
        direction: LedgerDirection.CREDIT,
        reason: 'Refund for platform downtime compensation',
      });

      expect(result.success).toBe(true);
      expect(result.balanceAfter).toBe('125.00');

      expect(prisma.walletLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: WalletLedgerType.ADMIN_ADJUSTMENT,
            direction: LedgerDirection.CREDIT,
            amount: '25.00',
            description: 'Refund for platform downtime compensation',
          }),
        }),
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_WALLET_ADJUSTMENT',
          }),
        }),
      );
    });

    it('should reject admin adjustment without sufficient reason', async () => {
      await expect(
        service.adminAdjustBalance('admin-123', {
          userId: mockUserId,
          amount: '25.00',
          direction: LedgerDirection.CREDIT,
          reason: 'abc', // Less than 5 characters
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
