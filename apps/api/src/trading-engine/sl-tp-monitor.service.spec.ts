import { Test, TestingModule } from '@nestjs/testing';
import { SlTpMonitorService } from './sl-tp-monitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { BalanceEquityService } from './balance-equity.service';
import { RiskEvaluationService } from '../risk-engine/risk-evaluation.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradeStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';

describe('SlTpMonitorService - Day 13', () => {
  let service: SlTpMonitorService;
  let prisma: PrismaService;
  let marketData: MarketDataEngineService;
  let balanceEquity: BalanceEquityService;
  let riskEvaluation: RiskEvaluationService;
  let accountSnapshots: AccountSnapshotsService;
  let instrumentConfig: InstrumentConfigService;
  let eventEmitter: EventEmitter2;

  const mockAccountId = 'account-123';
  const mockUserId = 'user-456';
  const mockTradeId = 'trade-789';

  const createMockTrade = (overrides?: any) => ({
    id: mockTradeId,
    tradingAccountId: mockAccountId,
    symbol: 'EURUSD',
    side: TradeSide.BUY,
    volume: new Decimal(0.1),
    entryPrice: new Decimal(1.1000),
    stopLoss: new Decimal(1.0950),
    takeProfit: new Decimal(1.1050),
    status: TradeStatus.OPEN,
    tradingAccount: {
      id: mockAccountId,
      userId: mockUserId,
      accountNumber: 'TEST-001',
      currentBalance: new Decimal(10000),
      status: 'ACTIVE',
    },
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlTpMonitorService,
        {
          provide: PrismaService,
          useValue: {
            trade: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            tradingAccount: {
              update: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
            $transaction: jest.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: MarketDataEngineService,
          useValue: {
            getTick: jest.fn(),
          },
        },
        {
          provide: BalanceEquityService,
          useValue: {
            updateFinancialStateOnClose: jest.fn(),
            calculateTotalRealizedPnl: jest.fn(),
            calculateTotalUnrealizedPnl: jest.fn(),
          },
        },
        {
          provide: RiskEvaluationService,
          useValue: {
            evaluateAccount: jest.fn(),
            emitPostEvaluationEvents: jest.fn(),
          },
        },
        {
          provide: AccountSnapshotsService,
          useValue: {
            createSnapshot: jest.fn(),
          },
        },
        {
          provide: InstrumentConfigService,
          useValue: {
            getInstrument: jest.fn().mockReturnValue({
              symbol: 'EURUSD',
              contractMultiplier: 100000,
            }),
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

    service = module.get<SlTpMonitorService>(SlTpMonitorService);
    prisma = module.get<PrismaService>(PrismaService);
    marketData = module.get<MarketDataEngineService>(MarketDataEngineService);
    balanceEquity = module.get<BalanceEquityService>(BalanceEquityService);
    riskEvaluation = module.get<RiskEvaluationService>(RiskEvaluationService);
    accountSnapshots = module.get<AccountSnapshotsService>(AccountSnapshotsService);
    instrumentConfig = module.get<InstrumentConfigService>(InstrumentConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('Market Tick Handling', () => {
    it('should listen to market.tick events', async () => {
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([]);

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.1000), ask: new Decimal(1.1002) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.findMany).toHaveBeenCalledWith({
        where: {
          status: TradeStatus.OPEN,
          symbol: { in: ['EURUSD'] },
          OR: [
            { stopLoss: { not: null } },
            { takeProfit: { not: null } },
          ],
        },
        include: {
          tradingAccount: {
            select: {
              id: true,
              userId: true,
              accountNumber: true,
              currentBalance: true,
              status: true,
            },
          },
        },
      });
    });

    it('should skip monitoring if service is disabled', async () => {
      process.env.SL_TP_MONITOR_ENABLED = 'false';
      
      const newService = new SlTpMonitorService(
        prisma,
        marketData,
        eventEmitter,
        balanceEquity,
        riskEvaluation,
        accountSnapshots,
        instrumentConfig,
      );

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([]);

      await newService.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.1000), ask: new Decimal(1.1002) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.findMany).not.toHaveBeenCalled();
      
      delete process.env.SL_TP_MONITOR_ENABLED;
    });

    it('should find trades with SL or TP for updated symbols', async () => {
      const mockTrades = [
        createMockTrade(),
        createMockTrade({ id: 'trade-2', symbol: 'GBPUSD' }),
      ];

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue(mockTrades);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.1000),
        ask: new Decimal(1.1002),
      });

      await service.handleMarketTick({
        ticks: [
          { symbol: 'EURUSD', bid: new Decimal(1.1000), ask: new Decimal(1.1002) },
          { symbol: 'GBPUSD', bid: new Decimal(1.2500), ask: new Decimal(1.2502) },
        ],
        timestamp: new Date(),
      });

      expect(prisma.trade.findMany).toHaveBeenCalledWith({
        where: {
          status: TradeStatus.OPEN,
          symbol: { in: ['EURUSD', 'GBPUSD'] },
          OR: [
            { stopLoss: { not: null } },
            { takeProfit: { not: null } },
          ],
        },
        include: expect.any(Object),
      });
    });
  });

  describe('LONG Position SL Trigger', () => {
    it('should trigger SL when BID <= SL for LONG position', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        entryPrice: new Decimal(1.1000),
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0950), // Exactly at SL
        ask: new Decimal(1.0952),
      });

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(9950),
        equity: new Decimal(9950),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.update).toHaveBeenCalledWith({
        where: { id: mockTradeId },
        data: expect.objectContaining({
          status: TradeStatus.CLOSED,
          exitPrice: new Decimal(1.0950),
        }),
      });
    });

    it('should NOT trigger SL when BID > SL for LONG position', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0951), // Above SL
        ask: new Decimal(1.0953),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0951), ask: new Decimal(1.0953) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.update).not.toHaveBeenCalled();
    });
  });

  describe('LONG Position TP Trigger', () => {
    it('should trigger TP when BID >= TP for LONG position', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        entryPrice: new Decimal(1.1000),
        takeProfit: new Decimal(1.1050),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.1050), // Exactly at TP
        ask: new Decimal(1.1052),
      });

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(10050),
        equity: new Decimal(10050),
        hwmUpdated: true,
        hwm: new Decimal(10050),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.1050), ask: new Decimal(1.1052) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.update).toHaveBeenCalledWith({
        where: { id: mockTradeId },
        data: expect.objectContaining({
          status: TradeStatus.CLOSED,
          exitPrice: new Decimal(1.1050),
        }),
      });
    });
  });

  describe('SHORT Position SL Trigger', () => {
    it('should trigger SL when ASK >= SL for SHORT position', async () => {
      const trade = createMockTrade({
        side: TradeSide.SELL,
        entryPrice: new Decimal(1.1000),
        stopLoss: new Decimal(1.1050),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.1048),
        ask: new Decimal(1.1050), // Exactly at SL
      });

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(9950),
        equity: new Decimal(9950),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.1048), ask: new Decimal(1.1050) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.update).toHaveBeenCalled();
    });

    it('should NOT trigger SL when ASK < SL for SHORT position', async () => {
      const trade = createMockTrade({
        side: TradeSide.SELL,
        stopLoss: new Decimal(1.1050),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.1047),
        ask: new Decimal(1.1049), // Below SL
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.1047), ask: new Decimal(1.1049) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.update).not.toHaveBeenCalled();
    });
  });

  describe('SHORT Position TP Trigger', () => {
    it('should trigger TP when ASK <= TP for SHORT position', async () => {
      const trade = createMockTrade({
        side: TradeSide.SELL,
        entryPrice: new Decimal(1.1000),
        takeProfit: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0948),
        ask: new Decimal(1.0950), // Exactly at TP
      });

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(10050),
        equity: new Decimal(10050),
        hwmUpdated: true,
        hwm: new Decimal(10050),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0948), ask: new Decimal(1.0950) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.update).toHaveBeenCalled();
    });
  });

  describe('Idempotency Protection', () => {
    it('should prevent duplicate processing of same trade', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0950),
        ask: new Decimal(1.0952),
      });

      // First call should process
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(9950),
        equity: new Decimal(9950),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      // Simulate concurrent calls
      const promise1 = service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });
      
      const promise2 = service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });

      await Promise.all([promise1, promise2]);

      // Should only execute once
      expect(prisma.trade.update).toHaveBeenCalledTimes(1);
    });

    it('should not trigger if trade already closed', async () => {
      const trade = createMockTrade({
        status: TradeStatus.OPEN,
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue({
        ...trade,
        status: TradeStatus.CLOSED, // Already closed in transaction
      });
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0950),
        ask: new Decimal(1.0952),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });

      expect(prisma.trade.update).not.toHaveBeenCalled();
    });
  });

  describe('Risk Integration', () => {
    it('should call risk evaluation after automatic close', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0950),
        ask: new Decimal(1.0952),
      });

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(9950),
        equity: new Decimal(9950),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });

      expect(riskEvaluation.evaluateAccount).toHaveBeenCalledWith(
        mockAccountId,
        expect.objectContaining({
          type: 'TRADE_CLOSE',
          triggeredBy: 'SYSTEM',
          metadata: expect.objectContaining({
            autoTrigger: true,
          }),
        }),
      );
    });

    it('should create account snapshot after automatic close', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0950),
        ask: new Decimal(1.0952),
      });

      const financialState = {
        balance: new Decimal(9950),
        equity: new Decimal(9950),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      };

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue(financialState);
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });

      expect(accountSnapshots.createSnapshot).toHaveBeenCalledWith(
        mockAccountId,
        financialState.balance,
        financialState.equity,
        new Decimal(-50),
        new Decimal(0),
        expect.anything(),
      );
    });
  });

  describe('Event Emission', () => {
    it('should emit trade.closed event', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0950),
        ask: new Decimal(1.0952),
      });

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(9950),
        equity: new Decimal(9950),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('trade.closed', expect.any(Object));
      expect(eventEmitter.emit).toHaveBeenCalledWith('trade.sltp.triggered', expect.objectContaining({
        tradeId: mockTradeId,
        userId: mockUserId,
        reason: 'STOP_LOSS',
      }));
    });
  });

  describe('Price Gap Scenarios', () => {
    it('should execute at current tick price if price gaps past SL', async () => {
      const trade = createMockTrade({
        side: TradeSide.BUY,
        entryPrice: new Decimal(1.1000),
        stopLoss: new Decimal(1.0950),
      });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade]);
      jest.spyOn(prisma.trade, 'findUnique').mockResolvedValue(trade);
      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade);
      
      // Price gaps from 1.1000 to 1.0940 (past SL of 1.0950)
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0940), // Below SL
        ask: new Decimal(1.0942),
      });

      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(9940),
        equity: new Decimal(9940),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-60));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0940), ask: new Decimal(1.0942) }],
        timestamp: new Date(),
      });

      // Should execute at 1.0940 (current price), not 1.0950 (SL level)
      expect(prisma.trade.update).toHaveBeenCalledWith({
        where: { id: mockTradeId },
        data: expect.objectContaining({
          exitPrice: new Decimal(1.0940),
        }),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully and continue monitoring', async () => {
      const trade1 = createMockTrade({ id: 'trade-1' });
      const trade2 = createMockTrade({ id: 'trade-2', stopLoss: new Decimal(1.0950) });

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([trade1, trade2]);
      jest.spyOn(marketData, 'getTick').mockReturnValue({
        symbol: 'EURUSD',
        bid: new Decimal(1.0950),
        ask: new Decimal(1.0952),
      });

      // First trade throws error
      jest.spyOn(prisma.trade, 'findUnique')
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(trade2);

      jest.spyOn(prisma.trade, 'update').mockResolvedValue(trade2);
      jest.spyOn(balanceEquity, 'updateFinancialStateOnClose').mockResolvedValue({
        balance: new Decimal(9950),
        equity: new Decimal(9950),
        hwmUpdated: false,
        hwm: new Decimal(10000),
      });
      jest.spyOn(balanceEquity, 'calculateTotalRealizedPnl').mockResolvedValue(new Decimal(-50));
      jest.spyOn(balanceEquity, 'calculateTotalUnrealizedPnl').mockResolvedValue(new Decimal(0));
      jest.spyOn(riskEvaluation, 'evaluateAccount').mockResolvedValue({
        accountId: mockAccountId,
        calculation: {} as any,
        statusChanged: false,
        evaluationTimestamp: new Date(),
      });

      await service.handleMarketTick({
        ticks: [{ symbol: 'EURUSD', bid: new Decimal(1.0950), ask: new Decimal(1.0952) }],
        timestamp: new Date(),
      });

      // Second trade should still process despite first trade error
      expect(prisma.trade.update).toHaveBeenCalledWith({
        where: { id: 'trade-2' },
        data: expect.any(Object),
      });
    });
  });
});
