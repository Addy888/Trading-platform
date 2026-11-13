import { applyTick, assertAscending, mergeCandleUpdate, sanitizeCandles, toUnixSeconds } from './candle-sanitize';

describe('candle-sanitize', () => {
  it('sorts, deduplicates unix seconds, and drops invalid OHLC', () => {
    const { candles, dropped } = sanitizeCandles([
      { timestamp: '2026-10-29 12:00:00', open: 1.2, high: 1.3, low: 1.1, close: 1.25 },
      { timestamp: '2026-10-29T10:00:00Z', open: 1.0, high: 1.2, low: 0.9, close: 1.1 },
      { timestamp: '2026-10-29T10:00:00.400Z', open: 1.05, high: 1.22, low: 0.95, close: 1.12 },
      { timestamp: 'bad', open: 1, high: 1, low: 1, close: 1 },
      { timestamp: '2026-10-29T11:00:00Z', open: 1.1, high: 0.5, low: 0.4, close: 1.0 },
    ]);

    expect(dropped).toBe(2);
    expect(candles.map((candle) => candle.time)).toEqual([
      Date.parse('2026-10-29T10:00:00.000Z') / 1000,
      Date.parse('2026-10-29T12:00:00.000Z') / 1000,
    ]);
    expect(candles[0]).toMatchObject({ open: 1.0, close: 1.12, high: 1.22, low: 0.9 });
    expect(() => assertAscending(candles)).not.toThrow();
  });

  it('parses naive UTC timestamps as UTC rather than local time', () => {
    expect(toUnixSeconds('2026-10-29 10:00:00')).toBe(Date.parse('2026-10-29T10:00:00.000Z') / 1000);
  });

  it('never applies an older candle after a newer one', () => {
    const history = [
      { time: 1000, open: 1, high: 1.1, low: 0.9, close: 1.05 },
      { time: 1060, open: 1.05, high: 1.2, low: 1.0, close: 1.1 },
    ];
    expect(mergeCandleUpdate(history, { time: 1000, open: 2, high: 2, low: 2, close: 2 })).toEqual(history);
    const updated = mergeCandleUpdate(history, { time: 1060, open: 1.05, high: 1.3, low: 0.95, close: 1.2 });
    expect(updated.at(-1)).toMatchObject({ open: 1.05, high: 1.3, low: 0.95, close: 1.2 });
  });

  it('aggregates ticks on UTC minute boundaries', () => {
    const first = applyTick([], 1.1, Date.parse('2026-10-29T10:00:10Z'), 60_000);
    const same = applyTick(first, 1.2, Date.parse('2026-10-29T10:00:40Z'), 60_000);
    const next = applyTick(same, 1.15, Date.parse('2026-10-29T10:01:01Z'), 60_000);
    const ignored = applyTick(next, 9, Date.parse('2026-10-29T10:00:50Z'), 60_000);

    expect(same).toHaveLength(1);
    expect(same[0]).toMatchObject({
      time: Date.parse('2026-10-29T10:00:00Z') / 1000,
      open: 1.1,
      high: 1.2,
      low: 1.1,
      close: 1.2,
    });
    expect(next).toHaveLength(2);
    expect(ignored).toEqual(next);
  });
});
