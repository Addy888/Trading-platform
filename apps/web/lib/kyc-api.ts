const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface KycSubmission {
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
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitKycData {
  fullName: string;
  dateOfBirth: string;
  address: string;
  city: string;
  country: string;
  postalCode: string;
  documentType: string;
  documentNumber: string;
  documentFrontUrl?: string;
  documentBackUrl?: string;
  selfieUrl?: string;
  metadata?: any;
}

export const kycApi = {
  async submitKyc(accessToken: string, data: SubmitKycData): Promise<KycSubmission> {
    const response = await fetch(`${API_URL}/kyc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to submit KYC');
    }

    return response.json();
  },

  async getOwnKyc(accessToken: string): Promise<KycSubmission | null> {
    const response = await fetch(`${API_URL}/kyc`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      // Try to parse error, but handle empty responses
      try {
        const error = await response.json();
        throw new Error(error.message || 'Failed to load KYC');
      } catch (parseError) {
        throw new Error('Failed to load KYC');
      }
    }

    // Check if response has content
    const text = await response.text();
    if (!text || text.trim() === '') {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse KYC response:', parseError);
      return null;
    }
  },

  async getKycDetails(accessToken: string, id: string): Promise<KycSubmission> {
    const response = await fetch(`${API_URL}/kyc/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to load KYC details');
    }

    return response.json();
  },

  async updateKyc(
    accessToken: string,
    id: string,
    data: Partial<SubmitKycData>,
  ): Promise<KycSubmission> {
    const response = await fetch(`${API_URL}/kyc/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update KYC');
    }

    return response.json();
  },
};
