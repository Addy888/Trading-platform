import { EventEmitter2 } from '@nestjs/event-emitter';
import { CandleAggregatorService } from './candle-aggregator.service';

describe('CandleAggregatorService', () => {
  it('emits a 1-minute candle from a genuine provider tick without fabricating volume', () => {
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    const aggregator = new CandleAggregatorService(events);

    aggregator.handlePriceUpdate({
      symbol: 'EUR/USD',
      price: 1.08512,
      providerTimestamp: new Date('2026-10-29T10:00:12.000Z'),
      serverReceivedTimestamp: new Date('2026-10-29T10:00:12.080Z'),
    });

    const candleEvents = (events.emit as jest.Mock).mock.calls.filter((call) => call[0] === 'market.candle.update');
    const oneMinute = candleEvents.find((call) => call[1].timeframe === '1m')[1];
    expect(oneMinute).toMatchObject({
      symbol: 'EURUSD',
      timeframe: '1m',
      time: Date.parse('2026-10-29T10:00:00.000Z') / 1000,
      open: 1.08512,
      close: 1.08512,
    });
    expect(oneMinute.volume).toBeUndefined();
  });
});
