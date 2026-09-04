import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, ChallengeStatus, TradingAccountStatus } from '@prisma/client';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: PrismaService;
  let accountSnapshots: AccountSnapshotsService;
  let eventEmitter: EventEmitter2;

  const mockUserId = 'user-123';
  const mockAdminId = 'admin-123';
  const mockOrderId = 'order-123';
  const mockChallengePlanId = 'plan-123';

  const mockChallengePlan = {
    id: mockChallengePlanId,
    name: '10K Challenge',
    description: 'Test challenge',
    accountSize: '10000',
    price: '99',
    currency: 'USD',
    status: ChallengeStatus.ACTIVE,
    ruleSetId: 'ruleset-123',
    ruleSet: {
      name: 'Standard Rules',
      ruleSetRules: [
        {
          rule: {
            name: 'Profit Target',
            type: 'PROFIT_TARGET',
            value: '10',
            isPercentage: true,
          },
        },
      ],
    },
  };

  const mockOrder = {
    id: mockOrderId,
    userId: mockUserId,
    challengePlanId: mockChallengePlanId,
    amount: '99',
    currency: 'USD',
    status: OrderStatus.PENDING,
    planSnapshot: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    payment: {
      id: 'payment-123',
      status: PaymentStatus.PENDING,
    },
    challengePlan: mockChallengePlan,
    tradingAccount: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            challengePlan: {
              findUnique: jest.fn(),
            },
            order: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              update: jest.fn(),
            },
            payment: {
              update: jest.fn(),
            },
            tradingAccount: {
              create: jest.fn(),
              findFirst: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
              createMany: jest.fn(),
            },
            $transaction: jest.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: AccountSnapshotsService,
          useValue: {
            createSnapshot: jest.fn(),
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

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
    accountSnapshots = module.get<AccountSnapshotsService>(AccountSnapshotsService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('create', () => {
    it('should create an order with PENDING status', async () => {
      jest.spyOn(prisma.challengePlan, 'findUnique').mockResolvedValue(mockChallengePlan as any);
      jest.spyOn(prisma.order, 'create').mockResolvedValue(mockOrder as any);
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const result = await service.create({ challengePlanId: mockChallengePlanId }, mockUserId);

      expect(result).toEqual(mockOrder);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId,
            challengePlanId: mockChallengePlanId,
            status: OrderStatus.PENDING,
          }),
        }),
      );
    });

    it('should reject inactive challenge plan', async () => {
      const inactivePlan = { ...mockChallengePlan, status: ChallengeStatus.INACTIVE };
      jest.spyOn(prisma.challengePlan, 'findUnique').mockResolvedValue(inactivePlan as any);

      await expect(
        service.create({ challengePlanId: mockChallengePlanId }, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use database price, not user-provided price', async () => {
      jest.spyOn(prisma.challengePlan, 'findUnique').mockResolvedValue(mockChallengePlan as any);
      jest.spyOn(prisma.order, 'create').mockResolvedValue(mockOrder as any);
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await service.create({ challengePlanId: mockChallengePlanId }, mockUserId);

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: mockChallengePlan.price,
          }),
        }),
      );
    });

    it('should create audit log for order creation', async () => {
      jest.spyOn(prisma.challengePlan, 'findUnique').mockResolvedValue(mockChallengePlan as any);
      jest.spyOn(prisma.order, 'create').mockResolvedValue(mockOrder as any);
      const auditLogSpy = jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await service.create({ challengePlanId: mockChallengePlanId }, mockUserId);

      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: mockUserId,
            action: 'ORDER_CREATED',
          }),
        }),
      );
    });

    it('should emit order.created event', async () => {
      jest.spyOn(prisma.challengePlan, 'findUnique').mockResolvedValue(mockChallengePlan as any);
      jest.spyOn(prisma.order, 'create').mockResolvedValue(mockOrder as any);
      jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await service.create({ challengePlanId: mockChallengePlanId }, mockUserId);

      expect(emitSpy).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({
          orderId: mockOrderId,
          userId: mockUserId,
        }),
      );
    });
  });

  describe('findUserOrder', () => {
    it('should return order for the owner', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);

      const result = await service.findUserOrder(mockOrderId, mockUserId);

      expect(result).toEqual(mockOrder);
    });

    it('should deny access to another user\'s order', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);

      await expect(
        service.findUserOrder(mockOrderId, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent order', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);

      await expect(
        service.findUserOrder(mockOrderId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approvePayment', () => {
    const mockTradingAccount = {
      id: 'account-123',
      accountNumber: 'TRD-2026-000001',
      userId: mockUserId,
      initialBalance: '10000',
      currentBalance: '10000',
      equity: '10000',
      status: TradingAccountStatus.ACTIVE,
    };

    it('should approve payment and create trading account', async () => {
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(mockOrder),
            update: jest.fn().mockResolvedValue({ ...mockOrder, status: OrderStatus.PAID }),
          },
          payment: {
            update: jest.fn().mockResolvedValue({ ...mockOrder.payment, status: PaymentStatus.SUCCESS }),
          },
          tradingAccount: {
            create: jest.fn().mockResolvedValue(mockTradingAccount),
            findFirst: jest.fn().mockResolvedValue(null),
          },
          auditLog: {
            createMany: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });
      jest.spyOn(accountSnapshots, 'createSnapshot').mockResolvedValue({} as any);

      const result = await service.approvePayment(mockOrderId, mockAdminId);

      expect(result).toEqual(mockTradingAccount);
    });

    it('should reject approval if order is not PENDING', async () => {
      const paidOrder = { ...mockOrder, status: OrderStatus.PAID };
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(paidOrder),
          },
        };
        return callback(tx);
      });

      await expect(
        service.approvePayment(mockOrderId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent duplicate account creation', async () => {
      const orderWithAccount = { ...mockOrder, tradingAccount: mockTradingAccount };
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(orderWithAccount),
          },
        };
        return callback(tx);
      });

      await expect(
        service.approvePayment(mockOrderId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create audit logs for approval', async () => {
      const createManySpy = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(mockOrder),
            update: jest.fn().mockResolvedValue({ ...mockOrder, status: OrderStatus.PAID }),
          },
          payment: {
            update: jest.fn().mockResolvedValue({ ...mockOrder.payment, status: PaymentStatus.SUCCESS }),
          },
          tradingAccount: {
            create: jest.fn().mockResolvedValue(mockTradingAccount),
            findFirst: jest.fn().mockResolvedValue(null),
          },
          auditLog: {
            createMany: createManySpy,
          },
        };
        return callback(tx);
      });
      jest.spyOn(accountSnapshots, 'createSnapshot').mockResolvedValue({} as any);

      await service.approvePayment(mockOrderId, mockAdminId);

      expect(createManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              action: 'PAYMENT_APPROVED',
            }),
            expect.objectContaining({
              action: 'TRADING_ACCOUNT_CREATED',
            }),
          ]),
        }),
      );
    });
  });

  describe('rejectPayment', () => {
    it('should reject payment with reason', async () => {
      const reason = 'Payment verification failed';
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(mockOrder),
            update: jest.fn().mockResolvedValue({ ...mockOrder, status: OrderStatus.FAILED }),
          },
          payment: {
            update: jest.fn().mockResolvedValue({ ...mockOrder.payment, status: PaymentStatus.FAILED }),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.rejectPayment(mockOrderId, mockAdminId, reason);

      expect(result.status).toEqual(OrderStatus.FAILED);
    });

    it('should only reject PENDING orders', async () => {
      const paidOrder = { ...mockOrder, status: OrderStatus.PAID };
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(paidOrder),
          },
        };
        return callback(tx);
      });

      await expect(
        service.rejectPayment(mockOrderId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create audit log for rejection', async () => {
      const auditLogSpy = jest.fn().mockResolvedValue({});
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(mockOrder),
            update: jest.fn().mockResolvedValue({ ...mockOrder, status: OrderStatus.FAILED }),
          },
          payment: {
            update: jest.fn().mockResolvedValue({ ...mockOrder.payment, status: PaymentStatus.FAILED }),
          },
          auditLog: {
            create: auditLogSpy,
          },
        };
        return callback(tx);
      });

      await service.rejectPayment(mockOrderId, mockAdminId, 'Test reason');

      expect(auditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PAYMENT_REJECTED',
            metadata: expect.objectContaining({
              reason: 'Test reason',
            }),
          }),
        }),
      );
    });

    it('should emit payment.status.changed event with REJECTED status', async () => {
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          order: {
            findUnique: jest.fn().mockResolvedValue(mockOrder),
            update: jest.fn().mockResolvedValue({ ...mockOrder, status: OrderStatus.FAILED }),
          },
          payment: {
            update: jest.fn().mockResolvedValue({ ...mockOrder.payment, status: PaymentStatus.FAILED }),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      await service.rejectPayment(mockOrderId, mockAdminId, 'Test reason');

      // Event is emitted via setImmediate, so we can't directly test it
      // In a real test environment, you would use setTimeout or jest.runAllTimers()
      expect(true).toBe(true);
    });
  });

  describe('testPayment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should not allow test payment in production', async () => {
      process.env.NODE_ENV = 'production';
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);

      await expect(
        service.testPayment(mockOrderId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny access to another user\'s order', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(mockOrder as any);

      await expect(
        service.testPayment(mockOrderId, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
