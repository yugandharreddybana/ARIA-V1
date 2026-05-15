'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { PublicUser, AuthResponse } from '@aria/shared';

interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
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
    localStorage.setItem('aria_token', token);
  }, []);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('aria_token');
    if (!token) { setIsLoading(false); return; }
    try {
      const data = await api<{ user: PublicUser }>('/auth/me');
      setUser(data.user);
    } catch {
      localStorage.removeItem('aria_token');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(data.accessToken);
    setUser(data.user);
  }, [setToken]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const data = await api<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    setToken(data.accessToken);
    setUser(data.user);
  }, [setToken]);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* noop */ }
    localStorage.removeItem('aria_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
