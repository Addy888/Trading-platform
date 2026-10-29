'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      // Clean up socket if user logs out
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
        setAuthenticated(false);
      }
      setAuthFailed(false);
      return;
    }

    // Don't reconnect if authentication failed
    if (authFailed) {
      return;
    }

    // Create socket connection
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    const newSocket = io(`${socketUrl}/trading`, {
      auth: {
        token: accessToken,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      autoConnect: true,
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      setAuthenticated(false);
      setError(null);
      setAuthFailed(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnected(false);
      setAuthenticated(false);
      
      // Don't auto-reconnect on auth failures
      if (reason === 'io server disconnect' && !authFailed) {
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err.message);
      setError(err.message);
      setConnected(false);
      
      // Check if it's an auth error
      if (err.message.includes('Authentication') || err.message.includes('auth')) {
        setAuthFailed(true);
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
        setAuthFailed(true);
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
  }, [accessToken, authFailed]);

  return (
    <SocketContext.Provider value={{ socket, connected, authenticated, error }}>
      {children}
    </SocketContext.Provider>
  );
}
