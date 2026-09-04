const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface RuleSet {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  ruleSetRules: RuleSetRule[];
}

export interface RuleSetRule {
  id: string;
  ruleSetId: string;
  ruleId: string;
  createdAt: string;
  rule: {
    id: string;
    name: string;
    description?: string;
    type: string;
    value: string;
    isPercentage: boolean;
    isActive: boolean;
  };
}

export interface CreateRuleSetDto {
  name: string;
  description?: string;
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

export const ruleSetsApi = {
  async getAll(token: string): Promise<RuleSet[]> {
    const response = await fetch(`${API_BASE_URL}/admin/rule-sets`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getOne(token: string, id: string): Promise<RuleSet> {
    const response = await fetch(`${API_BASE_URL}/admin/rule-sets/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async create(token: string, data: CreateRuleSetDto): Promise<RuleSet> {
    const response = await fetch(`${API_BASE_URL}/admin/rule-sets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async update(token: string, id: string, data: Partial<CreateRuleSetDto>): Promise<RuleSet> {
    const response = await fetch(`${API_BASE_URL}/admin/rule-sets/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateStatus(token: string, id: string, isActive: boolean): Promise<RuleSet> {
    const response = await fetch(`${API_BASE_URL}/admin/rule-sets/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive }),
    });
    return handleResponse(response);
  },

  async addRule(token: string, id: string, ruleId: string): Promise<RuleSetRule> {
    const response = await fetch(`${API_BASE_URL}/admin/rule-sets/${id}/rules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ruleId }),
    });
    return handleResponse(response);
  },

  async removeRule(token: string, id: string, ruleId: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/admin/rule-sets/${id}/rules/${ruleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
