const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ChallengePlan {
  id: string;
  name: string;
  description?: string;
  accountSize: string;
  price: string;
  currency: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  ruleSetId: string;
  createdAt: string;
  updatedAt: string;
  ruleSet: {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    ruleSetRules: Array<{
      id: string;
      rule: {
        id: string;
        name: string;
        description?: string;
        type: string;
        value: string;
        isPercentage: boolean;
        isActive: boolean;
      };
    }>;
  };
}

export interface CreateChallengePlanDto {
  name: string;
  description?: string;
  accountSize: number;
  price: number;
  currency?: string;
  ruleSetId: string;
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

export const challengePlansApi = {
  async getAllAdmin(token: string): Promise<ChallengePlan[]> {
    const response = await fetch(`${API_BASE_URL}/admin/challenge-plans`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getAllPublic(): Promise<ChallengePlan[]> {
    const response = await fetch(`${API_BASE_URL}/challenge-plans`);
    return handleResponse(response);
  },

  async getOne(id: string): Promise<ChallengePlan> {
    const response = await fetch(`${API_BASE_URL}/challenge-plans/${id}`);
    return handleResponse(response);
  },

  async getOneAdmin(token: string, id: string): Promise<ChallengePlan> {
    const response = await fetch(`${API_BASE_URL}/admin/challenge-plans/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async create(token: string, data: CreateChallengePlanDto): Promise<ChallengePlan> {
    const response = await fetch(`${API_BASE_URL}/admin/challenge-plans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async update(token: string, id: string, data: Partial<CreateChallengePlanDto>): Promise<ChallengePlan> {
    const response = await fetch(`${API_BASE_URL}/admin/challenge-plans/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateStatus(token: string, id: string, status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'): Promise<ChallengePlan> {
    const response = await fetch(`${API_BASE_URL}/admin/challenge-plans/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    return handleResponse(response);
  },
};
