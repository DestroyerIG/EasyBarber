'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardCards } from '@/components/DashboardCards';
import { ProfitBar } from '@/components/ProfitBar';
import { WeeklyChart } from '@/components/WeeklyChart';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useToast } from '@/components/Toast';
import { billingApi, type CheckoutPaymentMethod } from '@/lib/billing';
import { isPlanId } from '@/lib/plans';
import { getApiErrorCode } from '@/utils/handleApiError';
import type { DashboardData } from '@/types';

const PIX_STORAGE_KEY = 'easybarber:pixCheckout';

const resolveCheckoutPaymentMethod = (value: string | null): CheckoutPaymentMethod => {
  if (value === 'pix') {
    return 'pix';
  }

  return 'card';
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const checkoutTriggeredRef = useRef(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const loadDashboard = useCallback(async () => {
    try {
      const response = await api.get('/dashboard');
      setData(response.data);
    } catch (error: unknown) {
      if (getApiErrorCode(error) === 'SUBSCRIPTION_REQUIRED') {
        showToast('Finalize o pagamento para acessar o sistema.', 'info');
        router.replace('/planos');
        return;
      }

      showToast('Erro ao carregar dashboard. Redirecionando...', 'error');
      setTimeout(() => router.push('/login'), 2000);
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  const startCheckout = useCallback(async (
    plan: 'basico' | 'profissional' | 'premium',
    paymentMethod: CheckoutPaymentMethod = 'card'
  ) => {
    try {
      const session = await billingApi.createCheckoutSession(plan, paymentMethod);

      if (session.provider === 'stripe') {
        window.location.assign(session.checkoutUrl);
        return;
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(PIX_STORAGE_KEY, JSON.stringify(session));
      }

      showToast('Cobrança Pix criada. Finalize o pagamento na aba de planos.', 'info');
      router.push('/planos');
    } catch {
      showToast('Não foi possível iniciar o checkout agora.', 'error');
    }
  }, [router, showToast]);

  useEffect(() => {
    if (authLoading) return;

    if (user?.role === 'platform_admin') {
      setLoading(false);
      router.replace('/admin');
      return;
    }

    loadDashboard();
  }, [authLoading, loadDashboard, router, user?.role]);

  useEffect(() => {
    if (authLoading || checkoutTriggeredRef.current || user?.role === 'platform_admin') return;

    const query = new URLSearchParams(window.location.search);

    if (query.get('billing') === 'success') {
      showToast('Pagamento confirmado. Sua assinatura será atualizada em instantes.', 'success');
    }
    if (query.get('billing') === 'canceled') {
      showToast('Checkout cancelado. Você pode tentar novamente quando quiser.', 'info');
    }

    const checkoutPlan = query.get('checkoutPlan');
    if (!checkoutPlan || !isPlanId(checkoutPlan)) return;

    const checkoutMethod = resolveCheckoutPaymentMethod(
      query.get('checkoutMethod') || query.get('paymentMethod')
    );

    checkoutTriggeredRef.current = true;
    startCheckout(checkoutPlan, checkoutMethod);
  }, [authLoading, showToast, startCheckout, user?.role]);

  if (loading || user?.role === 'platform_admin') {
    return <LoadingSkeleton />;
  }

  return (
    <>
      <h2 className="text-3xl font-bold text-white mb-8">Dashboard</h2>

      {data ? (
        <>
          <DashboardCards data={data} />
          <ProfitBar data={data} />
          <WeeklyChart data={data.weeklyEarnings} />
        </>
      ) : (
        <div className="bg-dark-light border border-red-500/20 rounded-xl p-8 text-center">
          <p className="text-gray-400">Não foi possível carregar os dados do dashboard.</p>
          <button
            onClick={loadDashboard}
            className="mt-4 px-6 py-2 bg-primary hover:bg-orange-600 text-black font-bold rounded-lg transition-all"
          >
            Tentar Novamente
          </button>
        </div>
      )}
    </>
  );
}
