export interface NumericCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SanitizeResult {
  candles: NumericCandle[];
  dropped: number;
}

function isValidUnixSeconds(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 && value < 4_102_444_800;
}

function isValidOhlc(open: number, high: number, low: number, close: number): boolean {
  if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) {
    return false;
  }
  const maxPrice = Math.max(open, close, low);
  const minPrice = Math.min(open, close, high);
  return high >= maxPrice && low <= minPrice && high >= low;
}

export function toUnixSeconds(timestamp: Date | string | number): number | null {
  let ms: number;
  if (timestamp instanceof Date) {
    ms = timestamp.getTime();
  } else if (typeof timestamp === 'number') {
    ms = Math.abs(timestamp) < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  } else {
    const text = String(timestamp).trim().replace(' ', 'T');
    const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(String(timestamp).trim());
    ms = Date.parse(hasTimezone ? text : `${text}Z`);
  }
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const seconds = Math.floor(ms / 1000);
  return isValidUnixSeconds(seconds) ? seconds : null;
}

export function sanitizeCandles(
  raw: Array<{ time?: number; timestamp?: Date | string | number; open: unknown; high: unknown; low: unknown; close: unknown; volume?: unknown }>,
): SanitizeResult {
  const byTime = new Map<number, NumericCandle>();
  let dropped = 0;

  for (const candle of raw) {
    const time = candle.time !== undefined && Number.isFinite(candle.time)
      ? Math.floor(Number(candle.time))
      : toUnixSeconds(candle.timestamp as Date | string | number);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    if (time === null || !isValidUnixSeconds(time) || !isValidOhlc(open, high, low, close)) {
      dropped += 1;
      continue;
    }
    const volumeNumber = Number(candle.volume);
    const next: NumericCandle = {
      time,
      open,
      high,
      low,
      close,
      ...(Number.isFinite(volumeNumber) && volumeNumber >= 0 ? { volume: volumeNumber } : {}),
    };
    const existing = byTime.get(time);
    if (!existing) {
      byTime.set(time, next);
      continue;
    }
    byTime.set(time, {
      time,
      open: existing.open,
      high: Math.max(existing.high, next.high),
      low: Math.min(existing.low, next.low),
      close: next.close,
      volume: existing.volume !== undefined || next.volume !== undefined
        ? (existing.volume || 0) + (next.volume || 0)
        : undefined,
    });
  }

  const candles = Array.from(byTime.values()).sort((left, right) => left.time - right.time);
  return { candles, dropped };
}

export function mergeCandleUpdate(
  history: NumericCandle[],
  update: NumericCandle,
): NumericCandle[] {
  if (!isValidUnixSeconds(update.time) || !isValidOhlc(update.open, update.high, update.low, update.close)) {
    return history;
  }
  const last = history.at(-1);
  if (!last) return [update];
  if (update.time < last.time) return history;
  if (update.time === last.time) {
    return [
      ...history.slice(0, -1),
      {
        time: last.time,
        open: last.open,
        high: Math.max(last.high, update.high),
        low: Math.min(last.low, update.low),
        close: update.close,
      },
    ];
  }
  return [...history, update];
}

export function applyTick(
  history: NumericCandle[],
  price: number,
  providerTimestampMs: number,
  intervalMilliseconds: number,
): NumericCandle[] {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(providerTimestampMs) || providerTimestampMs <= 0) {
    return history;
  }
  const bucketMs = Math.floor(providerTimestampMs / intervalMilliseconds) * intervalMilliseconds;
  const time = Math.floor(bucketMs / 1000);
  const last = history.at(-1);
  if (last && time < last.time) return history;
  if (last && time === last.time) {
    return mergeCandleUpdate(history, {
      time,
      open: last.open,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    });
  }
  return mergeCandleUpdate(history, { time, open: price, high: price, low: price, close: price });
}

export function assertAscending(candles: NumericCandle[]): void {
  for (let index = 1; index < candles.length; index++) {
    if (candles[index].time <= candles[index - 1].time) {
      throw new Error(`Candles are not strictly ascending at index ${index}`);
    }
  }
}
