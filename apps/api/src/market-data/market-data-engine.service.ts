import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Decimal from 'decimal.js';
import { MarketDataManagerService } from './market-data-manager.service';

export interface MarketTick {
  symbol: string;
  bid: Decimal;
  ask: Decimal;
  last: Decimal;
  spread: Decimal;
  timestamp: Date;
  source: 'OANDA';
}

export enum MarketStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  STALE = 'STALE',
}

@Injectable()
export class MarketDataEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataEngineService.name);
  private readonly symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
  private readonly pollIntervalMs = Number(process.env.MARKET_DATA_POLLING_INTERVAL || 20000);
  private readonly staleThresholdMs = Number(process.env.MARKET_DATA_STALE_THRESHOLD_MS || 45000);
  private readonly ticks = new Map<string, MarketTick>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private retryDelayMs = this.pollIntervalMs;
  private readonly maxRetryDelayMs = 120000;

  constructor(
    private readonly marketData: MarketDataManagerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    const status = this.marketData.getProviderStatus();
    if (!status.configuration.accountSpecificPricingAvailable ||
        ['INVALID_CREDENTIALS', 'DISABLED', 'ACCOUNT_ID_REQUIRED'].includes(
          status.providers.OANDA.quoteStatus,
        )) return;
    await this.refreshQuotes();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  getTick(symbol: string): MarketTick | null { return this.ticks.get(this.normalize(symbol)) ?? null; }
  getBid(symbol: string): Decimal | null { return this.getTick(symbol)?.bid ?? null; }
  getAsk(symbol: string): Decimal | null { return this.getTick(symbol)?.ask ?? null; }
  getMidPrice(symbol: string): Decimal | null { return this.getTick(symbol)?.last ?? null; }
  getSpread(symbol: string): Decimal | null { return this.getTick(symbol)?.spread ?? null; }

  getMarketStatus(): MarketStatus {
    const ticks = [...this.ticks.values()];
    if (ticks.length === 0) return MarketStatus.DISCONNECTED;
    return ticks.some((tick) => Date.now() - tick.timestamp.getTime() > this.staleThresholdMs)
      ? MarketStatus.STALE
      : MarketStatus.CONNECTED;
  }

  isMarketAvailable(symbol: string): boolean {
    const tick = this.getTick(symbol);
    return Boolean(tick && Date.now() - tick.timestamp.getTime() <= this.staleThresholdMs);
  }

  getAllTicks(): MarketTick[] { return [...this.ticks.values()]; }
  getSupportedSymbols(): string[] { return [...this.symbols]; }
  isSymbolSupported(symbol: string): boolean { return this.symbols.includes(this.normalize(symbol)); }
  getProviderStatus() { return this.marketData.getProviderStatus(); }

  private async refreshQuotes(): Promise<void> {
    if (this.polling) return;
    const status = this.marketData.getProviderStatus();
    if (!status.configuration.accountSpecificPricingAvailable ||
        ['INVALID_CREDENTIALS', 'DISABLED', 'ACCOUNT_ID_REQUIRED', 'ACCOUNT_ACCESS_DENIED'].includes(
          status.providers.OANDA.quoteStatus,
        )) return;
    this.polling = true;
    const updates: MarketTick[] = [];
    let hadFailure = false;
    try {
      for (const symbol of this.symbols) {
        try {
          const quote = await this.marketData.getQuote(symbol);
          const bid = new Decimal(quote.bid);
          const ask = new Decimal(quote.ask);
          if (!bid.isFinite() || !ask.isFinite() || bid.lte(0) || ask.lt(bid)) {
            throw new Error(`OANDA returned an invalid bid/ask quote for ${symbol}.`);
          }
          const tick: MarketTick = {
            symbol,
            bid,
            ask,
            last: bid.plus(ask).dividedBy(2),
            spread: ask.minus(bid),
            timestamp: new Date(quote.timestamp),
            source: 'OANDA',
          };
          if (Number.isNaN(tick.timestamp.getTime())) {
            throw new Error(`OANDA returned an invalid quote timestamp for ${symbol}.`);
          }
          this.ticks.set(symbol, tick);
          updates.push(tick);
        } catch (error) {
          hadFailure = true;
          this.ticks.delete(this.normalize(symbol));
          this.logger.warn(`OANDA quote unavailable for ${symbol}; no market-price fallback will be used.`);
          const quoteStatus = this.marketData.getProviderStatus().providers.OANDA.quoteStatus;
          if ([
            'INVALID_CREDENTIALS',
            'ACCOUNT_ACCESS_DENIED',
            'ACCOUNT_ID_REQUIRED',
            'DISABLED',
          ].includes(quoteStatus)) break;
        }
      }
      if (updates.length) {
        this.eventEmitter.emit('market.tick', { ticks: updates, timestamp: new Date(), source: 'OANDA' });
      }
    } finally {
      this.polling = false;
      const quoteStatus = this.marketData.getProviderStatus().providers.OANDA.quoteStatus;
      if (!['INVALID_CREDENTIALS', 'ACCOUNT_ACCESS_DENIED', 'DISABLED', 'ACCOUNT_ID_REQUIRED'].includes(quoteStatus)) {
        const serverRetryAfter = this.marketData.getProviderStatus().providers.OANDA.retryAfter;
        this.retryDelayMs = hadFailure
          ? Math.max(
              Math.min(Math.max(this.pollIntervalMs, this.retryDelayMs * 2), this.maxRetryDelayMs),
              serverRetryAfter ? Math.min(this.maxRetryDelayMs, serverRetryAfter - Date.now()) : 0,
            )
          : this.pollIntervalMs;
        this.timer = setTimeout(() => void this.refreshQuotes(), this.retryDelayMs);
      }
    }
  }

  private normalize(symbol: string): string {
    return symbol.toUpperCase().replace('/', '').replace('_', '');
  }
}
