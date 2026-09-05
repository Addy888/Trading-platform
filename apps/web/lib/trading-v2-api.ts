const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function handleResponse(response: Response) {
  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      throw new Error('An error occurred');
    }
    throw new Error(errorData.message || errorData.error || 'An error occurred');
  }
  return response.json();
}

export interface MarketQuote {
  symbol: string;
  bid: string;
  ask: string;
  spread: string;
  last: string;
  timestamp: Date;
}

export interface MarginInfo {
  accountId: string;
  balance: string;
  equity: string;
  usedMargin: string;
  freeMargin: string;
  marginLevel: string;
  openPositions: number;
}

export interface Instrument {
  symbol: string;
  name: string;
  category: string;
  minVolume: string;
  maxVolume: string;
  volumeStep: string;
  defaultLeverage: number;
  maxLeverage: number;
  contractSize: number;
  pipSize: string;
}

export interface OpenTradeRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
}

export interface UpdatePositionRequest {
  stopLoss?: number;
  takeProfit?: number;
}

export interface TradeResponse {
  success: boolean;
  trade: {
    id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    volume: string;
    entryPrice: string;
    exitPrice?: string;
    stopLoss?: string;
    takeProfit?: string;
    status: string;
    realizedPnl?: string;
    openedAt: Date;
    closedAt?: Date;
  };
}

export const tradingV2Api = {
  /**
   * Open a new trade (V2 endpoint with proper bid/ask execution)
   */
  async openTrade(
    token: string,
    accountId: string,
    trade: OpenTradeRequest
  ): Promise<TradeResponse> {
    const response = await fetch(
      `${API_BASE_URL}/v2/trading-accounts/${accountId}/trades`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(trade),
      }
    );
    return handleResponse(response);
  },

  /**
   * Close a trade (V2 endpoint)
   */
  async closeTrade(
    token: string,
    accountId: string,
    tradeId: string
  ): Promise<TradeResponse> {
    const response = await fetch(
      `${API_BASE_URL}/v2/trading-accounts/${accountId}/trades/${tradeId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Update position SL/TP (V2 endpoint)
   */
  async updatePosition(
    token: string,
    accountId: string,
    tradeId: string,
    updates: UpdatePositionRequest
  ): Promise<TradeResponse> {
    const response = await fetch(
      `${API_BASE_URL}/v2/trading-accounts/${accountId}/trades/${tradeId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      }
    );
    return handleResponse(response);
  },

  /**
   * Get account margin information
   */
  async getMarginInfo(
    token: string,
    accountId: string
  ): Promise<MarginInfo> {
    const response = await fetch(
      `${API_BASE_URL}/v2/trading-accounts/${accountId}/margin`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Get market quotes with bid/ask
   */
  async getMarketQuotes(
    token: string,
    accountId: string
  ): Promise<{ status: string; quotes: MarketQuote[] }> {
    const response = await fetch(
      `${API_BASE_URL}/v2/trading-accounts/${accountId}/quotes`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Get available instruments
   */
  async getInstruments(
    token: string,
    accountId: string
  ): Promise<{ instruments: Instrument[] }> {
    const response = await fetch(
      `${API_BASE_URL}/v2/trading-accounts/${accountId}/instruments`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Get single instrument details
   */
  async getInstrument(
    token: string,
    accountId: string,
    symbol: string
  ): Promise<Instrument> {
    const response = await fetch(
      `${API_BASE_URL}/v2/trading-accounts/${accountId}/instruments/${symbol}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },
};
