'use client';

/**
 * Connection Status Indicator
 * 
 * Shows WebSocket connection state
 * 
 * Shows the WebSocket connection state only; market-data status is reported separately.
 */

interface ConnectionStatusProps {
  state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
}

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  const getStatusConfig = () => {
    switch (state) {
      case 'connected':
        return {
          color: 'bg-green-500',
          text: 'Connected',
          icon: '●',
        };
      case 'connecting':
        return {
          color: 'bg-yellow-500',
          text: 'Connecting...',
          icon: '◐',
        };
      case 'reconnecting':
        return {
          color: 'bg-orange-500',
          text: 'Reconnecting...',
          icon: '◑',
        };
      case 'disconnected':
        return {
          color: 'bg-red-500',
          text: 'Offline',
          icon: '○',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${config.color} animate-pulse`} />
      <span className="text-gray-600 dark:text-gray-300">{config.text}</span>
    </div>
  );
}
