'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { billingApi } from '@/lib/billing';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { getApiErrorMessage } from '@/utils/handleApiError';

/**
 * Hook compartilhado para todas as sub-páginas do dashboard.
 * Fornece: access, goToPlans, openBillingPortal, portalLoading
 */
export function useDashboardBilling() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const access = useSubscriptionAccess(subscriptionStatus || user?.subscriptionStatus || null);

  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const response = await billingApi.getStatus();
      setSubscriptionStatus(response.subscriptionStatus);
    } catch {
      // billing pode não estar configurado em ambiente local
    }
  }, []);

  useEffect(() => {
    loadSubscriptionStatus();
  }, [loadSubscriptionStatus]);

  const goToPlans = () => router.push('/dashboard/planos');

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const response = await billingApi.createPortalSession();
      window.location.assign(response.portalUrl);
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Portal de assinatura indisponível no momento.');
      showToast(message, 'error');
    } finally {
      setPortalLoading(false);
    }
  };

  return { access, goToPlans, openBillingPortal, portalLoading, subscriptionStatus };
}