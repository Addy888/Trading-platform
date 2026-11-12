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
  source: 'TWELVE_DATA';
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
    // Twelve Data's quote endpoint supplies a last price, not executable bid/ask.
    // Never convert it into a fill price; execution remains unavailable until a
    // licensed bid/ask provider is explicitly integrated.
    return;
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
    if (['INVALID_CREDENTIALS', 'DISABLED'].includes(status.providers.TWELVE_DATA.quoteStatus)) return;
    this.polling = true;
    const updates: MarketTick[] = [];
    let hadFailure = false;
    try {
      for (const symbol of this.symbols) {
        try {
          await this.marketData.getQuote(symbol);
          // Do not manufacture bid/ask from a Twelve Data last price.
          throw new Error(`Twelve Data provides a display price for ${symbol}, not an executable bid/ask quote.`);
        } catch (error) {
          hadFailure = true;
          this.ticks.delete(this.normalize(symbol));
          this.logger.warn(`Twelve Data executable quote unavailable for ${symbol}; no market-price fallback will be used.`);
          const quoteStatus = this.marketData.getProviderStatus().providers.TWELVE_DATA.quoteStatus;
          if ([
            'INVALID_CREDENTIALS',
            'DISABLED',
          ].includes(quoteStatus)) break;
        }
      }
      if (updates.length) {
        this.eventEmitter.emit('market.tick', { ticks: updates, timestamp: new Date(), source: 'TWELVE_DATA' });
      }
    } finally {
      this.polling = false;
      const quoteStatus = this.marketData.getProviderStatus().providers.TWELVE_DATA.quoteStatus;
      if (!['INVALID_CREDENTIALS', 'DISABLED'].includes(quoteStatus)) {
        const serverRetryAfter = this.marketData.getProviderStatus().providers.TWELVE_DATA.retryAfter;
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
