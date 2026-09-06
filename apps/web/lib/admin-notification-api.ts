const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

export interface SendNotificationData {
  userId?: string;
  userIds?: string[];
  broadcastToAll?: 'true' | 'false';
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  data?: any;
}

export interface SendNotificationResponse {
  success: boolean;
  count: number;
  message: string;
}

export const adminNotificationApi = {
  async sendNotification(
    accessToken: string,
    data: SendNotificationData,
  ): Promise<SendNotificationResponse> {
    const response = await fetch(`${API_URL}/admin/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send notification');
    }

    return response.json();
  },
};
