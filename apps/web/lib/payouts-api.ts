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

export interface Payout {
  id: string;
  userId: string;
  tradingAccountId: string;
  amount: string;
  currency: string;
  status: string;
  method?: string;
  destination?: string;
  reference?: string;
  notes?: string;
  requestedAt: string;
  processedAt?: string;
  completedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  tradingAccount?: {
    id: string;
    accountNumber: string;
    challengePlan: {
      name: string;
    };
  };
  reviewer?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export const payoutsApi = {
  async getPayouts(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      userId?: string;
    } = {},
  ) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.userId) queryParams.append('userId', params.userId);

    const response = await fetch(`${API_BASE_URL}/admin/payouts?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getPayoutById(token: string, payoutId: string): Promise<Payout> {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async updatePayoutStatus(
    token: string,
    payoutId: string,
    status: string,
    notes?: string,
  ) {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status, notes }),
    });
    return handleResponse(response);
  },

  async approvePayout(token: string, payoutId: string, notes?: string) {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes }),
    });
    return handleResponse(response);
  },

  async rejectPayout(token: string, payoutId: string, reason: string) {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },

  async markPayoutPaid(token: string, payoutId: string, reference: string) {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}/mark-paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reference }),
    });
    return handleResponse(response);
  },

  async getPayoutStats(token: string) {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
