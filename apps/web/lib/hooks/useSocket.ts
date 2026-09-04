import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '../socket';

/**
 * Hook to manage WebSocket connection
 */
export function useSocket(token?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('disconnected');

  useEffect(() => {
    if (!token) {
      setConnectionState('disconnected');
      return;
    }

    setConnectionState('connecting');
    const socketInstance = getSocket(token);

    if (socketInstance) {
      setSocket(socketInstance);

      // Handle connection events
      const handleConnect = () => {
        setIsConnected(true);
        setConnectionState('connected');
      };

      const handleDisconnect = () => {
        setIsConnected(false);
        setConnectionState('disconnected');
      };

      const handleReconnecting = () => {
        setConnectionState('reconnecting');
      };

      const handleConnectError = () => {
        setConnectionState('disconnected');
      };

      socketInstance.on('connect', handleConnect);
      socketInstance.on('disconnect', handleDisconnect);
      socketInstance.on('reconnecting', handleReconnecting);
      socketInstance.on('connect_error', handleConnectError);

      // Check initial connection state
      if (socketInstance.connected) {
        handleConnect();
      }

      return () => {
        socketInstance.off('connect', handleConnect);
        socketInstance.off('disconnect', handleDisconnect);
        socketInstance.off('reconnecting', handleReconnecting);
        socketInstance.off('connect_error', handleConnectError);
      };
    }
  }, [token]);

  return { socket, isConnected, connectionState };
}
