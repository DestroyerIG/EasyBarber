'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface UseRequireRoleOptions {
  allowedRoles: string[];
  redirectTo?: string;
  unauthenticatedRedirectTo?: string;
}

export const useRequireRole = ({
  allowedRoles,
  redirectTo = '/dashboard',
  unauthenticatedRedirectTo = '/login',
}: UseRequireRoleOptions) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAuthorized = useMemo(() => {
    if (!user) {
      return false;
    }

    return allowedRoles.includes(user.role);
  }, [allowedRoles, user]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.replace(unauthenticatedRedirectTo);
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      router.replace(redirectTo);
    }
  }, [allowedRoles, loading, redirectTo, router, unauthenticatedRedirectTo, user]);

  return {
    isChecking: loading,
    isAuthorized,
    user,
  };
};
