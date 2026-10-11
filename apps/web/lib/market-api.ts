const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface MarketPrice {
  symbol: string;
  price: string;
  timestamp: Date;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleResponse {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  source: string;
}

export interface TwelveDataQuote {
  symbol: string;
  name: string;
  exchange: string;
  open: string;
  high: string;
  low: string;
  close: string;
  datetime: string;
  is_market_open: boolean;
}

export interface TwelveDataStatus {
  configured: boolean;
  wsStatus: string;
  subscribedSymbols: string[];
  lastHeartbeat: string | null;
  stats: {
    restRequests: number;
    restErrors: number;
    wsMessages: number;
    wsErrors: number;
    lastSuccessfulUpdate: string | null;
    cacheHits: number;
    cacheMisses: number;
  };
  cacheSize: number;
}

export enum MarketDataSource {
  SIMULATED = 'SIMULATED',
  TWELVEDATA = 'TWELVEDATA',
  ANGELONE_LIVE = 'ANGELONE_LIVE',
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      throw new Error('An error occurred');
    }
    throw new Error(errorData.message || 'An error occurred');
  }
  return response.json();
}

export const marketApi = {
  /**
   * Get all market prices
   */
  async getPrices(): Promise<{ prices: MarketPrice[]; source: string; updatedAt: Date }> {
    const response = await fetch(`${API_BASE_URL}/market/prices`);
    return handleResponse(response);
  },

  /**
   * Get single symbol price
   */
  async getPrice(symbol: string): Promise<{ symbol: string; price: string; source: string; updatedAt: Date }> {
    const response = await fetch(`${API_BASE_URL}/market/prices/${symbol}`);
    return handleResponse(response);
  },

  /**
   * Get supported symbols
   */
  async getSymbols(): Promise<{ symbols: string[]; source: string }> {
    const response = await fetch(`${API_BASE_URL}/market/symbols`);
    return handleResponse(response);
  },

  /**
   * Get historical candle data
   */
  async getCandles(
    token: string,
    symbol: string,
    timeframe: string = '1H',
    limit: number = 100,
  ): Promise<CandleResponse> {
    const response = await fetch(
      `${API_BASE_URL}/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },

  // Twelve Data endpoints
  /**
   * Get Twelve Data provider status
   */
  async getTwelveDataStatus(token: string): Promise<TwelveDataStatus> {
    const response = await fetch(`${API_BASE_URL}/market/twelvedata/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Get real-time quote from Twelve Data
   */
  async getTwelveDataQuote(token: string, symbol: string): Promise<{
    success: boolean;
    symbol: string;
    quote: TwelveDataQuote;
    timestamp: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/market/twelvedata/quote/${symbol}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Get historical candles from Twelve Data
   * 
   * Changed to use query parameters to handle slashes in forex symbols like EUR/USD
   */
  async getTwelveDataCandles(
    token: string,
    symbol: string,
    interval: string = '1h',
    outputsize: number = 100,
    mode: 'LIVE' | 'SIMULATED' = 'LIVE',
  ): Promise<{
    success: boolean;
    symbol: string;
    interval: string;
    mode: string;
    candles: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume?: string;
    }>;
    count: number;
    timestamp: string;
    error?: string;
  }> {
    const response = await fetch(
      `${API_BASE_URL}/market/twelvedata/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&mode=${mode}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },
};
