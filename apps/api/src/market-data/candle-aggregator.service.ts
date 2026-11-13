import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TwelveDataPriceUpdate } from './providers/twelve-data/twelve-data-websocket.service';
import { compactForexSymbol, intervalMs } from './forex-symbols';
import { NumericCandle, applyTick } from './candle-sanitize';
import { ForexCandleUpdate } from './forex-feed.interface';

const LIVE_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;

@Injectable()
export class CandleAggregatorService {
  private readonly logger = new Logger(CandleAggregatorService.name);
  private readonly series = new Map<string, NumericCandle[]>();

  constructor(private readonly events: EventEmitter2) {}

  seed(symbol: string, timeframe: string, candles: NumericCandle[]): void {
    const key = this.key(symbol, timeframe);
    this.series.set(key, candles.slice(-2));
  }

  current(symbol: string, timeframe: string): NumericCandle | null {
    return this.series.get(this.key(symbol, timeframe))?.at(-1) ?? null;
  }

  @OnEvent('market.price.update')
  handlePriceUpdate(update: TwelveDataPriceUpdate): void {
    const symbol = compactForexSymbol(update.symbol);
    const providerMs = update.providerTimestamp.getTime();
    if (!Number.isFinite(providerMs) || providerMs <= 0) return;

    for (const timeframe of LIVE_TIMEFRAMES) {
      const key = this.key(symbol, timeframe);
      const history = this.series.get(key) ?? [];
      const next = applyTick(history, update.price, providerMs, intervalMs(timeframe));
      const candle = next.at(-1);
      if (!candle) continue;
      const previous = history.at(-1);
      if (previous && previous.time === candle.time && previous.close === candle.close && previous.high === candle.high && previous.low === candle.low) {
        continue;
      }
      this.series.set(key, next.slice(-8));
      const payload: ForexCandleUpdate = {
        symbol,
        timeframe,
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        providerTimestamp: update.providerTimestamp.toISOString(),
        serverReceivedTimestamp: update.serverReceivedTimestamp.toISOString(),
      };
      this.events.emit('market.candle.update', payload);
      if (timeframe === '1m') {
        this.logger.debug(`1m ${symbol} ${new Date(candle.time * 1000).toISOString()} C=${candle.close}`);
      }
    }
  }

  private key(symbol: string, timeframe: string): string {
    return `${compactForexSymbol(symbol)}:${timeframe}`;
  }
}
