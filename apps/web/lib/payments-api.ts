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

export interface Wallet {
  id: string;
  userId: string;
  currency: string;
  balance: string;
  lockedBalance: string;
  createdAt: string;
  updatedAt: string;
  ledgerEntries?: WalletLedger[];
}

export interface WalletLedger {
  id: string;
  walletId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_TO_TRADING' | 'TRANSFER_FROM_TRADING' | 'ORDER_PURCHASE' | 'ADMIN_ADJUSTMENT' | 'REFUND';
  direction: 'CREDIT' | 'DEBIT';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  currency: string;
  referenceType: string;
  referenceId?: string;
  providerReference?: string;
  description?: string;
  metadata?: any;
  actorId?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  orderId?: string;
  userId?: string;
  walletId?: string;
  amount: string;
  currency: string;
  provider: string;
  providerReference?: string;
  method?: string;
  status: string;
  reference?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  order?: {
    id: string;
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
    challengePlan?: {
      id: string;
      name: string;
    };
  };
  wallet?: {
    id: string;
    balance: string;
    currency: string;
  };
}

export const paymentsApi = {
  // USER WALLET APIS
  async getWallet(token: string): Promise<Wallet> {
    const response = await fetch(`${API_BASE_URL}/payments/wallet`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async initiateDeposit(
    token: string,
    data: {
      amount: string;
      currency: string;
      provider?: string;
      successUrl?: string;
      cancelUrl?: string;
    },
  ) {
    const response = await fetch(`${API_BASE_URL}/payments/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async getWalletHistory(
    token: string,
    params: {
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ wallet: Wallet; data: WalletLedger[]; meta: any }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());

    const response = await fetch(`${API_BASE_URL}/payments/history?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getMyPayments(
    token: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
    } = {},
  ) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);

    const response = await fetch(`${API_BASE_URL}/payments/my-payments?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async transferToTrading(
    token: string,
    data: {
      tradingAccountId: string;
      amount: string;
    },
  ) {
    const response = await fetch(`${API_BASE_URL}/payments/transfer-to-trading`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async transferFromTrading(
    token: string,
    data: {
      tradingAccountId: string;
      amount: string;
    },
  ) {
    const response = await fetch(`${API_BASE_URL}/payments/transfer-from-trading`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  // ADMIN APIS
  async getPayments(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      provider?: string;
    } = {},
  ) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.provider) queryParams.append('provider', params.provider);

    const response = await fetch(`${API_BASE_URL}/admin/payments?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getPaymentById(token: string, paymentId: string): Promise<Payment> {
    const response = await fetch(`${API_BASE_URL}/admin/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async updatePaymentStatus(
    token: string,
    paymentId: string,
    status: string,
    notes?: string,
  ) {
    const response = await fetch(`${API_BASE_URL}/admin/payments/${paymentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status, notes }),
    });
    return handleResponse(response);
  },

  async adjustBalance(
    token: string,
    data: {
      userId: string;
      amount: string;
      direction: 'CREDIT' | 'DEBIT';
      reason: string;
    },
  ) {
    const response = await fetch(`${API_BASE_URL}/admin/payments/adjust-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async getPaymentStats(token: string) {
    const response = await fetch(`${API_BASE_URL}/admin/payments/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
