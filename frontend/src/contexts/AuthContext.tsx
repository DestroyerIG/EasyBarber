'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, options?: AuthRedirectOptions) => Promise<void>;
  register: (data: RegisterData, options?: AuthRedirectOptions) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
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
}

interface AuthPayload {
  token?: string;
  accessToken?: string;
  user?: User;
}

const TOKEN_KEY = 'token';

const resolvePostAuthRoute = (role: string | undefined, redirectTo?: string) => {
  if (role === 'platform_admin') {
    return '/admin';
  }

  return redirectTo || '/dashboard';
};

const setAuthToken = (token: string | null) => {
  if (typeof window === 'undefined') return;

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common.Authorization;
  }
};

const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

const extractAuthPayload = (data: unknown): AuthPayload => {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const payload = data as Record<string, unknown>;

  return {
    token: typeof payload.token === 'string' ? payload.token : undefined,
    accessToken:
      typeof payload.accessToken === 'string' ? payload.accessToken : undefined,
    user: (payload.user as User | undefined) ?? undefined,
  };
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      const response = await api.get('/auth/me');
      const userData = (response.data?.user || response.data || null) as User | null;
      setUser(userData);
      return userData;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const token = getAuthToken();

        if (!token) {
          if (mounted) setUser(null);
          return;
        }

        api.defaults.headers.common.Authorization = `Bearer ${token}`;

        const response = await api.get('/auth/me');
        if (!mounted) return;

        const userData = (response.data?.user || response.data || null) as User | null;
        setUser(userData);
      } catch {
        if (!mounted) return;
        setAuthToken(null);
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

  const login = useCallback(
    async (email: string, password: string, options?: AuthRedirectOptions) => {
      setLoading(true);

      try {
        const response = await api.post('/auth/login', { email, password });
        const payload = extractAuthPayload(response.data);
        const token = payload.token || payload.accessToken;

        if (!token) {
          throw new Error('Token não retornado pelo backend no login.');
        }

        setAuthToken(token);

        const userData = payload.user ?? (await fetchMe());

        if (!userData) {
          throw new Error('Sessão não foi carregada após o login.');
        }

        setUser(userData);
        router.replace(resolvePostAuthRoute(userData.role, options?.redirectTo));
      } catch (error) {
        setAuthToken(null);
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [fetchMe, router]
  );

  const register = useCallback(
    async (data: RegisterData, options?: AuthRedirectOptions) => {
      setLoading(true);

      try {
        const response = await api.post('/auth/register', data);
        const payload = extractAuthPayload(response.data);
        const token = payload.token || payload.accessToken;

        if (!token) {
          throw new Error('Token não retornado pelo backend no cadastro.');
        }

        setAuthToken(token);

        const userData = payload.user ?? (await fetchMe());

        if (!userData) {
          throw new Error('Sessão não foi carregada após o cadastro.');
        }

        setUser(userData);
        router.replace(resolvePostAuthRoute(userData.role, options?.redirectTo));
      } catch (error) {
        setAuthToken(null);
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [fetchMe, router]
  );

  const logout = useCallback(async () => {
    setLoading(true);

    try {
      await api.post('/auth/logout');
    } catch {
      // mantém logout local mesmo se a API falhar
    } finally {
      setAuthToken(null);
      setUser(null);
      setLoading(false);
      router.replace('/login');
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser: fetchMe,
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