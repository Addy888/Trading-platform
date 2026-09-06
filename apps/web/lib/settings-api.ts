const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface PlatformSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string | null;
  isPublic: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsResponse {
  settings: PlatformSetting[];
  grouped: Record<string, PlatformSetting[]>;
}

export interface CreateSettingDto {
  key: string;
  value: string;
  description?: string;
  category?: string;
  isPublic?: boolean;
}

export interface UpdateSettingDto {
  value?: string;
  description?: string;
  category?: string;
  isPublic?: boolean;
}

export const settingsApi = {
  async getAllSettings(token: string, category?: string): Promise<SettingsResponse> {
    const url = new URL(`${API_BASE_URL}/admin/settings`);
    if (category) url.searchParams.append('category', category);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch settings');
    }

    return response.json();
  },

  async getSettingByKey(token: string, key: string): Promise<PlatformSetting> {
    const response = await fetch(`${API_BASE_URL}/admin/settings/${key}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch setting');
    }

    return response.json();
  },

  async createSetting(token: string, dto: CreateSettingDto): Promise<PlatformSetting> {
    const response = await fetch(`${API_BASE_URL}/admin/settings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create setting');
    }

    return response.json();
  },

  async updateSetting(token: string, key: string, dto: UpdateSettingDto): Promise<PlatformSetting> {
    const response = await fetch(`${API_BASE_URL}/admin/settings/${key}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to update setting');
    }

    return response.json();
  },

  async deleteSetting(token: string, key: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/admin/settings/${key}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to delete setting');
    }

    return response.json();
  },
};
