const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface UserDashboard {
  accounts: {
    total: number;
    active: number;
    passed: number;
    breached: number;
  };
  financial: {
    totalInitialBalance: string;
    totalCurrentBalance: string;
    totalEquity: string;
    totalPnl: string;
  };
  recentTrades: Array<{
    id: string;
    symbol: string;
    side: string;
    volume: string;
    realizedPnl: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
  }>;
  recentOrders: Array<{
    id: string;
    challengeName: string;
    amount: string;
    currency: string;
    status: string;
    createdAt: string;
  }>;
}

export interface AdminDashboard {
  platform: {
    totalUsers: number;
    activeUsers: number;
    totalChallengePlans: number;
    activeChallengePlans: number;
    totalOrders: number;
    pendingOrders: number;
    paidOrders: number;
    totalTradingAccounts: number;
    activeTradingAccounts: number;
    passedAccounts: number;
    breachedAccounts: number;
  };
  financial: {
    totalOrderValue: string;
    totalPaidOrderValue: string;
    pendingPaymentValue: string;
  };
  trading: {
    totalTrades: number;
    openPositions: number;
    closedTrades: number;
    aggregateRealizedPnl: string;
    aggregateUnrealizedPnl: string;
  };
  recentActivity: {
    recentUsers: Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      createdAt: string;
    }>;
    recentOrders: Array<{
      id: string;
      user: string;
      userEmail: string;
      challenge: string;
      amount: string;
      status: string;
      createdAt: string;
    }>;
    recentAccounts: Array<{
      id: string;
      accountNumber: string;
      user: string;
      userEmail: string;
      challenge: string;
      initialBalance: string;
      status: string;
      createdAt: string;
    }>;
    recentTrades: Array<{
      id: string;
      accountNumber: string;
      userEmail: string;
      symbol: string;
      side: string;
      volume: string;
      realizedPnl: string;
      status: string;
      openedAt: string;
      closedAt: string | null;
    }>;
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

export const dashboardApi = {
  async getUserDashboard(token: string): Promise<UserDashboard> {
    const response = await fetch(`${API_BASE_URL}/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getAdminDashboard(token: string): Promise<AdminDashboard> {
    const response = await fetch(`${API_BASE_URL}/admin/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
