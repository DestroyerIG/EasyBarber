'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import { DashboardCards } from '@/components/DashboardCards';
import { ProfitBar } from '@/components/ProfitBar';
import { WeeklyChart } from '@/components/WeeklyChart';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { AppointmentModule } from '@/components/AppointmentModule';
import { ClientModule } from '@/components/ClientModule';
import { ServiceBarberModule } from '@/components/ServiceBarberModule';
import { FinanceModule } from '@/components/FinanceModule';
import { WhatsAppModule } from '@/components/WhatsAppModule';
import { useToast } from '@/components/Toast';
import { PricingPlansSection } from '@/components/marketing/PricingPlansSection';
import { billingApi } from '@/lib/billing';
import { isPlanId, PLAN_MAP } from '@/lib/plans';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { Settings, ShieldCheck } from 'lucide-react';
import type { DashboardData, TabId } from '@/types';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const router = useRouter();
  const checkoutTriggeredRef = useRef(false);
  const { logout, user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const access = useSubscriptionAccess(subscriptionStatus || user?.subscriptionStatus || null);
  const currentPlanLabel = user?.plan && isPlanId(user.plan)
    ? PLAN_MAP[user.plan].name
    : (user?.plan || 'Básico');

  const goToPlans = () => setActiveTab('planos');

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (user?.role === 'platform_admin') {
      setLoading(false);
      router.replace('/admin');
      return;
    }

    loadDashboard();
    loadSubscriptionStatus();
  }, [authLoading, user?.role]);

  useEffect(() => {
    if (authLoading || checkoutTriggeredRef.current || user?.role === 'platform_admin') {
      return;
    }

    const query = new URLSearchParams(window.location.search);

    const billingResult = query.get('billing');
    if (billingResult === 'success') {
      showToast('Pagamento confirmado. Sua assinatura será atualizada em instantes.', 'success');
      loadSubscriptionStatus();
    }
    if (billingResult === 'canceled') {
      showToast('Checkout cancelado. Você pode tentar novamente quando quiser.', 'info');
    }

    const checkoutPlan = query.get('checkoutPlan');
    if (!checkoutPlan || !isPlanId(checkoutPlan)) {
      return;
    }

    checkoutTriggeredRef.current = true;
    startCheckout(checkoutPlan);
  }, [authLoading, showToast, user]);

  const loadDashboard = async () => {
    try {
      const response = await api.get('/dashboard');
      setData(response.data);
    } catch (error) {
      showToast('Erro ao carregar dashboard. Redirecionando...', 'error');
      setTimeout(() => router.push('/login'), 2000);
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptionStatus = async () => {
    try {
      const response = await billingApi.getStatus();
      setSubscriptionStatus(response.subscriptionStatus);
    } catch {
      // A API de billing pode não estar configurada no ambiente local.
    }
  };

  const startCheckout = async (plan: 'basico' | 'profissional' | 'premium') => {
    try {
      const session = await billingApi.createCheckoutSession(plan);
      window.location.assign(session.checkoutUrl);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Não foi possível iniciar o checkout agora.';
      showToast(message, 'error');
    }
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const response = await billingApi.createPortalSession();
      window.location.assign(response.portalUrl);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Portal de assinatura indisponível no momento.';
      showToast(message, 'error');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (user?.role === 'platform_admin') {
    return <LoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-black">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={logout}
      />

      <main id="main-content" className="max-w-7xl mx-auto p-4 lg:p-8">
        {activeTab === 'dashboard' && data && (
          <>
            <h2 className="text-3xl font-bold text-white mb-8">Dashboard</h2>
            <DashboardCards data={data} />
            <ProfitBar data={data} />
            <WeeklyChart data={data.weeklyEarnings} />
          </>
        )}

        {activeTab === 'dashboard' && !data && (
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

        {activeTab === 'agendamentos' && (
          <FeatureGate
            access={access.evaluate('appointments')}
            onUpgrade={goToPlans}
            onManageBilling={openBillingPortal}
            title="Agendamentos indisponíveis"
          >
            <AppointmentModule />
          </FeatureGate>
        )}

        {activeTab === 'financeiro' && (
          <FeatureGate
            access={access.evaluate('finance')}
            onUpgrade={goToPlans}
            onManageBilling={openBillingPortal}
            title="Financeiro indisponível"
          >
            <FinanceModule
              reportAccess={access.evaluate('reports')}
              exportAccess={access.evaluate('exports')}
              onUpgrade={goToPlans}
              onManageBilling={openBillingPortal}
            />
          </FeatureGate>
        )}

        {activeTab === 'clientes' && (
          <FeatureGate
            access={access.evaluate('clients')}
            onUpgrade={goToPlans}
            onManageBilling={openBillingPortal}
            title="Clientes indisponível"
          >
            <ClientModule />
          </FeatureGate>
        )}

        {activeTab === 'whatsapp' && (
          <FeatureGate
            access={access.evaluate('whatsapp_automation')}
            onUpgrade={goToPlans}
            onManageBilling={openBillingPortal}
            title="Automação WhatsApp indisponível"
          >
            <WhatsAppModule />
          </FeatureGate>
        )}

        {activeTab === 'servicos' && (
          <FeatureGate
            access={access.evaluate('services')}
            onUpgrade={goToPlans}
            onManageBilling={openBillingPortal}
            title="Gestão de serviços indisponível"
          >
            <ServiceBarberModule />
          </FeatureGate>
        )}

        {activeTab === 'planos' && (
          <div>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-white">Planos e Assinatura</h2>
                <p className="mt-2 text-gray-400">
                  Plano atual: <span className="font-semibold text-white">{currentPlanLabel}</span>
                  {subscriptionStatus ? (
                    <>
                      {' '}
                      · Status: <span className="font-semibold text-emerald-400">{subscriptionStatus}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="btn-secondary flex items-center gap-2 px-4 py-2"
              >
                <ShieldCheck size={16} />
                {portalLoading ? 'Abrindo...' : 'Gerenciar assinatura'}
              </button>
            </div>

            <PricingPlansSection
              showHeader={false}
              currentPlan={user?.plan || 'basico'}
              subscriptionStatus={subscriptionStatus}
            />
          </div>
        )}

        {activeTab === 'configuracoes' && (
          <FeatureGate
            access={access.evaluate('advanced_admin')}
            onUpgrade={goToPlans}
            onManageBilling={openBillingPortal}
            title="Administração avançada indisponível"
          >
            <div>
              <h2 className="text-3xl font-bold text-white mb-8">Configurações</h2>
              <div className="bg-dark-light border border-primary/20 rounded-xl p-8">
                <div className="flex flex-col items-center justify-center py-12">
                  <Settings className="text-gray-400 mb-4" size={48} />
                  <h3 className="text-xl font-semibold text-white mb-2">Configurações</h3>
                  <p className="text-gray-400 text-center max-w-md">
                    Configure dados da barbearia, horário de funcionamento, notificações e integrações.
                  </p>
                </div>
              </div>
            </div>
          </FeatureGate>
        )}
      </main>
    </div>
  );
}
