const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export type NotificationType =
  | 'ACCOUNT_CREATED'
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'ACCOUNT_PASSED'
  | 'ACCOUNT_BREACHED'
  | 'ORDER_CREATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_COMPLETED'
  | 'PAYMENT_REJECTED'
  | 'SYSTEM_ALERT'
  | 'ADMIN_ALERT';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  data: Notification[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  tradeNotifications: boolean;
  accountNotifications: boolean;
  challengeNotifications: boolean;
  orderNotifications: boolean;
  systemNotifications: boolean;
  createdAt: string;
  updatedAt: string;
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

export const notificationsApi = {
  /**
   * Get user notifications
   */
  async getNotifications(
    token: string,
    params?: {
      page?: number;
      limit?: number;
      read?: boolean;
      type?: NotificationType;
    }
  ): Promise<NotificationsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.read !== undefined) queryParams.append('read', params.read.toString());
    if (params?.type) queryParams.append('type', params.type);

    const url = `${API_BASE_URL}/notifications${queryParams.toString() ? `?${queryParams}` : ''}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(token: string): Promise<{ unreadCount: number }> {
    const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Mark notification as read
   */
  async markAsRead(token: string, notificationId: string): Promise<Notification> {
    const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(token: string): Promise<{ count: number; message: string }> {
    const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Delete notification
   */
  async deleteNotification(token: string, notificationId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Get notification preferences
   */
  async getPreferences(token: string): Promise<NotificationPreferences> {
    const response = await fetch(`${API_BASE_URL}/notification-preferences`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(
    token: string,
    data: Partial<Omit<NotificationPreferences, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<NotificationPreferences> {
    const response = await fetch(`${API_BASE_URL}/notification-preferences`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
};
