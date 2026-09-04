'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, api } from './api';

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored tokens on mount
    const token = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (token) {
      api.getMe(token)
        .then(userData => {
          setUser(userData);
          setAccessToken(token);
        })
        .catch(() => {
          // Token might be expired, try refresh
          if (refreshToken) {
            api.refreshToken(refreshToken)
              .then(({ accessToken: newToken, refreshToken: newRefreshToken }) => {
                localStorage.setItem('accessToken', newToken);
                localStorage.setItem('refreshToken', newRefreshToken);
                return api.getMe(newToken);
              })
              .then(userData => {
                setUser(userData);
                setAccessToken(localStorage.getItem('accessToken'));
              })
              .catch(() => {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
              });
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.login({ email, password });
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    setAccessToken(response.accessToken);
    setUser(response.user);
  };

  const register = async (data: any) => {
    const response = await api.register(data);
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    setAccessToken(response.accessToken);
    setUser(response.user);
  };

  const logout = async () => {
    if (accessToken) {
      try {
        await api.logout(accessToken);
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setAccessToken(null);
    setUser(null);
  };

  const refreshAuth = async () => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const userData = await api.getMe(token);
      setUser(userData);
    }
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, register, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
