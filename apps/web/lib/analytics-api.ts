const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface PerformanceMetrics {
  overview: {
    initialBalance: string;
    currentBalance: string;
    equity: string;
    totalPnl: string;
    returnPercentage: string;
  };
  trades: {
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: string;
    lossRate: string;
  };
  pnl: {
    realized: string;
    unrealized: string;
    averageWin: string;
    averageLoss: string;
    largestWin: string;
    largestLoss: string;
    profitFactor: string;
  };
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

export interface AccountAnalytics {
  overview: PerformanceMetrics['overview'];
  trades: PerformanceMetrics['trades'];
  pnl: PerformanceMetrics['pnl'];
  accountStatus: string;
  challengeProgress: ChallengeProgress;
}

export interface EquityHistoryPoint {
  timestamp: string;
  balance: string;
  equity: string;
  totalPnl: string;
  realizedPnl: string;
  unrealizedPnl: string;
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

export const analyticsApi = {
  async getAccountAnalytics(accountId: string, token: string): Promise<AccountAnalytics> {
    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/analytics`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },

  async getChallengeProgress(accountId: string, token: string): Promise<ChallengeProgress> {
    const response = await fetch(
      `${API_BASE_URL}/trading-accounts/${accountId}/challenge-progress`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },

  async getEquityHistory(
    accountId: string,
    token: string,
    range?: '7d' | '30d' | 'all'
  ): Promise<EquityHistoryPoint[]> {
    const url = range
      ? `${API_BASE_URL}/trading-accounts/${accountId}/equity-history?range=${range}`
      : `${API_BASE_URL}/trading-accounts/${accountId}/equity-history`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getAdminAnalytics(token: string, timeRange: string = '30d'): Promise<any> {
    const response = await fetch(
      `${API_BASE_URL}/analytics/admin?timeRange=${timeRange}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return handleResponse(response);
  },
};
