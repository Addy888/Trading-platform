import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { OrderStatus, PaymentStatus, ChallengeStatus, TradingAccountStatus } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private accountSnapshots: AccountSnapshotsService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(createOrderDto: CreateOrderDto, userId: string) {
    // Verify challenge plan exists and is ACTIVE
    const challengePlan = await this.prisma.challengePlan.findUnique({
      where: { id: createOrderDto.challengePlanId },
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
    });

    if (!challengePlan) {
      throw new NotFoundException('Challenge plan not found');
    }

    if (challengePlan.status !== ChallengeStatus.ACTIVE) {
      throw new BadRequestException('Challenge plan is not available for purchase');
    }

    // Create plan snapshot
    const planSnapshot = {
      name: challengePlan.name,
      description: challengePlan.description,
      accountSize: challengePlan.accountSize.toString(),
      price: challengePlan.price.toString(),
      currency: challengePlan.currency,
      ruleSet: {
        name: challengePlan.ruleSet.name,
        rules: challengePlan.ruleSet.ruleSetRules.map((rsr) => ({
          name: rsr.rule.name,
          type: rsr.rule.type,
          value: rsr.rule.value.toString(),
          isPercentage: rsr.rule.isPercentage,
        })),
      },
    };

    // Create order with payment
    const order = await this.prisma.order.create({
      data: {
        userId,
        challengePlanId: challengePlan.id,
        amount: challengePlan.price,
        currency: challengePlan.currency,
        status: OrderStatus.PENDING,
        planSnapshot,
        payment: {
          create: {
            amount: challengePlan.price,
            currency: challengePlan.currency,
            status: PaymentStatus.PENDING,
            provider: 'MANUAL_TEST',
            providerReference: `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          },
        },
      },
      include: {
        payment: true,
        challengePlan: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: order.id,
        metadata: {
          challengePlanId: challengePlan.id,
          amount: order.amount.toString(),
          currency: order.currency,
        },
      },
    });

    // Emit order.created event for notifications
    this.eventEmitter.emit('order.created', {
      orderId: order.id,
      userId,
      challengeName: challengePlan.name,
      amount: order.amount.toString(),
    });

    return order;
  }

  async findUserOrders(userId: string, query: OrdersQueryDto) {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          payment: true,
          challengePlan: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findUserOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        challengePlan: true,
        tradingAccount: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return order;
  }

  async findAllOrders(query: OrdersQueryDto) {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { firstName: { contains: search } } },
        { user: { lastName: { contains: search } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          payment: true,
          challengePlan: true,
          tradingAccount: {
            select: {
              accountNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOrderById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
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
        payment: true,
        challengePlan: true,
        tradingAccount: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async approvePayment(orderId: string, actorId: string) {
    // Use transaction to ensure atomicity
    return this.prisma.$transaction(async (tx) => {
      // Find order with payment
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          payment: true,
          challengePlan: {
            include: {
              ruleSet: true,
            },
          },
          tradingAccount: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('Order is not pending');
      }

      if (!order.payment) {
        throw new BadRequestException('Payment not found for this order');
      }

      // Check if trading account already exists
      if (order.tradingAccount) {
        throw new BadRequestException('Trading account already exists for this order');
      }

      // Update payment status
      await tx.payment.update({
        where: { id: order.payment.id },
        data: { status: PaymentStatus.SUCCESS },
      });

      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID },
      });

      // Generate unique account number
      const accountNumber = await this.generateAccountNumber(tx);

      // Create trading account
      const tradingAccount = await tx.tradingAccount.create({
        data: {
          userId: order.userId,
          challengePlanId: order.challengePlanId,
          orderId: order.id,
          ruleSetId: order.challengePlan.ruleSetId,
          accountNumber,
          initialBalance: order.challengePlan.accountSize,
          currentBalance: order.challengePlan.accountSize,
          equity: order.challengePlan.accountSize,
          status: TradingAccountStatus.ACTIVE,
          startedAt: new Date(),
        },
      });

      // Create initial snapshot
      await this.accountSnapshots.createSnapshot(
        tradingAccount.id,
        new Decimal(tradingAccount.initialBalance),
        new Decimal(tradingAccount.equity),
        new Decimal(0), // No realized PnL yet
        new Decimal(0), // No unrealized PnL yet
        tx,
      );

      // Audit logs
      await tx.auditLog.createMany({
        data: [
          {
            actorId,
            action: 'PAYMENT_APPROVED',
            entityType: 'Payment',
            entityId: order.payment.id,
            metadata: { orderId: order.id },
          },
          {
            actorId,
            action: 'TRADING_ACCOUNT_CREATED',
            entityType: 'TradingAccount',
            entityId: tradingAccount.id,
            metadata: {
              orderId: order.id,
              accountNumber: tradingAccount.accountNumber,
            },
          },
        ],
      });

      // Emit events (after transaction commits)
      setImmediate(() => {
        // Payment completed event
        this.eventEmitter.emit('payment.status.changed', {
          orderId: order.id,
          userId: order.userId,
          status: 'COMPLETED',
          amount: order.amount.toString(),
          previousStatus: 'PENDING',
        });

        // Account created event
        this.eventEmitter.emit('account.created', {
          accountId: tradingAccount.id,
          userId: order.userId,
          accountNumber: tradingAccount.accountNumber,
          challengeName: order.challengePlan.name,
        });
      });

      return tradingAccount;
    });
  }

  async rejectPayment(orderId: string, actorId: string, reason?: string) {
    // Use transaction to ensure atomicity
    return this.prisma.$transaction(async (tx) => {
      // Find order with payment
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          payment: true,
          challengePlan: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('Only pending orders can be rejected');
      }

      if (!order.payment) {
        throw new BadRequestException('Payment not found for this order');
      }

      if (order.payment.status === PaymentStatus.SUCCESS) {
        throw new BadRequestException('Cannot reject completed payment');
      }

      // Update payment status
      await tx.payment.update({
        where: { id: order.payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FAILED },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PAYMENT_REJECTED',
          entityType: 'Payment',
          entityId: order.payment.id,
          metadata: {
            orderId: order.id,
            reason: reason || 'Payment rejected by administrator',
          },
        },
      });

      // Emit event (after transaction commits)
      setImmediate(() => {
        this.eventEmitter.emit('payment.status.changed', {
          orderId: order.id,
          userId: order.userId,
          status: 'REJECTED',
          amount: order.amount.toString(),
          previousStatus: 'PENDING',
          reason: reason || 'Payment verification failed',
        });
      });

      return order;
    });
  }

  async testPayment(orderId: string, userId: string) {
    // Only allowed in development
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Test payment not available in production');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Use the same approval logic
    const tradingAccount = await this.approvePayment(orderId, userId);

    // Additional audit log for test payment
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'TEST_PAYMENT_COMPLETED',
        entityType: 'Order',
        entityId: orderId,
        metadata: { environment: 'development' },
      },
    });

    return tradingAccount;
  }

  private async generateAccountNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    
    // Find the latest account number for this year
    const latestAccount = await tx.tradingAccount.findFirst({
      where: {
        accountNumber: {
          startsWith: `TRD-${year}-`,
        },
      },
      orderBy: {
        accountNumber: 'desc',
      },
    });

    let sequence = 1;
    if (latestAccount) {
      const parts = latestAccount.accountNumber.split('-');
      sequence = parseInt(parts[2]) + 1;
    }

    return `TRD-${year}-${sequence.toString().padStart(6, '0')}`;
  }
}
