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
};
