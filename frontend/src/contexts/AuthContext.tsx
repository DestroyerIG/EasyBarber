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

const resolvePostAuthRoute = (role: string | undefined, redirectTo?: string) => {
  if (role === 'platform_admin') {
    return '/admin';
  }

  return redirectTo || '/dashboard';
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      const response = await api.get('/auth/me');
      const userData = response.data?.user || response.data || null;
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
        const response = await api.get('/auth/me');
        if (!mounted) return;

        const userData = response.data?.user || response.data || null;
        setUser(userData);
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

  const login = useCallback(
    async (email: string, password: string, options?: AuthRedirectOptions) => {
      setLoading(true);

      try {
        await api.post('/auth/login', { email, password });

        const userData = await fetchMe();

        if (!userData) {
          throw new Error('Sessão não foi carregada após o login.');
        }

        router.replace(resolvePostAuthRoute(userData.role, options?.redirectTo));
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
        await api.post('/auth/register', data);

        const userData = await fetchMe();

        if (!userData) {
          throw new Error('Sessão não foi carregada após o cadastro.');
        }

        router.replace(resolvePostAuthRoute(userData.role, options?.redirectTo));
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