const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
  status: 'PENDING' | 'ACTIVE' | 'PASSED' | 'BREACHED' | 'SUSPENDED' | 'CLOSED';
  startedAt?: string;
  createdAt: string;
  updatedAt: string;
  challengePlan?: any;
  ruleSet?: any;
  order?: any;
}

export interface AccountsResponse {
  accounts: TradingAccount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

export const tradingAccountsApi = {
  async getUserAccounts(token: string): Promise<TradingAccount[]> {
    const response = await fetch(`${API_BASE_URL}/trading-accounts`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getUserAccount(token: string, accountId: string): Promise<TradingAccount> {
    const response = await fetch(`${API_BASE_URL}/trading-accounts/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getAccountProgress(token: string, accountId: string): Promise<ChallengeProgress> {
    const response = await fetch(`${API_BASE_URL}/trading-accounts/${accountId}/progress`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  // Admin endpoints
  async getAllAccounts(token: string, page: number = 1, limit: number = 10, search?: string): Promise<AccountsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    const response = await fetch(`${API_BASE_URL}/admin/trading-accounts?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getAccountById(token: string, accountId: string): Promise<TradingAccount> {
    const response = await fetch(`${API_BASE_URL}/admin/trading-accounts/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getAccountProgressAdmin(token: string, accountId: string): Promise<ChallengeProgress> {
    const response = await fetch(`${API_BASE_URL}/admin/trading-accounts/${accountId}/progress`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
