'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';
import type { TabId } from '@/types';

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
      <main id="main-content" className="max-w-7xl mx-auto p-4 lg:p-8">
        {children}
      </main>
    </div>
  );
}