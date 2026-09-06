const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface Payout {
  id: string;
  userId: string;
  tradingAccountId: string;
  amount: string;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  method: string | null;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface RequestPayoutData {
  tradingAccountId: string;
  amount: number;
  method?: string;
  destination?: string;
  notes?: string;
}

export interface PayoutEligibility {
  eligible: boolean;
  reasons: {
    statusEligible: boolean;
    hasProfit: boolean;
    hasPendingPayout: boolean;
    minTradingDaysMet: boolean;
  };
  accountStatus: string;
  availableProfit: string;
  balance: string;
  equity: string;
}

export interface PayoutListResponse {
  data: Payout[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const payoutApi = {
  async requestPayout(accessToken: string, data: RequestPayoutData): Promise<Payout> {
    const response = await fetch(`${API_URL}/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to request payout');
    }

    return response.json();
  },

  async getPayouts(
    accessToken: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PayoutListResponse> {
    const response = await fetch(`${API_URL}/payouts?page=${page}&limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to load payouts');
    }

    return response.json();
  },

  async getPayoutDetails(accessToken: string, id: string): Promise<Payout> {
    const response = await fetch(`${API_URL}/payouts/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to load payout details');
    }

    return response.json();
  },

  async checkEligibility(
    accessToken: string,
    tradingAccountId: string,
  ): Promise<PayoutEligibility> {
    const response = await fetch(
      `${API_URL}/payouts/eligibility/${tradingAccountId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to check eligibility');
    }

    return response.json();
  },
};
