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

export interface Payment {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  provider: string;
  method?: string;
  status: string;
  reference?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  order?: {
    id: string;
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
  };
}

export const paymentsApi = {
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

  async getPaymentStats(token: string) {
    const response = await fetch(`${API_BASE_URL}/admin/payments/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
