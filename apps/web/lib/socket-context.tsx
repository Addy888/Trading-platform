'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-context';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  authenticated: boolean;
  error: string | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  authenticated: false,
  error: null,
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authFailedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      authFailedTokenRef.current = null;
      return;
    }

    // Don't reconnect if authentication failed
    if (authFailedTokenRef.current === accessToken) {
      return;
    }

    // Create socket connection
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    console.log('[Socket.IO] Connecting to:', socketUrl, 'namespace: /trading');
    
    const newSocket = io(`${socketUrl}/trading`, {
      auth: {
        token: accessToken,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      autoConnect: true,
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      setAuthenticated(false);
      setError(null);
      authFailedTokenRef.current = null;
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnected(false);
      setAuthenticated(false);
      
      // Don't auto-reconnect on auth failures
      if (reason === 'io server disconnect' && authFailedTokenRef.current !== accessToken) {
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Socket.IO] Connection error:', err.message);
      console.error('[Socket.IO] Error details:', {
        message: err.message,
        stack: err.stack,
      });
      setError(err.message);
      setConnected(false);
      
      // Check if it's an auth error
      if (err.message.includes('Authentication') || err.message.includes('auth')) {
        authFailedTokenRef.current = accessToken;
        newSocket.disconnect();
      }
    });

    newSocket.on('connection:ready', (data) => {
      console.log('Connection ready:', data);
      setAuthenticated(true);
    });

    newSocket.on('system:error', (data) => {
      console.error('System error:', data);
      setError(data.message);
      
      // Stop reconnection on auth failures
      if (data.code === 'AUTH_FAILED' || data.code === 'UNAUTHORIZED') {
        setAuthenticated(false);
        authFailedTokenRef.current = accessToken;
        newSocket.disconnect();
      }
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.removeAllListeners();
      newSocket.disconnect();
      setSocket(null);
      setConnected(false);
      setAuthenticated(false);
    };
  }, [accessToken]);

  return (
    <SocketContext.Provider value={{ socket, connected, authenticated, error }}>
      {children}
    </SocketContext.Provider>
  );
}
