import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { BrokerOrderService } from './broker-order.service';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerConnectionService } from '../broker/broker-connection.service';
import { AngelOneOrderAdapter } from '../broker/providers/angelone/angelone-order.adapter';
import { PreTradeRiskValidationService } from '../trading-engine/pre-trade-risk-validation.service';
import { TradeSide } from '@prisma/client';
import { TradingMode, OrderType } from './dto/place-order.dto';
import { BrokerOrderStatus } from './dto/order-response.dto';
import Decimal from 'decimal.js';

// Create a type-safe mock helper
const createMockPrisma = () => ({
  brokerOrder: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  brokerOrderStatusHistory: {
    create: jest.fn(),
  },
  tradingAccount: {
    findUnique: jest.fn(),
  },
  brokerConnection: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
});

type MockPrisma = ReturnType<typeof createMockPrisma>;

describe('BrokerOrderService', () => {
  let service: BrokerOrderService;
  let prisma: MockPrisma;
  let brokerConnection: jest.Mocked<BrokerConnectionService>;
  let angelOneOrder: jest.Mocked<AngelOneOrderAdapter>;
  let riskValidation: jest.Mocked<PreTradeRiskValidationService>;

  const mockUserId = 'user-123';
  const mockAccountId = 'account-123';
  const mockConnectionId = 'connection-123';

  beforeEach(async () => {
    const mockPrismaService = createMockPrisma();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerOrderService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: BrokerConnectionService,
          useValue: {
            getSessionToken: jest.fn(),
          },
        },
        {
          provide: AngelOneOrderAdapter,
          useValue: {
            placeOrder: jest.fn(),
            getOrderStatus: jest.fn(),
            getOrderBook: jest.fn(),
            cancelOrder: jest.fn(),
            mapToNormalizedStatus: jest.fn(),
          },
        },
        {
          provide: PreTradeRiskValidationService,
          useValue: {
            validateOrder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BrokerOrderService>(BrokerOrderService);
    prisma = module.get(PrismaService) as unknown as MockPrisma;
    brokerConnection = module.get(BrokerConnectionService) as jest.Mocked<BrokerConnectionService>;
    angelOneOrder = module.get(AngelOneOrderAdapter) as jest.Mocked<AngelOneOrderAdapter>;
    riskValidation = module.get(PreTradeRiskValidationService) as jest.Mocked<PreTradeRiskValidationService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('placeOrder - Idempotency', () => {
    it('should return existing order if idempotency key matches', async () => {
      const existingOrder = {
        id: 'order-123',
        idempotencyKey: 'idempotency-123',
        status: BrokerOrderStatus.FILLED,
        quantity: new Decimal(10),
        filledQuantity: new Decimal(10),
        commission: new Decimal(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.brokerOrder.findUnique.mockResolvedValue(existingOrder as any);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.SIMULATED,
        idempotencyKey: 'idempotency-123',
      };

      const result = await service.placeOrder(mockUserId, placeOrderDto);

      expect(result.id).toBe('order-123');
      expect(prisma.brokerOrder.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'idempotency-123' },
      });
      expect(riskValidation.validateOrder).not.toHaveBeenCalled();
    });
  });

  describe('placeOrder - Account Ownership', () => {
    it('should reject if trading account not found', async () => {
      prisma.brokerOrder.findUnique.mockResolvedValue(null);
      prisma.tradingAccount.findUnique.mockResolvedValue(null);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.SIMULATED,
      };

      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow(HttpException);
      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow('Trading account not found');
    });

    it('should reject if user does not own trading account', async () => {
      prisma.brokerOrder.findUnique.mockResolvedValue(null);
      prisma.tradingAccount.findUnique.mockResolvedValue({
        id: mockAccountId,
        userId: 'different-user',
      } as any);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.SIMULATED,
      };

      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow(HttpException);
      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow('You do not own this trading account');
    });
  });

  describe('placeOrder - LIVE Mode Validation', () => {
    beforeEach(() => {
      prisma.brokerOrder.findUnique.mockResolvedValue(null);
      prisma.tradingAccount.findUnique.mockResolvedValue({
        id: mockAccountId,
        userId: mockUserId,
        ruleSnapshot: {},
      } as any);
    });

    it('should reject LIVE order without explicit confirmation', async () => {
      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'RELIANCE',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.LIVE,
        confirmLiveOrder: false,
      };

      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow(HttpException);
      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow('LIVE order requires explicit confirmation');
    });

    it('should reject LIVE order if broker not connected', async () => {
      prisma.brokerConnection.findFirst.mockResolvedValue(null);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'RELIANCE',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.LIVE,
        confirmLiveOrder: true,
      };

      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow(HttpException);
      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow('Broker connection required');
    });

    it('should reject LIVE order if broker session expired', async () => {
      const expiredDate = new Date(Date.now() - 86400000); // Yesterday

      prisma.brokerConnection.findFirst.mockResolvedValue({
        id: mockConnectionId,
        userId: mockUserId,
        provider: 'ANGELONE',
        status: 'CONNECTED',
        tokenExpiresAt: expiredDate,
      } as any);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'RELIANCE',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.LIVE,
        confirmLiveOrder: true,
      };

      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow(HttpException);
      await expect(service.placeOrder(mockUserId, placeOrderDto)).rejects.toThrow('Broker session expired');
    });
  });

  describe('placeOrder - Risk Validation', () => {
    beforeEach(() => {
      prisma.brokerOrder.findUnique.mockResolvedValue(null);
      prisma.tradingAccount.findUnique.mockResolvedValue({
        id: mockAccountId,
        userId: mockUserId,
        ruleSnapshot: {},
      } as any);
    });

    it('should reject order if risk validation fails', async () => {
      riskValidation.validateOrder.mockResolvedValue({
        approved: false,
        code: 'INSUFFICIENT_MARGIN',
        message: 'Insufficient margin for order',
        validationTimestamp: new Date(),
        metadata: {},
        validationSteps: [],
      } as any);

      prisma.brokerOrder.create.mockResolvedValue({
        id: 'order-123',
        status: BrokerOrderStatus.REJECTED,
        quantity: new Decimal(10),
        filledQuantity: new Decimal(0),
        commission: new Decimal(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.SIMULATED,
      };

      const result = await service.placeOrder(mockUserId, placeOrderDto);

      expect(result.status).toBe(BrokerOrderStatus.REJECTED);
      expect(result.riskValidationCode).toBe('INSUFFICIENT_MARGIN');
      expect(prisma.brokerOrder.create).toHaveBeenCalled();
    });

    it('should proceed if risk validation approves', async () => {
      riskValidation.validateOrder.mockResolvedValue({
        approved: true,
        code: 'APPROVED',
        message: 'Order approved',
        validationTimestamp: new Date(),
        metadata: {
          executionPrice: '1.0850',
        },
        validationSteps: [],
      } as any);

      prisma.brokerConnection.findFirst.mockResolvedValue({
        id: mockConnectionId,
        provider: 'SIMULATED',
      } as any);

      prisma.brokerOrder.create.mockResolvedValue({
        id: 'order-123',
        status: BrokerOrderStatus.FILLED,
        quantity: new Decimal(10),
        filledQuantity: new Decimal(10),
        averageFillPrice: new Decimal('1.0850'),
        commission: new Decimal(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      prisma.brokerOrderStatusHistory.create.mockResolvedValue({} as any);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.SIMULATED,
      };

      const result = await service.placeOrder(mockUserId, placeOrderDto);

      expect(result.status).toBe(BrokerOrderStatus.FILLED);
      expect(riskValidation.validateOrder).toHaveBeenCalled();
    });
  });

  describe('placeOrder - SIMULATED Execution', () => {
    beforeEach(() => {
      prisma.brokerOrder.findUnique.mockResolvedValue(null);
      prisma.tradingAccount.findUnique.mockResolvedValue({
        id: mockAccountId,
        userId: mockUserId,
        ruleSnapshot: {},
      } as any);

      riskValidation.validateOrder.mockResolvedValue({
        approved: true,
        code: 'APPROVED',
        message: 'Order approved',
        validationTimestamp: new Date(),
        metadata: {
          executionPrice: '1.0850',
        },
        validationSteps: [],
      } as any);

      prisma.brokerConnection.findFirst.mockResolvedValue({
        id: mockConnectionId,
        provider: 'SIMULATED',
      } as any);
    });

    it('should instantly fill SIMULATED order', async () => {
      prisma.brokerOrder.create.mockResolvedValue({
        id: 'order-123',
        status: BrokerOrderStatus.FILLED,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        quantity: new Decimal(10),
        filledQuantity: new Decimal(10),
        averageFillPrice: new Decimal('1.0850'),
        commission: new Decimal(0),
        tradingMode: TradingMode.SIMULATED,
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedAt: new Date(),
        filledAt: new Date(),
      } as any);

      prisma.brokerOrderStatusHistory.create.mockResolvedValue({} as any);

      const placeOrderDto = {
        tradingAccountId: mockAccountId,
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        orderType: OrderType.MARKET,
        quantity: 10,
        tradingMode: TradingMode.SIMULATED,
      };

      const result = await service.placeOrder(mockUserId, placeOrderDto);

      expect(result.status).toBe(BrokerOrderStatus.FILLED);
      expect(result.filledQuantity).toBe(10);
      expect(result.averageFillPrice).toBe(1.0850);
      expect(result.tradingMode).toBe(TradingMode.SIMULATED);
      expect(prisma.brokerOrderStatusHistory.create).toHaveBeenCalled();
    });
  });

  describe('getOrder', () => {
    it('should return order if found and owned by user', async () => {
      const mockOrder = {
        id: 'order-123',
        userId: mockUserId,
        status: BrokerOrderStatus.FILLED,
        quantity: new Decimal(10),
        filledQuantity: new Decimal(10),
        commission: new Decimal(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.brokerOrder.findUnique.mockResolvedValue(mockOrder as any);

      const result = await service.getOrder(mockUserId, 'order-123');

      expect(result.id).toBe('order-123');
      expect(prisma.brokerOrder.findUnique).toHaveBeenCalledWith({
        where: { id: 'order-123' },
      });
    });

    it('should reject if order not found', async () => {
      prisma.brokerOrder.findUnique.mockResolvedValue(null);

      await expect(service.getOrder(mockUserId, 'order-123')).rejects.toThrow(HttpException);
      await expect(service.getOrder(mockUserId, 'order-123')).rejects.toThrow('Order not found');
    });

    it('should reject if order not owned by user', async () => {
      prisma.brokerOrder.findUnique.mockResolvedValue({
        id: 'order-123',
        userId: 'different-user',
      } as any);

      await expect(service.getOrder(mockUserId, 'order-123')).rejects.toThrow(HttpException);
      await expect(service.getOrder(mockUserId, 'order-123')).rejects.toThrow('You do not own this order');
    });
  });

  describe('cancelOrder', () => {
    it('should instantly cancel SIMULATED order', async () => {
      const mockOrder = {
        id: 'order-123',
        userId: mockUserId,
        tradingMode: TradingMode.SIMULATED,
        status: BrokerOrderStatus.OPEN,
      };

      prisma.brokerOrder.findUnique.mockResolvedValue(mockOrder as any);
      prisma.brokerOrder.update.mockResolvedValue({
        ...mockOrder,
        status: BrokerOrderStatus.CANCELLED,
        cancelledAt: new Date(),
      } as any);
      prisma.brokerOrderStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.cancelOrder(mockUserId, 'order-123');

      expect(result.status).toBe(BrokerOrderStatus.CANCELLED);
      expect(prisma.brokerOrderStatusHistory.create).toHaveBeenCalled();
    });

    it('should reject cancel if order cannot be cancelled', async () => {
      prisma.brokerOrder.findUnique.mockResolvedValue({
        id: 'order-123',
        userId: mockUserId,
        status: BrokerOrderStatus.FILLED,
      } as any);

      await expect(service.cancelOrder(mockUserId, 'order-123')).rejects.toThrow(HttpException);
      await expect(service.cancelOrder(mockUserId, 'order-123')).rejects.toThrow('cannot be cancelled');
    });
  });

  describe('listOrders', () => {
    it('should return paginated orders for user', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          userId: mockUserId,
          quantity: new Decimal(10),
          filledQuantity: new Decimal(10),
          commission: new Decimal(0),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'order-2',
          userId: mockUserId,
          quantity: new Decimal(20),
          filledQuantity: new Decimal(0),
          commission: new Decimal(0),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prisma.brokerOrder.findMany.mockResolvedValue(mockOrders as any);
      prisma.brokerOrder.count.mockResolvedValue(2);

      const result = await service.listOrders(mockUserId, undefined, 1, 50);

      expect(result.orders).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
    });

    it('should filter by trading account', async () => {
      prisma.brokerOrder.findMany.mockResolvedValue([]);
      prisma.brokerOrder.count.mockResolvedValue(0);

      await service.listOrders(mockUserId, mockAccountId, 1, 50);

      expect(prisma.brokerOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            tradingAccountId: mockAccountId,
          }),
        })
      );
    });
  });
});
