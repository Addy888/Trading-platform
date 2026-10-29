"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const paper_order_adapter_1 = require("../../src/broker-orders/adapters/paper-order.adapter");
const prisma_service_1 = require("../../src/prisma/prisma.service");
const market_data_engine_service_1 = require("../../src/market-data/market-data-engine.service");
const order_response_dto_1 = require("../../src/broker-orders/dto/order-response.dto");
const decimal_js_1 = __importDefault(require("decimal.js"));
describe('PaperOrderAdapter', () => {
    let adapter;
    let prismaService;
    let marketDataService;
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
        quantity: new decimal_js_1.default(1),
        price: null,
        triggerPrice: null,
        stopLoss: null,
        takeProfit: null,
        status: order_response_dto_1.BrokerOrderStatus.PENDING_SUBMISSION,
        statusMessage: null,
        filledQuantity: new decimal_js_1.default(0),
        averageFillPrice: null,
        totalFillValue: null,
        commission: new decimal_js_1.default(0),
        brokerOrderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const mockPrismaUpdate = jest.fn().mockResolvedValue(mockOrder);
    const mockPrismaFindUnique = jest.fn().mockResolvedValue(mockOrder);
    const mockPrismaCreateHistory = jest.fn().mockResolvedValue({});
    const mockMarketPrice = new decimal_js_1.default(1.12015);
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                paper_order_adapter_1.PaperOrderAdapter,
                {
                    provide: prisma_service_1.PrismaService,
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
                    provide: market_data_engine_service_1.MarketDataEngineService,
                    useValue: {
                        getMidPrice: jest.fn().mockReturnValue(mockMarketPrice),
                        isMarketAvailable: jest.fn().mockReturnValue(true),
                    },
                },
            ],
        }).compile();
        adapter = module.get(paper_order_adapter_1.PaperOrderAdapter);
        prismaService = module.get(prisma_service_1.PrismaService);
        marketDataService = module.get(market_data_engine_service_1.MarketDataEngineService);
        jest.clearAllMocks();
    });
    describe('executePaperOrder', () => {
        it('should execute market order with simulated latency', async () => {
            const startTime = Date.now();
            await adapter.executePaperOrder(mockOrderId);
            const duration = Date.now() - startTime;
            expect(duration).toBeGreaterThanOrEqual(50);
            expect(mockPrismaFindUnique).toHaveBeenCalledWith({
                where: { id: mockOrderId },
            });
            expect(mockPrismaUpdate).toHaveBeenCalled();
            expect(mockPrismaCreateHistory).toHaveBeenCalled();
        });
        it('should fetch market data for order fill', async () => {
            await adapter.executePaperOrder(mockOrderId);
            expect(marketDataService.getMidPrice).toHaveBeenCalledWith('EUR/USD');
            expect(marketDataService.isMarketAvailable).toHaveBeenCalledWith('EUR/USD');
        });
        it('should handle missing order gracefully', async () => {
            mockPrismaFindUnique.mockResolvedValueOnce(null);
            await expect(adapter.executePaperOrder(mockOrderId)).resolves.not.toThrow();
        });
    });
    describe('cancelPaperOrder', () => {
        it('should cancel paper order with latency', async () => {
            const startTime = Date.now();
            await adapter.cancelPaperOrder(mockOrderId);
            const duration = Date.now() - startTime;
            expect(duration).toBeGreaterThanOrEqual(50);
            expect(mockPrismaUpdate).toHaveBeenCalledWith({
                where: { id: mockOrderId },
                data: expect.objectContaining({
                    status: order_response_dto_1.BrokerOrderStatus.CANCELLED,
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
                status: order_response_dto_1.BrokerOrderStatus.FILLED,
                filledQuantity: new decimal_js_1.default(1),
                averageFillPrice: new decimal_js_1.default(1.12050),
                statusHistory: [],
            };
            mockPrismaFindUnique.mockResolvedValueOnce(mockOrderWithHistory);
            const status = await adapter.getPaperOrderStatus(mockOrderId);
            expect(status).toMatchObject({
                orderId: mockOrderId,
                status: order_response_dto_1.BrokerOrderStatus.FILLED,
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
            jest.spyOn(marketDataService, 'getMidPrice').mockReturnValue(null);
            jest.spyOn(marketDataService, 'isMarketAvailable').mockReturnValue(false);
            await adapter.executePaperOrder(mockOrderId);
            expect(mockPrismaUpdate).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: mockOrderId },
                data: expect.objectContaining({
                    status: order_response_dto_1.BrokerOrderStatus.REJECTED,
                }),
            }));
        });
        it('should apply slippage to market orders', async () => {
            await adapter.executePaperOrder(mockOrderId);
            expect(mockPrismaUpdate).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=paper-order.spec.js.map