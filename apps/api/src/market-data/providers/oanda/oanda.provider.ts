import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';

export type OandaErrorCategory =
  | 'NOT_CONFIGURED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_ACCESS'
  | 'ACCOUNT_ID_REQUIRED'
  | 'INSTRUMENT_UNAVAILABLE'
  | 'UNSUPPORTED_INTERVAL'
  | 'RATE_LIMITED'
  | 'EMPTY_CANDLES'
  | 'NETWORK'
  | 'PROVIDER';

export class OandaApiError extends Error {
  constructor(
    readonly category: OandaErrorCategory,
    message: string,
    readonly retryAfterMs = 0,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'OandaApiError';
  }
}

export interface OandaCandleData {
  timestamp: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume?: number;
}

@Injectable()
export class OandaProvider {
  private readonly logger = new Logger(OandaProvider.name);
  private readonly token: string;
  private readonly accountId: string;
  private readonly baseUrl: string;
  private readonly environment: 'practice' | 'live';
  private readonly missingVariables: string[];
  private readonly instruments = new Map<string, boolean>();
  private availableInstruments: string[] | null = null;
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();
  private readonly minRequestGapMs = 100;

  constructor() {
    this.token = (process.env.OANDA_API_TOKEN || '').trim();
    this.accountId = (process.env.OANDA_ACCOUNT_ID || '').trim();
    const requested = (process.env.OANDA_ENVIRONMENT || 'practice').trim().toLowerCase();
    if (requested !== 'practice' && requested !== 'live') {
      throw new Error('OANDA_ENVIRONMENT must be either "practice" or "live".');
    }
    this.environment = requested;
    this.baseUrl = this.environment === 'live'
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com';
    this.missingVariables = this.token ? [] : ['OANDA_API_TOKEN'];
    if (!this.token) {
      this.logger.warn('OANDA candle data is disabled: missing OANDA_API_TOKEN.');
    } else if (!this.accountId) {
      this.logger.warn('OANDA candles are configured; account-specific instruments and bid/ask quotes require OANDA_ACCOUNT_ID.');
    }
  }

  isConfigured(): boolean { return Boolean(this.token); }
  getEnvironment(): string { return this.environment; }
  getConfigurationStatus() {
    return {
      configured: this.isConfigured(),
      missingVariables: [...this.missingVariables],
      accountIdConfigured: Boolean(this.accountId),
      accountSpecificPricingAvailable: Boolean(this.accountId),
      environment: this.environment,
      apiBaseUrl: this.baseUrl,
    };
  }

  async validateCredentials(): Promise<void> {
    const response = await this.request('/v3/instruments/EUR_USD/candles?granularity=H1&count=10');
    if (!Array.isArray(response?.candles)) {
      throw new OandaApiError('PROVIDER', 'OANDA returned an invalid credential-validation response.');
    }
  }

  async getAvailableInstruments(): Promise<string[]> {
    this.requireAccountId();
    if (this.availableInstruments) return this.availableInstruments;
    const response = await this.request(`/v3/accounts/${encodeURIComponent(this.accountId)}/instruments`);
    if (!Array.isArray(response?.instruments)) {
      throw new OandaApiError('PROVIDER', 'OANDA returned an invalid instrument list.');
    }
    this.availableInstruments = response.instruments
      .map((item: { name?: unknown }) => typeof item.name === 'string' ? item.name : '')
      .filter(Boolean);
    return this.availableInstruments;
  }

  async getQuote(symbol: string): Promise<{
    symbol: string;
    price: string;
    close: string;
    bid: string;
    ask: string;
    spread: string;
    timestamp: string;
    datetime: string;
    provider: 'OANDA';
  }> {
    this.requireAccountId();
    const instrument = await this.requireInstrument(symbol);
    const response = await this.request(`/v3/accounts/${encodeURIComponent(this.accountId)}/pricing?instruments=${encodeURIComponent(instrument)}`);
    const price = response?.prices?.[0];
    const bid = price?.bids?.[0]?.price ?? price?.closeoutBid;
    const ask = price?.asks?.[0]?.price ?? price?.closeoutAsk;
    if (!price || typeof bid !== 'string' || typeof ask !== 'string') {
      throw new OandaApiError('PROVIDER', `OANDA returned no usable bid/ask quote for ${instrument}.`);
    }
    let bidValue: Decimal;
    let askValue: Decimal;
    try {
      bidValue = new Decimal(bid);
      askValue = new Decimal(ask);
    } catch {
      throw new OandaApiError('PROVIDER', `OANDA returned an invalid bid/ask quote for ${instrument}.`);
    }
    if (!bidValue.isFinite() || !askValue.isFinite() || bidValue.lte(0) || askValue.lt(bidValue)) {
      throw new OandaApiError('PROVIDER', `OANDA returned an invalid bid/ask quote for ${instrument}.`);
    }
    const mid = bidValue.plus(askValue).dividedBy(2);
    return {
      symbol: instrument,
      price: mid.toString(),
      close: mid.toString(),
      bid: bidValue.toString(),
      ask: askValue.toString(),
      spread: askValue.minus(bidValue).toString(),
      timestamp: price.time,
      datetime: price.time,
      provider: 'OANDA',
    };
  }

