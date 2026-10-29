import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradeSide, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MinTradingDaysService } from '../risk-engine/min-trading-days.service';
import { MarketPriceService } from '../market-data/market-price.service';
import { PrismaService } from '../prisma/prisma.service';
import { RuleEvaluatorService } from '../rule-evaluator/rule-evaluator.service';
import { TradingEngineService } from './trading-engine.service';

describe('TradingEngineService.getOpenPositions', () => {
  let service: TradingEngineService;
  let prisma: {
    tradingAccount: { findUnique: jest.Mock };
    trade: { findMany: jest.Mock };
  };
  let marketPrice: { getAvailableExitPrice: jest.Mock; getPriceSource: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tradingAccount: { findUnique: jest.fn() },
      trade: { findMany: jest.fn() },
    };
    marketPrice = {
      getAvailableExitPrice: jest.fn().mockReturnValue(null),
      getPriceSource: jest.fn().mockReturnValue('OANDA'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: MarketPriceService, useValue: marketPrice },
        {
          provide: InstrumentConfigService,
          useValue: {
            getInstrument: jest.fn().mockReturnValue({ contractMultiplier: 100000 }),
          },
        },
        { provide: RuleEvaluatorService, useValue: {} },
        { provide: AccountSnapshotsService, useValue: {} },
        { provide: MinTradingDaysService, useValue: {} },
        { provide: EventEmitter2, useValue: {} },
      ],
    }).compile();

    service = module.get(TradingEngineService);
  });

  it('returns owned positions without inventing prices when OANDA has no quote', async () => {
    prisma.tradingAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      userId: 'user-1',
    });
    prisma.trade.findMany.mockResolvedValue([
      {
        id: 'trade-1',
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: new Decimal(1),
        entryPrice: new Decimal('1.0850'),
        stopLoss: null,
        takeProfit: null,
        openedAt: new Date('2025-01-01T00:00:00Z'),
      },
    ]);

    const positions = await service.getOpenPositions('account-1', 'user-1');

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      entryPrice: '1.085',
      currentPrice: null,
      unrealizedPnl: null,
      priceSource: null,
    });
    expect(marketPrice.getPriceSource).not.toHaveBeenCalled();
  });

  it('values BUY at bid and SELL at ask when genuine quotes are available', async () => {
    prisma.tradingAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      userId: 'user-1',
    });
    prisma.trade.findMany.mockResolvedValue([
      {
        id: 'buy-trade',
        symbol: 'EURUSD',
        side: TradeSide.BUY,
        volume: new Decimal(1),
        entryPrice: new Decimal('1.08'),
        stopLoss: null,
        takeProfit: null,
        openedAt: new Date('2025-01-01T00:00:00Z'),
      },
      {
        id: 'sell-trade',
        symbol: 'GBPUSD',
        side: TradeSide.SELL,
        volume: new Decimal(1),
        entryPrice: new Decimal('1.10'),
        stopLoss: null,
        takeProfit: null,
        openedAt: new Date('2025-01-01T00:00:00Z'),
      },
    ]);
    marketPrice.getAvailableExitPrice
      .mockReturnValueOnce(new Decimal('1.09'))
      .mockReturnValueOnce(new Decimal('1.09'));

    const positions = await service.getOpenPositions('account-1', 'user-1');

    expect(positions.map(({ currentPrice, unrealizedPnl }) => ({ currentPrice, unrealizedPnl }))).toEqual([
      { currentPrice: '1.09', unrealizedPnl: '1000.00' },
      { currentPrice: '1.09', unrealizedPnl: '1000.00' },
    ]);
    expect(marketPrice.getAvailableExitPrice).toHaveBeenNthCalledWith(1, 'EURUSD', TradeSide.BUY);
    expect(marketPrice.getAvailableExitPrice).toHaveBeenNthCalledWith(2, 'GBPUSD', TradeSide.SELL);
    expect(positions.every((position) => position.priceSource === 'OANDA')).toBe(true);
  });

  it('continues to enforce account ownership before returning positions', async () => {
    prisma.tradingAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      userId: 'owner',
    });

    await expect(
      service.getOpenPositions('account-1', 'another-user'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.trade.findMany).not.toHaveBeenCalled();
  });
});
