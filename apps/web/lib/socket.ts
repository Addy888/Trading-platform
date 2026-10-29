import { io, Socket } from 'socket.io-client';

/**
 * WebSocket Socket Connection
 * 
 * Singleton socket connection for real-time trading updates.
 * 
 */

let socket: Socket | null = null;
let socketAccessToken: string | null = null;
let socketAuthenticated = false;

export interface SocketEvents {
  'connection:ready': (data: any) => void;
  'account:update': (data: any) => void;
  'position:update': (data: any) => void;
  'trade:opened': (data: any) => void;
  'trade:closed': (data: any) => void;
  'challenge:update': (data: any) => void;
  'account:status': (data: any) => void;
  'system:error': (data: any) => void;
}

/**
 * Get or create socket connection
 */
export function getSocket(token?: string): Socket | null {
  if (typeof window === 'undefined') {
    return null; // Server-side rendering
  }
  if (!token) {
    disconnectSocket();
    return null;
  }

  if (socket && token && socketAccessToken !== token) {
    socket.disconnect();
    socket = null;
    socketAccessToken = null;
    socketAuthenticated = false;
  }

  if (!socket && token) {
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    
    socket = io(`${SOCKET_URL}/trading`, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });
    socketAccessToken = token;

    // Connection event logging
    socket.on('connect', () => {
      socketAuthenticated = false;
      console.log('✅ WebSocket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      socketAuthenticated = false;
      console.log('❌ WebSocket disconnected:', reason);
    });

    socket.on('connection:ready', () => {
      socketAuthenticated = true;
    });

    socket.on('connect_error', (error) => {
      console.error('🔴 WebSocket connection error:', error.message);
    });
  }

  return socket;
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socketAccessToken = null;
  socketAuthenticated = false;
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

export function isSocketAuthenticated(): boolean {
  return socketAuthenticated;
}

/**
 * Subscribe to account updates
 */
export function subscribeToAccount(accountId: string) {
  if (socket?.connected) {
    socket.emit('subscribe:account', { accountId });
  }
}

/**
 * Unsubscribe from account updates
 */
export function unsubscribeFromAccount(accountId: string) {
  if (socket?.connected) {
    socket.emit('unsubscribe:account', { accountId });
  }
}
