const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const AUTH_TOKEN_REFRESHED_EVENT = 'app:auth-token-refreshed';
const AUTH_SESSION_EXPIRED_EVENT = 'app:auth-session-expired';

let refreshAccessTokenRequest: Promise<string | null> | null = null;

export class OandaMarketDataError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
    readonly category?: string,
  ) {
    super(message);
    this.name = 'OandaMarketDataError';
  }
}

export interface OandaCandle {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: number;
}

interface ApiResponse {
  success?: boolean;
  provider?: string;
  category?: string;
  message?: string;
  error?: string;
  retryAfterMs?: number;
  retryable?: boolean;
  [key: string]: unknown;
}

async function requestOanda<T>(url: string, token: string): Promise<T> {
  if (typeof window !== 'undefined') {
    token = window.localStorage.getItem('accessToken') || token;
  }
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new OandaMarketDataError(
      'NETWORK: OANDA market data is temporarily unavailable. Please retry later.',
      true,
      undefined,
      'NETWORK',
    );
  }
  let data: ApiResponse;
  try {
    data = await response.json();
  } catch {
    throw new OandaMarketDataError(
      'PROVIDER: OANDA market data returned an unreadable response. Please retry later.',
      true,
      undefined,
      'PROVIDER',
    );
  }
  if (response.status === 401 && !isOandaProviderError(data)) {
    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
      throw new OandaMarketDataError(
        'SESSION_EXPIRED: Your session expired. Please sign in again.',
        false,
        undefined,
        'SESSION_EXPIRED',
      );
    }

    try {
      response = await fetch(url, authorizationOptions(refreshedToken));
      data = await response.json();
    } catch {
      throw new OandaMarketDataError(
        'NETWORK: OANDA market data is temporarily unavailable. Please retry later.',
        true,
        undefined,
        'NETWORK',
      );
    }
  }
  if (!response.ok || data.success === false) {
    const message = typeof data.message === 'string'
      ? data.message
      : typeof data.error === 'string'
        ? data.error
        : 'OANDA market data is temporarily unavailable. Please retry later.';
    const category = typeof data.category === 'string' ? data.category : 'PROVIDER';
    const retryGuidance = data.retryAfterMs
      ? ` Retry after ${Math.ceil(data.retryAfterMs / 1000)} seconds.`
      : data.retryable ? ' Please retry later.' : '';
    throw new OandaMarketDataError(
      `${category}: ${message}${retryGuidance}`,
      Boolean(data.retryable),
      data.retryAfterMs,
      category,
    );
  }
  return data as T;
}

function authorizationOptions(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function isOandaProviderError(data: ApiResponse): boolean {
  return data?.provider === 'OANDA' || typeof data?.category === 'string';
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshAccessTokenRequest) {
    refreshAccessTokenRequest = performAccessTokenRefresh().finally(() => {
      refreshAccessTokenRequest = null;
    });
  }
  return refreshAccessTokenRequest;
}

async function performAccessTokenRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = window.localStorage.getItem('refreshToken');
  if (!refreshToken) {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
      return null;
    }

    const data = await response.json() as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken || !data.refreshToken) {
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
      return null;
    }
    window.localStorage.setItem('accessToken', data.accessToken);
    window.localStorage.setItem('refreshToken', data.refreshToken);
    window.dispatchEvent(new CustomEvent(AUTH_TOKEN_REFRESHED_EVENT, { detail: data.accessToken }));
    return data.accessToken;
  } catch {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    return null;
  }
}

export const marketApi = {
  async getOandaStatus(token: string) {
    return requestOanda<{
      primaryProvider: 'OANDA';
      configuration: {
        configured: boolean;
        missingVariables: string[];
        accountIdConfigured: boolean;
        accountSpecificPricingAvailable: boolean;
        environment: 'practice' | 'live';
        apiBaseUrl: string;
      };
      errorCategory: string | null;
      providers: {
        OANDA: {
          status: string;
          errorCategory: string | null;
          lastError: string | null;
          candleStatus: string;
          candleErrorCategory: string | null;
          candleLastError: string | null;
          quoteStatus: string;
          quoteErrorCategory: string | null;
          quoteLastError: string | null;
        };
      };
    }>(`${API_BASE_URL}/market/status`, token);
  },

  async getOandaCandles(token: string, symbol: string, interval: string, outputsize = 100) {
    return requestOanda<{
      success: true;
      provider: 'OANDA';
      candles: OandaCandle[];
      error?: string;
    }>(
      `${API_BASE_URL}/market/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${outputsize}`,
      token,
    );
  },

  async getOandaQuote(token: string, symbol: string) {
    return requestOanda<{
      success: true;
      provider: 'OANDA';
      quote: { bid: string; ask: string; spread: string; price: string; timestamp: string };
    }>(`${API_BASE_URL}/market/quote/${encodeURIComponent(symbol)}`, token);
  },

  async getOandaInstruments(token: string): Promise<string[]> {
    const data = await requestOanda<{ provider: 'OANDA'; instruments: string[] }>(
      `${API_BASE_URL}/market/instruments`,
      token,
    );
    return data.instruments;
  },
};
