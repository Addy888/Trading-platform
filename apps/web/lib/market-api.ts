const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const AUTH_TOKEN_REFRESHED_EVENT = 'app:auth-token-refreshed';
const AUTH_SESSION_EXPIRED_EVENT = 'app:auth-session-expired';
let refreshAccessTokenRequest: Promise<string | null> | null = null;

export class MarketDataError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAfterMs?: number, readonly category?: string) { super(message); this.name = 'MarketDataError'; }
}
export interface MarketCandle { timestamp: string; open: string; high: string; low: string; close: string; volume?: number; }
export type MarketAssetType = 'FOREX' | 'CRYPTO' | 'COMMODITY' | 'STOCK' | 'OTHER';
export type DataStatus = 'LIVE' | 'DELAYED' | 'STALE';
export interface CandleMetadata {
  latestCandleTimestamp: string | null;
  dataStatus: DataStatus;
  ageMinutes: number;
  serverTimestamp: string;
}
export interface MarketInstrument {
  symbol: string;
  name: string;
  assetType: MarketAssetType;
  exchange: string | null;
  exchangeCode: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  source: 'TWELVE_DATA' | 'TRADING_CONFIG';
}
export interface MarketExchange {
  name: string;
  displayName: string;
  code: string | null;
  marketType: 'STOCK' | 'CRYPTO';
  country: string | null;
  timezone: string | null;
  source: 'TWELVE_DATA';
  marketStatus: null;
  tradingHours: null;
  dataClassification: string;
}
interface ApiResponse { success?: boolean; provider?: string; category?: string; message?: string; error?: string; retryAfterMs?: number; retryable?: boolean; [key: string]: unknown; }

async function requestMarket<T>(url: string, token: string): Promise<T> {
  if (typeof window !== 'undefined') token = window.localStorage.getItem('accessToken') || token;
  let response: Response;
  try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); }
  catch { throw new MarketDataError('NETWORK: Market data is temporarily unavailable.', true, undefined, 'NETWORK'); }
  let data: ApiResponse;
  try { data = await response.json(); }
  catch { throw new MarketDataError('PROVIDER: Market data returned an unreadable response.', true, undefined, 'PROVIDER'); }
  if (response.status === 401 && !data.category) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new MarketDataError('SESSION_EXPIRED: Please sign in again.', false, undefined, 'SESSION_EXPIRED');
    try { response = await fetch(url, { headers: { Authorization: `Bearer ${refreshed}` } }); data = await response.json(); }
    catch { throw new MarketDataError('NETWORK: Market data is temporarily unavailable.', true, undefined, 'NETWORK'); }
  }
  if (!response.ok || data.success === false) {
    const message = typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : 'Market data is temporarily unavailable.';
    const category = typeof data.category === 'string' ? data.category : 'PROVIDER';
    throw new MarketDataError(`${category}: ${message}`, Boolean(data.retryable), data.retryAfterMs, category);
  }
  return data as T;
}
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshAccessTokenRequest) refreshAccessTokenRequest = (async () => {
    if (typeof window === 'undefined') return null;
    const refreshToken = window.localStorage.getItem('refreshToken');
    if (!refreshToken) { window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT)); return null; }
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
      const data = await response.json() as { accessToken?: string; refreshToken?: string };
      if (!response.ok || !data.accessToken || !data.refreshToken) throw new Error();
      window.localStorage.setItem('accessToken', data.accessToken); window.localStorage.setItem('refreshToken', data.refreshToken);
      window.dispatchEvent(new CustomEvent(AUTH_TOKEN_REFRESHED_EVENT, { detail: data.accessToken })); return data.accessToken;
    } catch { window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT)); return null; }
  })().finally(() => { refreshAccessTokenRequest = null; });
  return refreshAccessTokenRequest;
}

export const marketApi = {
  getStatus: (token: string) => requestMarket<{ primaryProvider: 'TWELVE_DATA'; configuration: { configured: boolean; missingVariables: string[]; apiBaseUrl: string; pollingIntervalMs: number; staleThresholdMs: number; streamingMode: 'POLLING' }; lastUpdateAt: string | null; candleLastSuccessAt: string | null; quoteLastSuccessAt: string | null; providers: { TWELVE_DATA: { status: string; lastError: string | null; candleLastSuccessAt: string | null; quoteStatus: string; quoteLastError: string | null; quoteLastSuccessAt: string | null; retryAfter: number | null; streamingMode: 'POLLING' } } }>(`${API_BASE_URL}/market/status`, token),
  getCandles: (token: string, symbol: string, interval: string, outputsize = 100, exchange?: string) => {
    const query = new URLSearchParams({ symbol, interval, outputsize: String(outputsize) });
    if (exchange) query.set('exchange', exchange);
    return requestMarket<{ success: true; provider: 'TWELVE_DATA'; symbol: string; interval: string; count: number; candles: MarketCandle[]; metadata: CandleMetadata }>(`${API_BASE_URL}/market/candles?${query}`, token);
  },
  getQuote: (token: string, symbol: string, exchange?: string) => {
    const query = new URLSearchParams({ symbol });
    if (exchange) query.set('exchange', exchange);
    return requestMarket<{ success: true; provider: 'TWELVE_DATA'; servedAt?: string; timestamp?: string; quote: { symbol: string; price: string; close: string; change?: string; percentChange?: string; timestamp: string; fetchedAt?: string } }>(`${API_BASE_URL}/market/quote?${query}`, token);
  },
  getInstruments: async (token: string) => (await requestMarket<{ provider: 'TWELVE_DATA'; instruments: string[] }>(`${API_BASE_URL}/market/instruments`, token)).instruments,
  getExchanges: (token: string, options: { query?: string; type?: 'ALL' | 'STOCK' | 'CRYPTO'; page?: number; limit?: number } = {}) => {
    const query = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
    return requestMarket<{ provider: 'TWELVE_DATA'; exchanges: MarketExchange[]; pagination: { page: number; limit: number; total: number; totalPages: number }; limitations: string[] }>(`${API_BASE_URL}/market/exchanges?${query}`, token);
  },
  searchInstruments: (token: string, options: { query: string; type?: MarketAssetType | 'ALL'; exchange?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
    return requestMarket<{ provider: 'TWELVE_DATA'; instruments: MarketInstrument[]; pagination: { page: number; limit: number; returned: number; total: number; providerResultCap: number; refineQueryWhenExhausted: boolean; hasMore: boolean }; limitations: string[] }>(`${API_BASE_URL}/market/instruments/search?${query}`, token);
  },
  getInstrumentDetails: (token: string, symbol: string, exchange?: string) => {
    const query = new URLSearchParams({ symbol });
    if (exchange) query.set('exchange', exchange);
    return requestMarket<{ provider: 'TWELVE_DATA'; instrument: MarketInstrument }>(`${API_BASE_URL}/market/instruments/details?${query}`, token);
  },
  getExchangeMarketState: (token: string, exchange: string) => requestMarket<{ provider: 'TWELVE_DATA'; exchange: string; markets: Array<{ name: string; code: string | null; country: string | null; isOpen: boolean; timeToOpen: string | null; timeToClose: string | null; timeAfterOpen: string | null; source: 'TWELVE_DATA' }> }>(`${API_BASE_URL}/market/exchanges/${encodeURIComponent(exchange)}/status`, token),
  getExchangeSchedule: (token: string, exchange: string) => requestMarket<{ provider: 'TWELVE_DATA'; exchange: string; schedule: unknown }>(`${API_BASE_URL}/market/exchanges/${encodeURIComponent(exchange)}/schedule`, token),
};
