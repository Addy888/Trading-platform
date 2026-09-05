'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { notificationsApi } from '@/lib/notifications-api';

export default function AdminNotificationsPage() {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchNotifications();
  }, [accessToken, filter]);

  const fetchNotifications = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError('');
      const result = await notificationsApi.getNotifications(accessToken, {
        page: 1,
        limit: 100,
      });
      
      let filtered = result.data;
      if (filter === 'unread') {
        filtered = result.data.filter((n: any) => !n.isRead);
      } else if (filter === 'system') {
        filtered = result.data.filter((n: any) => n.type === 'SYSTEM_ALERT');
      } else if (filter === 'trading') {
        filtered = result.data.filter((n: any) => 
          n.type === 'TRADE_OPENED' || n.type === 'TRADE_CLOSED'
        );
      }
      
      setNotifications(filtered);
    } catch (err: any) {
      console.error('Failed to load notifications:', err);
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    if (!accessToken) return;

    try {
      await notificationsApi.markAsRead(accessToken, notificationId);
      await fetchNotifications();
    } catch (err: any) {
      alert(`Failed to mark as read: ${err.message}`);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!accessToken) return;

    try {
      await notificationsApi.markAllAsRead(accessToken);
      await fetchNotifications();
    } catch (err: any) {
      alert(`Failed to mark all as read: ${err.message}`);
    }
  };

  const getTypeIcon = (type: string) => {
    const typeMap: Record<string, string> = {
      SYSTEM: '⚙️',
      ADMIN: '👑',
      TRADING: '📊',
      PAYMENT: '💳',
      ACCOUNT: '👤',
      ALERT: '⚠️',
    };
    return typeMap[type] || '📢';
  };

  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, string> = {
      SYSTEM: 'bg-gray-100 text-gray-700',
      ADMIN: 'bg-purple-100 text-purple-700',
      TRADING: 'bg-blue-100 text-blue-700',
      PAYMENT: 'bg-green-100 text-green-700',
      ACCOUNT: 'bg-yellow-100 text-yellow-700',
      ALERT: 'bg-red-100 text-red-700',
    };
    return typeMap[type] || 'bg-gray-100 text-gray-700';
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
              <p className="text-gray-600 mt-1">View system and platform notifications</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex gap-4 items-center">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 rounded-lg ${
                  filter === 'unread'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Unread
              </button>
              <button
                onClick={() => setFilter('system')}
                className={`px-4 py-2 rounded-lg ${
                  filter === 'system'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                System
              </button>
              <button
                onClick={() => setFilter('trading')}
                className={`px-4 py-2 rounded-lg ${
                  filter === 'trading'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Trading
              </button>
              <div className="flex-1"></div>
              <button
                onClick={handleMarkAllAsRead}
                className="px-4 py-2 text-blue-600 hover:text-blue-700"
              >
                Mark All as Read
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={fetchNotifications}
                className="mt-2 text-red-700 underline text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <p>No notifications found</p>
                <p className="text-sm text-gray-500 mt-2">
                  {filter === 'unread'
                    ? 'All notifications have been read'
                    : 'Notifications will appear here'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-6 hover:bg-gray-50 ${!notification.isRead ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start">
                      <div className="text-2xl mr-4">{getTypeIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-semibold text-gray-900">
                                {notification.title}
                              </h3>
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${getTypeBadge(notification.type)}`}
                              >
                                {notification.type}
                              </span>
                              {!notification.isRead && (
                                <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-gray-700 mb-2">{notification.message}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {!notification.isRead && (
                            <button
                              onClick={() => handleMarkAsRead(notification.id)}
                              className="ml-4 text-sm text-blue-600 hover:text-blue-700"
                            >
                              Mark as Read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
