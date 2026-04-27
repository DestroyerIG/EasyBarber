'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { isPublicAuthPath } from '@/lib/publicRoutes';
import type { PlanId } from '@/lib/plans';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, options?: AuthRedirectOptions) => Promise<void>;
  register: (data: RegisterData, options?: AuthRedirectOptions) => Promise<RegisterResult>;
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
  cpfCnpj: string;
  password: string;
  desiredPlan: PlanId;
}

interface RegisterResult {
  verificationRequired: boolean;
  verificationEmailSent: boolean;
  message: string;
  email: string;
}

interface RegisterApiPayload {
  verificationRequired?: boolean;
  verificationEmailSent?: boolean;
  message?: string;
  user?: {
    email?: string;
  };
}

const resolvePostAuthRoute = (role: string | undefined, redirectTo?: string) => {
  if (role === 'platform_admin') {
    return '/admin';
  }

  return redirectTo || '/dashboard';
};

const ACCESS_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

const hasPaymentEvidence = (billingStatus: Record<string, unknown>) => {
  const status = typeof billingStatus.subscriptionStatus === 'string'
    ? billingStatus.subscriptionStatus
    : null;
  const provider = typeof billingStatus.provider === 'string' ? billingStatus.provider : null;
  const paymentMethod = typeof billingStatus.paymentMethod === 'string'
    ? billingStatus.paymentMethod
    : null;

  if (!ACCESS_SUBSCRIPTION_STATUSES.has(status || '')) {
    return false;
  }

  if (status === 'trialing') {
    return Boolean(billingStatus.providerSubscriptionId);
  }

  if (provider === 'asaas' || paymentMethod === 'pix') {
    return Boolean(billingStatus.providerPaymentId && billingStatus.lastPaymentDate);
  }

  if (provider === 'stripe' || paymentMethod === 'card') {
    return Boolean(billingStatus.providerSubscriptionId);
  }

  return false;
};

const resolveTenantPostLoginRoute = async (redirectTo?: string) => {
  try {
    const response = await api.get('/billing/status');

    if (!response.data || typeof response.data !== 'object' || !hasPaymentEvidence(response.data)) {
      return '/planos';
    }
  } catch {
    return '/planos';
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
  const pathname = usePathname();
  const isPublicRoute = isPublicAuthPath(pathname || '/');

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

    if (isPublicRoute) {
      setUser(null);
      setLoading(false);

      return () => {
        mounted = false;
      };
    }

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
  }, [isPublicRoute]);

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
        const postAuthRoute = userData.role === 'platform_admin'
          ? resolvePostAuthRoute(userData.role, options?.redirectTo)
          : await resolveTenantPostLoginRoute(options?.redirectTo);
        router.replace(postAuthRoute);
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
    async (data: RegisterData, options?: AuthRedirectOptions): Promise<RegisterResult> => {
      void options;
      setLoading(true);

      try {
        const response = await api.post('/auth/register', data);
        const payload = response.data as RegisterApiPayload;

        setUser(null);

        return {
          verificationRequired: payload.verificationRequired !== false,
          verificationEmailSent: payload.verificationEmailSent === true,
          message:
            payload.message ||
            'Cadastro realizado. Verifique seu e-mail para ativar sua conta antes de fazer login.',
          email: payload.user?.email || data.email,
        };
      } catch (error) {
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
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
