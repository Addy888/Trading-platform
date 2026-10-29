import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { disconnectSocket, getSocket, isSocketAuthenticated } from '../socket';

/**
 * Hook to manage WebSocket connection
 */
export function useSocket(token?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('disconnected');

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setSocket(null);
      setConnectionState('disconnected');
      setIsConnected(false);
      setIsAuthenticated(false);
      return;
    }

    setConnectionState('connecting');
    const socketInstance = getSocket(token);

    if (socketInstance) {
      setSocket(socketInstance);

      // Handle connection events
      const handleConnect = () => {
        setIsConnected(true);
        setIsAuthenticated(isSocketAuthenticated());
        setConnectionState('connected');
      };

      const handleDisconnect = () => {
        setIsConnected(false);
        setIsAuthenticated(false);
        setConnectionState('disconnected');
      };

      const handleReconnecting = () => {
        setConnectionState('reconnecting');
      };

      const handleConnectError = () => {
        setConnectionState('disconnected');
        setIsAuthenticated(false);
      };
      const handleReady = () => setIsAuthenticated(true);

      socketInstance.on('connect', handleConnect);
      socketInstance.on('disconnect', handleDisconnect);
      socketInstance.on('reconnecting', handleReconnecting);
      socketInstance.on('connect_error', handleConnectError);
      socketInstance.on('connection:ready', handleReady);

      // Check initial connection state
      if (socketInstance.connected) {
        handleConnect();
      }

      return () => {
        socketInstance.off('connect', handleConnect);
        socketInstance.off('disconnect', handleDisconnect);
        socketInstance.off('reconnecting', handleReconnecting);
        socketInstance.off('connect_error', handleConnectError);
        socketInstance.off('connection:ready', handleReady);
      };
    }
  }, [token]);

  return { socket, isConnected, isAuthenticated, connectionState };
}
