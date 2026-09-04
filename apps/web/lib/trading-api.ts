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

export interface TradingAccount {
  id: string;
  userId: string;
  challengePlanId: string;
  orderId: string;
  ruleSetId: string;
  accountNumber: string;
  initialBalance: string;
  currentBalance: string;
  equity: string;
  status: string;
  startedAt?: string;
  createdAt: string;
  updatedAt: string;
  challengePlan: {
    id: string;
    name: string;
    description?: string;
    accountSize: string;
    price: string;
    currency: string;
    status: string;
  };
  ruleSet?: any;
}

export interface OpenPosition {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  stopLoss?: string;
  takeProfit?: string;
  openedAt: string;
  priceSource: string;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: string;
  entryPrice: string;
  exitPrice?: string;
  realizedPnl: string;
  status: string;
  openedAt: string;
  closedAt?: string;
}

export interface AccountPerformance {
  accountNumber: string;
  initialBalance: string;
  currentBalance: string;
  equity: string;
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  totalRealizedPnl: string;
  totalUnrealizedPnl: string;
  totalPnl: string;
  returnPercentage: string;
  accountStatus: string;
}

export interface OpenTradeRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ChallengeProgress {
  accountStatus: string;
  accountResult: string;
  overallProgress: string;
  rules: {
    profitTarget?: {
      requiredProfit: string;
      currentProfit: string;
      remainingProfit: string;
      progressPercentage: string;
      completed: boolean;
    };
    maxDrawdown?: {
      maximumAllowedLoss: string;
      currentDrawdown: string;
      remainingLossAllowance: string;
      usagePercentage: string;
      breached: boolean;
    };
    dailyLoss?: {
      dailyLossLimit: string;
      currentDailyLoss: string;
      remainingDailyLoss: string;
      usagePercentage: string;
      breached: boolean;
    };
    minimumTradingDays?: {
      requiredTradingDays: number;
      completedTradingDays: number;
      remainingTradingDays: number;
      progressPercentage: string;
      completed: boolean;
    };
  };
}

export const tradingApi = {
  /**
   * Get user's trading accounts
   */
  async getTradingAccounts(token: string): Promise<TradingAccount[]> {
    const response = await fetch(`${API_BASE_URL}/trading-accounts`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Get specific trading account
   */
  async getTradingAccount(token: string, accountId: string): Promise<TradingAccount> {
    const response = await fetch(`${API_BASE_URL}/trading-accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Get account performance
   */
  async getAccountPerformance(
    token: string,
    accountId: string,
  ): Promise<AccountPerformance> {
    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/performance`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },

  /**
   * Get open positions
   */
  async getOpenPositions(token: string, accountId: string): Promise<OpenPosition[]> {
    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/positions`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },

  /**
   * Get trade history
   */
  async getTradeHistory(
    token: string,
    accountId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
    } = {},
  ): Promise<{ trades: Trade[]; pagination: any }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);

    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/trades?${queryParams}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },

  /**
   * Open a new trade
   */
  async openTrade(
    token: string,
    accountId: string,
    trade: OpenTradeRequest,
  ): Promise<Trade> {
    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/trades`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(trade),
      },
    );
    return handleResponse(response);
  },

  /**
   * Close a trade
   */
  async closeTrade(token: string, accountId: string, tradeId: string): Promise<Trade> {
    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/trades/${tradeId}/close`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },

  /**
   * Get challenge progress
   */
  async getChallengeProgress(
    token: string,
    accountId: string,
  ): Promise<ChallengeProgress> {
    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/progress`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },
};
