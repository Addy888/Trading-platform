const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface TradingRule {
  id: string;
  name: string;
  description?: string;
  type: 'PROFIT_TARGET' | 'DAILY_LOSS' | 'MAX_DRAWDOWN' | 'MIN_TRADING_DAYS';
  value: string;
  isPercentage: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTradingRuleDto {
  name: string;
  description?: string;
  type: 'PROFIT_TARGET' | 'DAILY_LOSS' | 'MAX_DRAWDOWN' | 'MIN_TRADING_DAYS';
  value: number;
  isPercentage: boolean;
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

export const tradingRulesApi = {
  async getAll(token: string): Promise<TradingRule[]> {
    const response = await fetch(`${API_BASE_URL}/admin/trading-rules`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getOne(token: string, id: string): Promise<TradingRule> {
    const response = await fetch(`${API_BASE_URL}/admin/trading-rules/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async create(token: string, data: CreateTradingRuleDto): Promise<TradingRule> {
    const response = await fetch(`${API_BASE_URL}/admin/trading-rules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async update(token: string, id: string, data: Partial<CreateTradingRuleDto>): Promise<TradingRule> {
    const response = await fetch(`${API_BASE_URL}/admin/trading-rules/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateStatus(token: string, id: string, isActive: boolean): Promise<TradingRule> {
    const response = await fetch(`${API_BASE_URL}/admin/trading-rules/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive }),
    });
    return handleResponse(response);
  },
};
