'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { PublicUser, AuthResponse } from '@aria/shared';

interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setToken = useCallback((token: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('aria_token', token);
  }, []);

  const loadUser = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('aria_token') : null;
    if (!token) { setIsLoading(false); return; }
    try {
      // GET /auth/me returns { user: PublicUser }
      const data = await api<{ user: PublicUser }>('/auth/me');
      setUser(data.user);
    } catch {
      if (typeof window !== 'undefined') localStorage.removeItem('aria_token');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    // POST /auth/login returns { user, accessToken } (AuthResponse shape)
    const data = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.accessToken);
    setUser(data.user);
  }, [setToken]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    // POST /auth/signup returns { user, accessToken } (AuthResponse shape)
    const data = await api<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setToken(data.accessToken);
    setUser(data.user);
  }, [setToken]);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* noop */ }
    if (typeof window !== 'undefined') localStorage.removeItem('aria_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
      setToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
