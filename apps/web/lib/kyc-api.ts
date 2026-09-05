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
  status: string;
  documentType?: string;
  documentNumber?: string;
  fullName?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  reviewer?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export const kycApi = {
  async getKYCSubmissions(
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

    const response = await fetch(`${API_BASE_URL}/admin/kyc?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getKYCSubmissionById(token: string, submissionId: string): Promise<KYCSubmission> {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${submissionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async approveKYC(token: string, submissionId: string, notes?: string) {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${submissionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes }),
    });
    return handleResponse(response);
  },

  async rejectKYC(token: string, submissionId: string, reason: string) {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${submissionId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },

  async requestResubmission(token: string, submissionId: string, reason: string) {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/${submissionId}/request-resubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },

  async getKYCStats(token: string) {
    const response = await fetch(`${API_BASE_URL}/admin/kyc/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
};
