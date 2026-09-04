import { useState, useEffect, useCallback } from 'react';
import { notificationsApi, Notification, NotificationPreferences } from '../notifications-api';
import { useAuth } from '../auth-context';
import { getSocket } from '../socket';

export function useNotifications() {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async (params?: { page?: number; limit?: number }) => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const response = await notificationsApi.getNotifications(accessToken, {
        page: params?.page || 1,
        limit: params?.limit || 10,
      });
      setNotifications(response.data);
      setUnreadCount(response.meta.unreadCount);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!accessToken) return;

    try {
      const response = await notificationsApi.getUnreadCount(accessToken);
      setUnreadCount(response.unreadCount);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [accessToken]);

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!accessToken) return;

    try {
      await notificationsApi.markAsRead(accessToken, notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, [accessToken]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!accessToken) return;

    try {
      await notificationsApi.markAllAsRead(accessToken);
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, [accessToken]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!accessToken) return;

    try {
      await notificationsApi.deleteNotification(accessToken, notificationId);
      const notification = notifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notification && !notification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, [accessToken, notifications]);

  // Listen for real-time notifications
  useEffect(() => {
    if (!accessToken) return;

    const socket = getSocket(accessToken);
    if (!socket) return;

    const handleNewNotification = (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      if (!notification.isRead) {
        setUnreadCount(prev => prev + 1);
      }
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [accessToken]);

  // Initial fetch
  useEffect(() => {
    if (accessToken) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [accessToken, fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}

export function useNotificationPreferences() {
  const { accessToken } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await notificationsApi.getPreferences(accessToken);
      setPreferences(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch preferences');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
    if (!accessToken) return;

    try {
      const data = await notificationsApi.updatePreferences(accessToken, updates);
      setPreferences(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
      throw err;
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      fetchPreferences();
    }
  }, [accessToken, fetchPreferences]);

  return {
    preferences,
    loading,
    error,
    updatePreferences,
    refetch: fetchPreferences,
  };
}
