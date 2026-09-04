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

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  country?: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    orders: number;
    tradingAccounts: number;
  };
}

export interface UserDetail {
  user: User;
  statistics: {
    orders: {
      total: number;
      byStatus: Record<string, number>;
    };
    tradingAccounts: {
      total: number;
      byStatus: Record<string, number>;
    };
  };
  recentActivity: {
    orders: Array<any>;
    tradingAccounts: Array<any>;
    auditLogs: Array<any>;
  };
}

export interface TradingAccount {
  id: string;
  accountNumber: string;
  userId: string;
  challengePlanId: string;
  orderId: string;
  ruleSetId: string;
  initialBalance: string;
  currentBalance: string;
  equity: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  challengePlan: {
    id: string;
    name: string;
  };
  _count?: {
    trades: number;
    snapshots: number;
  };
}

export interface AuditLog {
  id: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: any;
  createdAt: string;
  actor?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface HealthStatus {
  database: string;
  websocket: string;
  simulatedMarket: string;
  notifications: string;
  timestamp: string;
}

export const adminApi = {
  // User Management
  async getUsers(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      role?: string;
      status?: string;
    } = {},
  ) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.role) queryParams.append('role', params.role);
    if (params.status) queryParams.append('status', params.status);

    const response = await fetch(`${API_BASE_URL}/admin/users?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getUserById(token: string, userId: string): Promise<UserDetail> {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async updateUserStatus(token: string, userId: string, isActive: boolean): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isActive }),
    });
    return handleResponse(response);
  },

  // Trading Accounts Management
  async getTradingAccounts(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      challengePlanId?: string;
    } = {},
  ) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.challengePlanId) queryParams.append('challengePlanId', params.challengePlanId);

    const response = await fetch(`${API_BASE_URL}/admin/trading-accounts?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getTradingAccountById(token: string, accountId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/trading-accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async updateTradingAccountStatus(
    token: string,
    accountId: string,
    status: string,
  ) {
    const response = await fetch(
      `${API_BASE_URL}/admin/trading-accounts/${accountId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      },
    );
    return handleResponse(response);
  },

  // Orders Management
  async getOrders(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    } = {},
  ) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);

    const response = await fetch(`${API_BASE_URL}/admin/orders?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getOrderById(token: string, orderId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async approvePayment(token: string, orderId: string) {
    const response = await fetch(
      `${API_BASE_URL}/admin/orders/${orderId}/approve-payment`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return handleResponse(response);
  },

  // Audit Logs
  async getAuditLogs(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      action?: string;
      actorId?: string;
    } = {},
  ): Promise<{ data: AuditLog[]; meta: any }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.action) queryParams.append('action', params.action);
    if (params.actorId) queryParams.append('actorId', params.actorId);

    const response = await fetch(`${API_BASE_URL}/admin/audit-logs?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  // Health
  async getHealth(token: string): Promise<HealthStatus> {
    const response = await fetch(`${API_BASE_URL}/admin/health`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
