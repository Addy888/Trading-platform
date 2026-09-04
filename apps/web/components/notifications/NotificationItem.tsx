'use client';

import { Notification, NotificationPriority } from '@/lib/notifications-api';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { markAsRead } = useNotifications();

  const handleClick = () => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    onClick?.();
  };

  const priorityStyles = {
    LOW: 'text-gray-500',
    NORMAL: 'text-blue-500',
    HIGH: 'text-orange-500',
    CRITICAL: 'text-red-500',
  };

  const priorityIcons = {
    LOW: '🔵',
    NORMAL: '🔔',
    HIGH: '⚠️',
    CRITICAL: '🚨',
  };

  return (
    <div
      onClick={handleClick}
      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
        !notification.isRead ? 'bg-blue-50' : ''
      }`}
    >
      <div className="flex items-start space-x-3">
        {/* Priority Indicator */}
        <div className="flex-shrink-0 mt-1">
          <span className={`text-lg ${priorityStyles[notification.priority]}`}>
            {priorityIcons[notification.priority]}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className={`text-sm font-medium text-gray-900 ${!notification.isRead ? 'font-semibold' : ''}`}>
              {notification.title}
            </p>
            {!notification.isRead && (
              <span className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full"></span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">
            {notification.message}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    </div>
  );
}
