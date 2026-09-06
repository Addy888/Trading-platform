const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

export interface Trade {
  id: string;
  tradingAccountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: string;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  realizedPnl: string;
  unrealizedPnl: string;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tradingAccount?: {
    id: string;
    accountNumber: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
    challengePlan: {
      name: string;
    };
  };
}

export interface TradesListResponse {
  data: Trade[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TradeStats {
  total: number;
  open: number;
  closed: number;
  totalVolume: string;
  totalRealizedPnl: string;
  totalUnrealizedPnl: string;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
}

export const adminTradesApi = {
  async getTrades(
    token: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      symbol?: string;
      userId?: string;
      accountId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    } = {},
  ): Promise<TradesListResponse> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.symbol) queryParams.append('symbol', params.symbol);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.search) queryParams.append('search', params.search);

    const response = await fetch(`${API_BASE_URL}/admin/trades?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getTradeById(token: string, tradeId: string): Promise<Trade> {
    const response = await fetch(`${API_BASE_URL}/admin/trades/${tradeId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getOpenPositions(
    token: string,
    params: {
      page?: number;
      limit?: number;
      symbol?: string;
      userId?: string;
      accountId?: string;
      search?: string;
    } = {},
  ): Promise<TradesListResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append('status', 'OPEN');
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.symbol) queryParams.append('symbol', params.symbol);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.accountId) queryParams.append('accountId', params.accountId);
    if (params.search) queryParams.append('search', params.search);

    const response = await fetch(`${API_BASE_URL}/admin/trades?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getTradeStats(token: string): Promise<TradeStats> {
    const response = await fetch(`${API_BASE_URL}/admin/trades/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
