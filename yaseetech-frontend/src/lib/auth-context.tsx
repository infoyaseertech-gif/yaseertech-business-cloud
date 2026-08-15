'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, AUTH_EXPIRED_EVENT } from './api';
import { clearStoredTokens, getStoredTokens, setStoredTokens } from './token-storage';
import { UserProfile } from './types';

interface RegisterInput {
  businessName: string;
  ownerFullName: string;
  email: string;
  phone?: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchProfile = useCallback(async () => {
    try {
      const profile = await apiFetch<UserProfile>('/users/me');
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const tokens = getStoredTokens();
    if (!tokens) {
      setLoading(false);
      return;
    }
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      router.push('/login');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [router]);

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await apiFetch<{
        user: { id: string; tenantId: string };
        accessToken: string;
        refreshToken: string;
      }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
        skipAuth: true,
      });
      setStoredTokens(result);
      await fetchProfile();
    },
    [fetchProfile],
  );

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await apiFetch<{
        user: { id: string; tenantId: string };
        accessToken: string;
        refreshToken: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
        skipAuth: true,
      });
      setStoredTokens(result);
      await fetchProfile();
    },
    [fetchProfile],
  );

  const logout = useCallback(async () => {
    const tokens = getStoredTokens();
    if (tokens) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => {
        // Best-effort server-side revocation -- clear local state regardless,
        // since the user's intent to log out shouldn't be blocked by a
        // network hiccup.
      });
    }
    clearStoredTokens();
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, loading, register, login, logout, refetchProfile: fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
