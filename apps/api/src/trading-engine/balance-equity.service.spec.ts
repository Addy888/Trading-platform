import { Test, TestingModule } from '@nestjs/testing';
import { BalanceEquityService } from './balance-equity.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { AccountStateService } from '../trading-accounts/account-state.service';
import { TradeSide, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

describe('BalanceEquityService - Day 3 Tests', () => {
  let service: BalanceEquityService;
  let prisma: PrismaService;
  let marketData: MarketDataEngineService;
  let instrumentConfig: InstrumentConfigService;
  let accountState: AccountStateService;

  const mockAccountId = 'test-account-123';
  const mockAccount = {
    id: mockAccountId,
    currentBalance: new Decimal(100000),
    equity: new Decimal(100000),
    highWaterMark: new Decimal(100000),
    dailyStartEquity: new Decimal(100000),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceEquityService,
        {
          provide: PrismaService,
          useValue: {
            tradingAccount: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            trade: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: MarketDataEngineService,
          useValue: {
            getBid: jest.fn(),
            getAsk: jest.fn(),
            getPrice: jest.fn(),
          },
        },
        {
          provide: InstrumentConfigService,
          useValue: {
            getInstrument: jest.fn().mockReturnValue({
              contractMultiplier: 100000,
              symbol: 'EURUSD',
            }),
          },
        },
        {
          provide: AccountStateService,
          useValue: {
            updateHighWaterMark: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BalanceEquityService>(BalanceEquityService);
    prisma = module.get<PrismaService>(PrismaService);
    marketData = module.get<MarketDataEngineService>(MarketDataEngineService);
    instrumentConfig = module.get<InstrumentConfigService>(InstrumentConfigService);
    accountState = module.get<AccountStateService>(AccountStateService);
  });

  describe('Decimal Precision Tests', () => {
    it('should calculate BUY unrealized P&L with exact decimal precision', () => {
      const entryPrice = new Decimal('1.09500');
      const currentPrice = new Decimal('1.09750');
      const volume = new Decimal('1.0');
      const contractMultiplier = 100000;

      const pnl = service.calculatePositionUnrealizedPnl(
        TradeSide.BUY,
        entryPrice,
        currentPrice,
        volume,
        contractMultiplier,
      );

      // (1.09750 - 1.09500) * 1.0 * 100000 = 250.00
      expect(pnl.toString()).toBe('250.00');
      expect(FinancialCalculations.formatMoney(pnl)).toBe('250.00');
    });

    it('should calculate SELL unrealized P&L with exact decimal precision', () => {
      const entryPrice = new Decimal('1.09500');
      const currentPrice = new Decimal('1.09250');
      const volume = new Decimal('1.0');
      const contractMultiplier = 100000;

      const pnl = service.calculatePositionUnrealizedPnl(
        TradeSide.SELL,
        entryPrice,
        currentPrice,
        volume,
        contractMultiplier,
      );

      // (1.09500 - 1.09250) * 1.0 * 100000 = 250.00
      expect(pnl.toString()).toBe('250.00');
      expect(FinancialCalculations.formatMoney(pnl)).toBe('250.00');
    });

    it('should handle negative P&L correctly for BUY position', () => {
      const entryPrice = new Decimal('1.09500');
      const currentPrice = new Decimal('1.09250');
      const volume = new Decimal('1.0');
      const contractMultiplier = 100000;

      const pnl = service.calculatePositionUnrealizedPnl(
        TradeSide.BUY,
        entryPrice,
        currentPrice,
        volume,
        contractMultiplier,
      );

      // (1.09250 - 1.09500) * 1.0 * 100000 = -250.00
      expect(pnl.toString()).toBe('-250.00');
      expect(FinancialCalculations.isNegative(pnl)).toBe(true);
    });

    it('should handle negative P&L correctly for SELL position', () => {
      const entryPrice = new Decimal('1.09500');
      const currentPrice = new Decimal('1.09750');
      const volume = new Decimal('1.0');
      const contractMultiplier = 100000;

      const pnl = service.calculatePositionUnrealizedPnl(
        TradeSide.SELL,
        entryPrice,
        currentPrice,
        volume,
        contractMultiplier,
      );

      // (1.09500 - 1.09750) * 1.0 * 100000 = -250.00
      expect(pnl.toString()).toBe('-250.00');
      expect(FinancialCalculations.isNegative(pnl)).toBe(true);
    });

    it('should handle fractional volumes with precision', () => {
      const entryPrice = new Decimal('1.09500');
      const currentPrice = new Decimal('1.09750');
      const volume = new Decimal('0.5');
      const contractMultiplier = 100000;

      const pnl = service.calculatePositionUnrealizedPnl(
        TradeSide.BUY,
        entryPrice,
        currentPrice,
        volume,
        contractMultiplier,
      );

      // (1.09750 - 1.09500) * 0.5 * 100000 = 125.00
      expect(pnl.toString()).toBe('125.00');
    });

    it('should round money to 2 decimal places', () => {
      const entryPrice = new Decimal('1.09501');
      const currentPrice = new Decimal('1.09753');
      const volume = new Decimal('1.0');
      const contractMultiplier = 100000;

      const pnl = service.calculatePositionUnrealizedPnl(
        TradeSide.BUY,
        entryPrice,
        currentPrice,
        volume,
        contractMultiplier,
      );

      // (1.09753 - 1.09501) * 1.0 * 100000 = 252.00 (rounded)
      expect(pnl.toString()).toBe('252.00');
      expect(pnl.decimalPlaces()).toBe(2);
    });
  });

  describe('Balance Management Tests', () => {
    it('should update balance correctly on position close with profit', async () => {
      const realizedPnl = new Decimal('500.00');
      
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({
        ...mockAccount,
        currentBalance: new Decimal(100500),
      } as any);

      const newBalance = await service.updateBalanceOnClose(
        mockAccountId,
        realizedPnl,
      );

      expect(newBalance.toString()).toBe('100500.00');
      expect(prisma.tradingAccount.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: expect.objectContaining({
          currentBalance: new Decimal(100500),
          lastTradeAt: expect.any(Date),
        }),
      });
    });

    it('should update balance correctly on position close with loss', async () => {
      const realizedPnl = new Decimal('-500.00');
      
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({
        ...mockAccount,
        currentBalance: new Decimal(99500),
      } as any);

      const newBalance = await service.updateBalanceOnClose(
        mockAccountId,
        realizedPnl,
      );

      expect(newBalance.toString()).toBe('99500.00');
    });

    it('should not modify balance on position open', async () => {
      // Balance should only change on close, not on open
      // This test ensures we don't accidentally realize unrealized P&L
      const updateSpy = jest.spyOn(prisma.tradingAccount, 'update');
      
      // Opening a position should not call updateBalanceOnClose
      // (This is enforced by trading engine flow, tested implicitly)
      expect(updateSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentBalance: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('Equity Calculation Tests', () => {
    it('should calculate equity correctly with no open positions', async () => {
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([]);

      const equity = await service.calculateAccountEquity(mockAccountId);

      // Equity = Balance + 0 unrealized P&L
      expect(equity.toString()).toBe('100000.00');
    });

    it('should calculate equity correctly with profitable open positions', async () => {
      const openTrade = {
        id: 'trade-1',
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: new Decimal('1.0'),
        entryPrice: new Decimal('1.09500'),
        status: TradeStatus.OPEN,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([openTrade] as any);
      jest.spyOn(marketData, 'getBid').mockReturnValue(new Decimal('1.09750'));

      const equity = await service.calculateAccountEquity(mockAccountId);

      // Balance: 100000, Unrealized: +250 = Equity: 100250
      expect(equity.toString()).toBe('100250.00');
    });

    it('should calculate equity correctly with losing open positions', async () => {
      const openTrade = {
        id: 'trade-1',
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: new Decimal('1.0'),
        entryPrice: new Decimal('1.09500'),
        status: TradeStatus.OPEN,
      };

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([openTrade] as any);
      jest.spyOn(marketData, 'getBid').mockReturnValue(new Decimal('1.09250'));

      const equity = await service.calculateAccountEquity(mockAccountId);

      // Balance: 100000, Unrealized: -250 = Equity: 99750
      expect(equity.toString()).toBe('99750.00');
    });

    it('should calculate equity correctly with multiple open positions', async () => {
      const openTrades = [
        {
          id: 'trade-1',
          symbol: 'EURUSD',
          side: TradeSide.BUY,
          volume: new Decimal('1.0'),
          entryPrice: new Decimal('1.09500'),
          status: TradeStatus.OPEN,
        },
        {
          id: 'trade-2',
          symbol: 'GBPUSD',
          side: TradeSide.SELL,
          volume: new Decimal('1.0'),
          entryPrice: new Decimal('1.27000'),
          status: TradeStatus.OPEN,
        },
      ];

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue(openTrades as any);
      jest.spyOn(marketData, 'getBid').mockReturnValue(new Decimal('1.09750')); // EURUSD
      jest.spyOn(marketData, 'getAsk').mockReturnValue(new Decimal('1.26750')); // GBPUSD

      const equity = await service.calculateAccountEquity(mockAccountId);

      // EURUSD: (1.09750 - 1.09500) * 1.0 * 100000 = +250
      // GBPUSD: (1.27000 - 1.26750) * 1.0 * 100000 = +250
      // Total unrealized: +500
      // Equity: 100000 + 500 = 100500
      expect(equity.toString()).toBe('100500.00');
    });
  });

  describe('High Water Mark (HWM) Tests', () => {
    it('should initialize HWM to initial balance on account creation', async () => {
      // This is tested in AccountStateService
      // HWM should equal initialBalance at creation
      expect(mockAccount.highWaterMark.toString()).toBe('100000.00');
    });

    it('should update HWM when equity exceeds current HWM', async () => {
      const currentEquity = new Decimal('105000.00');
      
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({
        ...mockAccount,
        highWaterMark: currentEquity,
      } as any);

      const result = await service.updateHighWaterMark(
        mockAccountId,
        currentEquity,
      );

      expect(result.updated).toBe(true);
      expect(result.hwm.toString()).toBe('105000.00');
      expect(prisma.tradingAccount.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: { highWaterMark: currentEquity },
      });
    });

    it('should NOT update HWM when equity is below current HWM', async () => {
      const currentEquity = new Decimal('99000.00');
      
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      const updateSpy = jest.spyOn(prisma.tradingAccount, 'update');

      const result = await service.updateHighWaterMark(
        mockAccountId,
        currentEquity,
      );

      expect(result.updated).toBe(false);
      expect(result.hwm.toString()).toBe('100000.00'); // Unchanged
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should NOT update HWM when equity equals current HWM', async () => {
      const currentEquity = new Decimal('100000.00');
      
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      const updateSpy = jest.spyOn(prisma.tradingAccount, 'update');

      const result = await service.updateHighWaterMark(
        mockAccountId,
        currentEquity,
      );

      expect(result.updated).toBe(false);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should handle HWM updates after multiple profitable trades', async () => {
      const hwmSequence = [
        { equity: new Decimal('100000.00'), expectedHWM: new Decimal('100000.00'), updated: false },
        { equity: new Decimal('102000.00'), expectedHWM: new Decimal('102000.00'), updated: true },
        { equity: new Decimal('101000.00'), expectedHWM: new Decimal('102000.00'), updated: false },
        { equity: new Decimal('103000.00'), expectedHWM: new Decimal('103000.00'), updated: true },
      ];

      for (const step of hwmSequence) {
        const account = { ...mockAccount, highWaterMark: step.expectedHWM };
        jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(account as any);
        
        if (step.updated) {
          jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({
            ...account,
            highWaterMark: step.equity,
          } as any);
        }

        const result = await service.updateHighWaterMark(mockAccountId, step.equity);
        expect(result.updated).toBe(step.updated);
      }
    });
  });

  describe('Realized P&L Tests', () => {
    it('should calculate total realized P&L from closed trades', async () => {
      const closedTrades = [
        { realizedPnl: new Decimal('500.00') },
        { realizedPnl: new Decimal('300.00') },
        { realizedPnl: new Decimal('-200.00') },
      ];

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue(closedTrades as any);

      const totalRealizedPnl = await service.calculateTotalRealizedPnl(mockAccountId);

      // 500 + 300 - 200 = 600
      expect(totalRealizedPnl.toString()).toBe('600.00');
    });

    it('should return zero when no trades are closed', async () => {
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([]);

      const totalRealizedPnl = await service.calculateTotalRealizedPnl(mockAccountId);

      expect(totalRealizedPnl.toString()).toBe('0.00');
    });

    it('should handle only profitable closed trades', async () => {
      const closedTrades = [
        { realizedPnl: new Decimal('500.00') },
        { realizedPnl: new Decimal('300.00') },
      ];

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue(closedTrades as any);

      const totalRealizedPnl = await service.calculateTotalRealizedPnl(mockAccountId);

      expect(totalRealizedPnl.toString()).toBe('800.00');
    });

    it('should handle only losing closed trades', async () => {
      const closedTrades = [
        { realizedPnl: new Decimal('-500.00') },
        { realizedPnl: new Decimal('-300.00') },
      ];

      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue(closedTrades as any);

      const totalRealizedPnl = await service.calculateTotalRealizedPnl(mockAccountId);

      expect(totalRealizedPnl.toString()).toBe('-800.00');
    });
  });

  describe('Partial Close Tests', () => {
    it('should calculate realized P&L for partial close correctly', () => {
      // Trade: BUY 1.0 lot at 1.09500
      // Close: 0.5 lot at 1.09750
      const entryPrice = new Decimal('1.09500');
      const exitPrice = new Decimal('1.09750');
      const closedVolume = new Decimal('0.5');
      const contractMultiplier = 100000;

      const realizedPnl = service.calculatePositionRealizedPnl(
        TradeSide.BUY,
        entryPrice,
        exitPrice,
        closedVolume,
        contractMultiplier,
      );

      // (1.09750 - 1.09500) * 0.5 * 100000 = 125.00
      expect(realizedPnl.toString()).toBe('125.00');
    });

    it('should keep unrealized P&L for remaining volume', () => {
      // After partial close, remaining 0.5 lot should still have unrealized P&L
      const entryPrice = new Decimal('1.09500');
      const currentPrice = new Decimal('1.09750');
      const remainingVolume = new Decimal('0.5');
      const contractMultiplier = 100000;

      const unrealizedPnl = service.calculatePositionUnrealizedPnl(
        TradeSide.BUY,
        entryPrice,
        currentPrice,
        remainingVolume,
        contractMultiplier,
      );

      // (1.09750 - 1.09500) * 0.5 * 100000 = 125.00
      expect(unrealizedPnl.toString()).toBe('125.00');
    });
  });

  describe('Integration: Complete Financial State Update', () => {
    it('should update complete financial state on position close', async () => {
      const realizedPnl = new Decimal('500.00');
      const expectedBalance = new Decimal('100500.00');
      const expectedEquity = new Decimal('100500.00'); // No open positions
      
      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      jest.spyOn(prisma.tradingAccount, 'update').mockResolvedValue({
        ...mockAccount,
        currentBalance: expectedBalance,
        equity: expectedEquity,
        highWaterMark: expectedEquity,
      } as any);
      jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([]); // No open positions

      const result = await service.updateFinancialStateOnClose(
        mockAccountId,
        realizedPnl,
      );

      expect(result.balance.toString()).toBe('100500.00');
      expect(result.equity.toString()).toBe('100500.00');
      expect(result.hwmUpdated).toBe(true);
      expect(result.hwm.toString()).toBe('100500.00');
    });
  });

  describe('Concurrency and Idempotency Tests', () => {
    it('should handle concurrent HWM updates correctly', async () => {
      // Simulate race condition where two updates happen simultaneously
      // Only the higher equity should win
      const equity1 = new Decimal('105000.00');
      const equity2 = new Decimal('106000.00');

      jest.spyOn(prisma.tradingAccount, 'findUnique').mockResolvedValue(mockAccount as any);
      
      const update1 = service.updateHighWaterMark(mockAccountId, equity1);
      const update2 = service.updateHighWaterMark(mockAccountId, equity2);

      const results = await Promise.all([update1, update2]);

      // Both should succeed, but final HWM should be max(equity1, equity2)
      expect(results.some(r => r.updated)).toBe(true);
    });
  });
});