  async getTimeSeries(symbol: string, interval: string, count = 100): Promise<OandaCandleData[]> {
    const instrument = this.toInstrument(symbol);
    const granularity = this.toGranularity(interval);
    const safeCount = Math.max(1, Math.min(Number.isFinite(count) ? Math.floor(count) : 100, 5000));
    const response = await this.request(`/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=${granularity}&count=${safeCount}&price=M`);
    if (!Array.isArray(response?.candles)) {
      throw new OandaApiError('PROVIDER', `OANDA returned an invalid candle response for ${instrument}.`);
    }
    const candles: OandaCandleData[] = [];
    for (const candle of response.candles) {
      const mid = candle?.mid;
      const timestamp = new Date(candle?.time);
      let values: Decimal[];
      try {
        values = [mid?.o, mid?.h, mid?.l, mid?.c].map((value) => new Decimal(value));
      } catch {
        continue;
      }
      if (!candle?.complete || Number.isNaN(timestamp.getTime()) ||
          values.some((value) => !value.isFinite()) ||
          values[1].lt(values[2]) || values[1].lt(values[0]) ||
          values[1].lt(values[3]) || values[2].gt(values[0]) ||
          values[2].gt(values[3])) continue;
      candles.push({
        timestamp,
        open: values[0],
        high: values[1],
        low: values[2],
        close: values[3],
        volume: Number.isFinite(candle.volume) ? candle.volume : undefined,
      });
    }
    candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    if (!candles.length) {
      throw new OandaApiError('EMPTY_CANDLES', `OANDA returned no complete candles for ${instrument} (${granularity}).`);
    }
    return candles;
  }

  private async requireInstrument(symbol: string): Promise<string> {
    this.requireAccountId();
    const instrument = this.toInstrument(symbol);
    if (this.instruments.get(instrument) === true) return instrument;
    if (this.instruments.get(instrument) === false) {
      throw new OandaApiError('INSTRUMENT_UNAVAILABLE', `OANDA instrument ${instrument} is unavailable for this account.`);
    }
    const response = await this.request(`/v3/accounts/${encodeURIComponent(this.accountId)}/instruments?instruments=${encodeURIComponent(instrument)}`);
    const supported = Array.isArray(response?.instruments) &&
      response.instruments.some((entry: { name?: string }) => entry.name === instrument);
    this.instruments.set(instrument, supported);
    if (!supported) {
      throw new OandaApiError('INSTRUMENT_UNAVAILABLE', `OANDA instrument ${instrument} is unavailable for this account.`);
    }
    return instrument;
  }

  private requireAccountId(): void {
    if (!this.accountId) {
      throw new OandaApiError(
        'ACCOUNT_ID_REQUIRED',
        'OANDA_ACCOUNT_ID is required for account-specific instruments and bid/ask pricing. Candle data does not require it.',
      );
    }
  }

  private toInstrument(symbol: string): string {
    const raw = symbol.trim().toUpperCase().replace(/^OANDA:/, '').replace('/', '_');
    const normalized = /^[A-Z]{6}$/.test(raw) ? `${raw.slice(0, 3)}_${raw.slice(3)}` : raw;
    if (!/^[A-Z]{3}_[A-Z]{3}$/.test(normalized)) {
      throw new OandaApiError('INSTRUMENT_UNAVAILABLE', `OANDA instrument is unsupported: ${symbol}.`);
    }
    return normalized;
  }

