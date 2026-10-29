import { ServiceUnavailableException } from '@nestjs/common';
import { TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';
import { MarketDataEngineService } from './market-data-engine.service';
import { MarketPriceService } from './market-price.service';

describe('MarketPriceService', () => {
  const marketData = {
    isMarketAvailable: jest.fn(),
    getBid: jest.fn(),
    getAsk: jest.fn(),
    getMidPrice: jest.fn(),
  };
  let service: MarketPriceService;

  beforeEach(() => {
    jest.clearAllMocks();
    marketData.isMarketAvailable.mockReturnValue(true);
    marketData.getBid.mockReturnValue(new Decimal('1.0998'));
    marketData.getAsk.mockReturnValue(new Decimal('1.1002'));
    marketData.getMidPrice.mockReturnValue(new Decimal('1.1000'));
    service = new MarketPriceService(marketData as unknown as MarketDataEngineService);
  });

  it('uses ask for BUY entries and bid for SELL entries', () => {
    expect(service.getEntryPrice('EURUSD', TradeSide.BUY).toString()).toBe('1.1002');
    expect(service.getEntryPrice('EURUSD', TradeSide.SELL).toString()).toBe('1.0998');
  });

  it('uses bid for BUY close valuation and ask for SELL close valuation', () => {
    expect(service.getExitPrice('EURUSD', TradeSide.BUY).toString()).toBe('1.0998');
    expect(service.getExitPrice('EURUSD', TradeSide.SELL).toString()).toBe('1.1002');
  });

  it('does not return stale market prices as current valuations', () => {
    marketData.isMarketAvailable.mockReturnValue(false);

    expect(service.getAvailableExitPrice('EURUSD', TradeSide.BUY)).toBeNull();
    expect(() => service.getEntryPrice('EURUSD', TradeSide.BUY))
      .toThrow(ServiceUnavailableException);
    expect(() => service.getExitPrice('EURUSD', TradeSide.SELL))
      .toThrow(ServiceUnavailableException);
  });
});
