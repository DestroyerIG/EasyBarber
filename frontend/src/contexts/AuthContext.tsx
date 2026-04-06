'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import type { PlanId } from '@/lib/plans';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, options?: AuthRedirectOptions) => Promise<void>;
  register: (data: RegisterData, options?: AuthRedirectOptions) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<User | null>;
}

interface AuthRedirectOptions {
  redirectTo?: string;
}

interface RegisterData {
  barbershopName: string;
  ownerName: string;
  email: string;
  whatsapp: string;
  password: string;
  desiredPlan: PlanId;
}

const resolvePostAuthRoute = (role: string | undefined, redirectTo?: string) => {
  if (role === 'platform_admin') {
    return '/admin';
  }

  return redirectTo || '/dashboard';
};

const isUser = (value: unknown): value is User => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<User>;
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.barbershopName === 'string' &&
    typeof candidate.plan === 'string'
  );
};

const extractUserFromResponse = (data: unknown): User | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (isUser(payload.user)) {
    return payload.user;
  }

  if (isUser(data)) {
    return data;
  }

  return null;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshMe = useCallback(async (): Promise<User | null> => {
    try {
      const response = await api.get('/auth/me');
      const resolvedUser = extractUserFromResponse(response.data);
      setUser(resolvedUser);
      return resolvedUser;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const response = await api.get('/auth/me');
        if (!mounted) return;

        setUser(extractUserFromResponse(response.data));
      } catch {
        if (!mounted) return;
        setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onSessionExpired = () => {
      setUser(null);
      setLoading(false);
    };

    window.addEventListener('auth:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', onSessionExpired);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, options?: AuthRedirectOptions) => {
      setLoading(true);

      try {
        const response = await api.post('/auth/login', { email, password });
        const userData = extractUserFromResponse(response.data) ?? (await refreshMe());

        if (!userData) {
          throw new Error('Sessão não foi carregada após o login.');
        }

        setUser(userData);
        router.replace(resolvePostAuthRoute(userData.role, options?.redirectTo));
        router.refresh();
      } catch (error) {
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [refreshMe, router]
  );

  const register = useCallback(
    async (data: RegisterData, options?: AuthRedirectOptions) => {
      setLoading(true);

      try {
        const response = await api.post('/auth/register', data);
        const userData = extractUserFromResponse(response.data) ?? (await refreshMe());

        if (!userData) {
          throw new Error('Sessão não foi carregada após o cadastro.');
        }

        setUser(userData);
        router.replace(resolvePostAuthRoute(userData.role, options?.redirectTo));
        router.refresh();
      } catch (error) {
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [refreshMe, router]
  );

  const logout = useCallback(async () => {
    setLoading(true);

    try {
      await api.post('/auth/logout');
    } catch {
      // mantém logout local mesmo se a API falhar
    } finally {
      setUser(null);
      setLoading(false);
      router.replace('/login');
      router.refresh();
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}