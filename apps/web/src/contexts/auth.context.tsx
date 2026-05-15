'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient, ApiError } from '@/lib/api';
import type { PublicUser, AuthResponse } from '@aria/shared';

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await apiClient.post<{ success: boolean; data: { accessToken: string } }>(
        '/api/auth/refresh', {}
      );
      const token = res.data.accessToken;
      setState(prev => ({ ...prev, accessToken: token }));
      return token;
    } catch {
      setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false });
      return null;
    }
  }, []);

  // On mount: try to restore session via refresh token cookie
  useEffect(() => {
    (async () => {
      const token = await refreshAccessToken();
      if (token) {
        try {
          const res = await apiClient.get<{ success: boolean; data: PublicUser }>(
            '/api/auth/me', token
          );
          setState({ user: res.data, accessToken: token, isLoading: false, isAuthenticated: true });
        } catch {
          setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false });
        }
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    })();
  }, [refreshAccessToken]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiClient.post<{ success: boolean; data: AuthResponse }>(
      '/api/auth/login', { email, password }
    );
    setState({
      user: res.data.user,
      accessToken: res.data.accessToken,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const res = await apiClient.post<{ success: boolean; data: AuthResponse }>(
      '/api/auth/signup', { name, email, password }
    );
    setState({
      user: res.data.user,
      accessToken: res.data.accessToken,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout', {});
    } finally {
      setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
