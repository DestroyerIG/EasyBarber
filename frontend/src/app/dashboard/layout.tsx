'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Navbar } from '@/components/Navbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  // Extrai o segmento após /dashboard, ex: /dashboard/agendamentos → 'agendamentos'
  const activeTab = pathname.split('/')[2] || 'dashboard';

  const handleTabChange = (tab: string) => {
    if (tab === 'dashboard') {
      router.push('/dashboard');
    } else {
      router.push(`/dashboard/${tab}`);
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