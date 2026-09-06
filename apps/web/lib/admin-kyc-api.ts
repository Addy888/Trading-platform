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

export interface KYCSubmission {
  id: string;
  userId: string;
  status: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUESTED';
  fullName: string | null;
  dateOfBirth: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentFrontUrl: string | null;
  documentBackUrl: string | null;
  selfieUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface KYCListResponse {
  data: KYCSubmission[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const adminKycApi = {
  async getKYCSubmissions(
    token: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
      userId?: string;
    } = {},
  ): Promise<KYCListResponse> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.search) queryParams.append('search', params.search);
    if (params.userId) queryParams.append('userId', params.userId);

    const response = await fetch(`${API_BASE_URL}/admin/kyc?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getKYCById(token: string, id: string): Promise<KYCSubmission> {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async approveKYC(token: string, id: string, notes?: string): Promise<KYCSubmission> {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes }),
    });
    return handleResponse(response);
  },

  async rejectKYC(token: string, id: string, reason: string): Promise<KYCSubmission> {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },

  async requestResubmission(token: string, id: string, reason: string): Promise<KYCSubmission> {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${id}/request-resubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },
};
