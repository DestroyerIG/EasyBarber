'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import type { TabId } from '@/types';

function TrialBanner() {
  const { user } = useAuth();
  const router = useRouter();

  if (user?.subscriptionStatus !== 'trialing' || !user.subscriptionCurrentPeriodEnd) {
    return null;
  }

  const endsAt = new Date(user.subscriptionCurrentPeriodEnd);
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-center text-sm text-emerald-200">
      {daysLeft > 0 ? (
        <>
          <span className="font-semibold">{daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}</span> no período gratuito ·{' '}
          <button
            type="button"
            onClick={() => router.push('/dashboard/planos')}
            className="font-bold text-emerald-300 underline underline-offset-2 hover:text-white transition"
          >
            Assine agora
          </button>
          {' '}para não perder o acesso
        </>
      ) : (
        <>
          Seu período gratuito encerrou ·{' '}
          <button
            type="button"
            onClick={() => router.push('/dashboard/planos')}
            className="font-bold text-emerald-300 underline underline-offset-2 hover:text-white transition"
          >
            Escolha um plano
          </button>
        </>
      )}
    </div>
  );
}

const DASHBOARD_TABS: readonly TabId[] = [
  'dashboard',
  'agendamentos',
  'financeiro',
  'clientes',
  'servicos',
  'planos',
  'configuracoes',
  'whatsapp',
];

function isTabId(value: string): value is TabId {
  return DASHBOARD_TABS.includes(value as TabId);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  // Suporta ambos formatos de URL: /dashboard/agendamentos e /agendamentos
  const pathSegments = pathname.split('/').filter(Boolean);
  const rawSegment = pathSegments[0] === 'dashboard'
    ? (pathSegments[1] || 'dashboard')
    : (pathSegments[0] || 'dashboard');
  const activeTab: TabId = isTabId(rawSegment) ? rawSegment : 'dashboard';

  const handleTabChange = (tab: TabId) => {
    if (tab === 'dashboard') {
      router.push('/dashboard');
    } else {
      router.push(`/${tab}`);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Navbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={logout}
      />
      <TrialBanner />
      <main id="main-content" className="max-w-7xl mx-auto p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}