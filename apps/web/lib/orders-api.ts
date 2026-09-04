const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface Order {
  id: string;
  userId: string;
  challengePlanId: string;
  amount: string;
  currency: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'FAILED' | 'REFUNDED';
  planSnapshot: any;
  createdAt: string;
  updatedAt: string;
  payment?: Payment;
  challengePlan?: any;
  tradingAccount?: any;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    country?: string;
  };
}

export interface Payment {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  provider: string;
  providerReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderDto {
  challengePlanId: string;
}

export interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

export const ordersApi = {
  async create(token: string, data: CreateOrderDto): Promise<Order> {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async getUserOrders(token: string, page: number = 1, limit: number = 10): Promise<OrdersResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    const response = await fetch(`${API_BASE_URL}/orders?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getUserOrder(token: string, orderId: string): Promise<Order> {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async testPayment(token: string, orderId: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/test-pay`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  // Admin endpoints
  async getAllOrders(token: string, page: number = 1, limit: number = 10, search?: string): Promise<OrdersResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    const response = await fetch(`${API_BASE_URL}/admin/orders?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getOrderById(token: string, orderId: string): Promise<Order> {
    const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async approvePayment(token: string, orderId: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/approve-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async rejectPayment(token: string, orderId: string, reason?: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/reject-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },
};