  private toGranularity(interval: string): string {
    const map: Record<string, string> = {
      '1m': 'M1', '1min': 'M1', 'm1': 'M1',
      '5m': 'M5', '5min': 'M5', 'm5': 'M5',
      '10m': 'M10', '10min': 'M10', 'm10': 'M10',
      '15m': 'M15', '15min': 'M15', 'm15': 'M15',
      '30m': 'M30', '30min': 'M30', 'm30': 'M30',
      '1h': 'H1', '1hour': 'H1', 'h1': 'H1',
      '4h': 'H4', 'h4': 'H4',
      '1d': 'D', '1day': 'D', 'd': 'D',
    };
    const granularity = map[interval.trim().toLowerCase()];
    if (!granularity) {
      throw new OandaApiError('UNSUPPORTED_INTERVAL', `Unsupported OANDA candle interval: ${interval}.`);
    }
    return granularity;
  }

  private async request(path: string): Promise<any> {
    if (!this.token) {
      throw new OandaApiError('NOT_CONFIGURED', 'OANDA_API_TOKEN is required for market data.');
    }
    const previousRequest = this.requestQueue;
    let releaseRequest!: () => void;
    this.requestQueue = new Promise<void>((resolve) => { releaseRequest = resolve; });
    await previousRequest;
    try {
      const delay = this.minRequestGapMs - (Date.now() - this.lastRequestAt);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.lastRequestAt = Date.now();
    } finally {
      releaseRequest();
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new OandaApiError('NETWORK', 'Unable to reach the selected OANDA environment.');
    }
    if (!response.ok) {
      const upstreamMessage = await this.getSanitizedErrorMessage(response);
      if (response.status === 401) {
        throw new OandaApiError(
          'INVALID_CREDENTIALS',
          `OANDA rejected the token (HTTP 401)${upstreamMessage ? `: ${upstreamMessage}` : '. Confirm it belongs to the selected environment.'}`,
          0,
          response.status,
        );
      }
      if (response.status === 403) {
        throw new OandaApiError(
          'ACCOUNT_ACCESS',
          `OANDA denied access (HTTP 403)${upstreamMessage ? `: ${upstreamMessage}` : ' to this account. Verify account ownership and environment.'}`,
          0,
          response.status,
        );
      }
      if (response.status === 404 && path.startsWith(`/v3/accounts/${encodeURIComponent(this.accountId)}/`)) {
        throw new OandaApiError(
          'ACCOUNT_ACCESS',
          `OANDA could not find the configured account (HTTP 404)${upstreamMessage ? `: ${upstreamMessage}` : ' in the selected environment.'}`,
          0,
          response.status,
        );
      }
      if ((response.status === 400 || response.status === 404) && path.startsWith('/v3/instruments/')) {
        throw new OandaApiError(
          'INSTRUMENT_UNAVAILABLE',
          `OANDA instrument request failed (HTTP ${response.status})${upstreamMessage ? `: ${upstreamMessage}` : ' for the selected environment.'}`,
          0,
          response.status,
        );
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter
          ? Number.isFinite(Number(retryAfter))
            ? Math.max(1000, Number(retryAfter) * 1000)
            : Math.max(1000, Date.parse(retryAfter) - Date.now())
          : 60000;
        throw new OandaApiError('RATE_LIMITED', 'OANDA rate limited the request.', retryAfterMs, response.status);
      }
      if (response.status >= 500) {
        throw new OandaApiError(
          'NETWORK',
          `OANDA service returned HTTP ${response.status}${upstreamMessage ? `: ${upstreamMessage}` : '.'}`,
          0,
          response.status,
        );
      }
      throw new OandaApiError(
        'PROVIDER',
        `OANDA rejected the request (HTTP ${response.status})${upstreamMessage ? `: ${upstreamMessage}` : '.'}`,
        0,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new OandaApiError('PROVIDER', `OANDA returned an unreadable response (HTTP ${response.status}).`, 0, response.status);
    }
  }

  private async getSanitizedErrorMessage(response: Response): Promise<string | undefined> {
    try {
      const body = await response.clone().json() as Record<string, unknown>;
      const message = [body.errorMessage, body.message, body.error]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      if (!message) return undefined;
      return message
        .replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [REDACTED]')
        .replace(this.token, '[REDACTED]')
        .replace(/[\r\n\t]+/g, ' ')
        .slice(0, 300);
    } catch {
      return undefined;
    }
  }
}
