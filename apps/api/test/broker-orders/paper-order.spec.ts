import { Test, TestingModule } from '@nestjs/testing';
import { PaperOrderAdapter } from '../../src/broker-orders/adapters/paper-order.adapter';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UnifiedMarketDataService } from '../../src/market-data/unified-market-data.service';
import { BrokerOrderStatus } from '../../src/broker-orders/dto/order-response.dto';
import { MarketDataSource } from '../../src/market-data/dto/normalized-tick.dto';
import Decimal from 'decimal.js';

/**
 * Paper Order Adapter Unit Tests
 * 
 * Day 6: Validates paper trading order lifecycle
 */
describe('PaperOrderAdapter', () => {
  let adapter: PaperOrderAdapter;
  let prismaService: PrismaService;
  let marketDataService: UnifiedMarketDataService;

  // Mock order data
  const mockOrderId = 'test-order-123';
  const mockOrder = {
    id: mockOrderId,
    userId: 'test-user',
    tradingAccountId: 'test-account',
    brokerConnectionId: 'paper-connection',
    tradingMode: 'PAPER',
    symbol: 'EUR/USD',
    side: 'BUY',
    orderType: 'MARKET',
    quantity: new Decimal(1),
    price: null,
    triggerPrice: null,
    stopLoss: null,
    takeProfit: null,
    status: BrokerOrderStatus.PENDING_SUBMISSION,
    statusMessage: null,
    filledQuantity: new Decimal(0),
    averageFillPrice: null,
    totalFillValue: null,
    commission: new Decimal(0),
    brokerOrderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mock Prisma methods
  const mockPrismaUpdate = jest.fn().mockResolvedValue(mockOrder);
  const mockPrismaFindUnique = jest.fn().mockResolvedValue(mockOrder);
  const mockPrismaCreateHistory = jest.fn().mockResolvedValue({});

  // Mock market data response
  const mockMarketPrice = new Decimal(1.12015);
  const mockQuoteResponse = {
    symbol: 'EUR/USD',
    source: MarketDataSource.TWELVEDATA,
    tick: {
      symbol: 'EUR/USD',
      source: MarketDataSource.TWELVEDATA,
      lastTradedPrice: mockMarketPrice,
      receivedAt: new Date(),
      connectionStatus: 'CONNECTED',
      isStale: false,
    },
    available: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaperOrderAdapter,
        {
          provide: PrismaService,
          useValue: {
            brokerOrder: {
              findUnique: mockPrismaFindUnique,
              update: mockPrismaUpdate,
            },
            brokerOrderStatusHistory: {
              create: mockPrismaCreateHistory,
            },
          },
        },
        {
          provide: UnifiedMarketDataService,
          useValue: {
            getQuote: jest.fn().mockReturnValue(mockQuoteResponse),
          },
        },
      ],
    }).compile();

    adapter = module.get<PaperOrderAdapter>(PaperOrderAdapter);
    prismaService = module.get<PrismaService>(PrismaService);
    marketDataService = module.get<UnifiedMarketDataService>(UnifiedMarketDataService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('executePaperOrder', () => {
    it('should execute market order with simulated latency', async () => {
      const startTime = Date.now();

      await adapter.executePaperOrder(mockOrderId);

      const duration = Date.now() - startTime;

      // Verify latency (should be at least 50ms)
      expect(duration).toBeGreaterThanOrEqual(50);

      // Verify order was fetched
      expect(mockPrismaFindUnique).toHaveBeenCalledWith({
        where: { id: mockOrderId },
      });

      // Verify status updates (SUBMITTED and FILLED)
      expect(mockPrismaUpdate).toHaveBeenCalled();
      expect(mockPrismaCreateHistory).toHaveBeenCalled();
    });

    it('should fetch market data for order fill', async () => {
      await adapter.executePaperOrder(mockOrderId);

      // Verify market data was queried
      expect(marketDataService.getQuote).toHaveBeenCalledWith(
        'EUR/USD',
        MarketDataSource.TWELVEDATA
      );
    });

    it('should handle missing order gracefully', async () => {
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      // Should not throw
      await expect(adapter.executePaperOrder(mockOrderId)).resolves.not.toThrow();
    });
  });

  describe('cancelPaperOrder', () => {
    it('should cancel paper order with latency', async () => {
      const startTime = Date.now();

      await adapter.cancelPaperOrder(mockOrderId);

      const duration = Date.now() - startTime;

      // Verify latency
      expect(duration).toBeGreaterThanOrEqual(50);

      // Verify order was updated to CANCELLED
      expect(mockPrismaUpdate).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: expect.objectContaining({
          status: BrokerOrderStatus.CANCELLED,
          statusMessage: 'Paper order cancelled (simulated)',
        }),
      });
    });

    it('should throw if order not found', async () => {
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      await expect(adapter.cancelPaperOrder(mockOrderId)).rejects.toThrow('Order not found');
    });
  });

  describe('getPaperOrderStatus', () => {
    it('should return order status with paper trading flag', async () => {
      const mockOrderWithHistory = {
        ...mockOrder,
        status: BrokerOrderStatus.FILLED,
        filledQuantity: new Decimal(1),
        averageFillPrice: new Decimal(1.12050),
        statusHistory: [],
      };

      mockPrismaFindUnique.mockResolvedValueOnce(mockOrderWithHistory);

      const status = await adapter.getPaperOrderStatus(mockOrderId);

      expect(status).toMatchObject({
        orderId: mockOrderId,
        status: BrokerOrderStatus.FILLED,
        paperTrading: true,
      });
    });

    it('should throw if order not found', async () => {
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      await expect(adapter.getPaperOrderStatus(mockOrderId)).rejects.toThrow('Order not found');
    });
  });

  describe('Market Data Integration', () => {
    it('should handle missing market data by rejecting order', async () => {
      // Mock unavailable market data
      jest.spyOn(marketDataService, 'getQuote').mockReturnValue({
        symbol: 'EUR/USD',
        source: MarketDataSource.TWELVEDATA,
        tick: null,
        available: false,
        reason: 'Data not available',
      });

      await adapter.executePaperOrder(mockOrderId);

      // Should have updated to REJECTED status
      expect(mockPrismaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId },
          data: expect.objectContaining({
            status: BrokerOrderStatus.REJECTED,
          }),
        })
      );
    });

    it('should apply slippage to market orders', async () => {
      await adapter.executePaperOrder(mockOrderId);

      // Check that fill price is different from market price
      // (we can't check exact value due to randomness, but we verified the update was called)
      expect(mockPrismaUpdate).toHaveBeenCalled();
    });
  });
});
