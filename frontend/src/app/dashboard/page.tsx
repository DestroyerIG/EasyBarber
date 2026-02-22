'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
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
import { Settings, CreditCard, Clock, Wallet, UserCheck, Scissors } from 'lucide-react';
import type { DashboardData, TabId } from '@/types';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get('/dashboard');
      setData(response.data);
    } catch (error) {
      showToast('Erro ao carregar dashboard. Redirecionando...', 'error');
      setTimeout(() => router.push('/'), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-black">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto p-4 lg:p-8">
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
          <AppointmentModule />
        )}

        {activeTab === 'financeiro' && (
          <FinanceModule />
        )}

        {activeTab === 'clientes' && (
          <ClientModule />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppModule />
        )}

        {activeTab === 'servicos' && (
          <ServiceBarberModule />
        )}

        {activeTab === 'planos' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-8">Planos</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-dark-light border border-gray-700 rounded-xl p-8">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Básico</h3>
                  <p className="text-4xl font-bold text-primary">R$ 49<span className="text-sm text-gray-400">/mês</span></p>
                </div>
                <ul className="space-y-3 text-gray-400 text-sm">
                  <li className="flex items-center gap-2">✅ 1 barbeiro</li>
                  <li className="flex items-center gap-2">✅ Agendamentos ilimitados</li>
                  <li className="flex items-center gap-2">✅ Controle financeiro básico</li>
                  <li className="flex items-center gap-2">❌ Relatórios mensais</li>
                  <li className="flex items-center gap-2">✅ Bot WhatsApp</li>
                </ul>
              </div>

              <div className="bg-dark-light border-2 border-primary rounded-xl p-8 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-black text-xs font-bold px-4 py-1 rounded-full">
                  POPULAR
                </div>
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Profissional</h3>
                  <p className="text-4xl font-bold text-primary">R$ 99<span className="text-sm text-gray-400">/mês</span></p>
                </div>
                <ul className="space-y-3 text-gray-400 text-sm">
                  <li className="flex items-center gap-2">✅ Até 5 barbeiros</li>
                  <li className="flex items-center gap-2">✅ Agendamentos ilimitados</li>
                  <li className="flex items-center gap-2">✅ Controle financeiro completo</li>
                  <li className="flex items-center gap-2">✅ Relatórios mensais</li>
                  <li className="flex items-center gap-2">✅ Bot WhatsApp</li>
                </ul>
              </div>

              <div className="bg-dark-light border border-gray-700 rounded-xl p-8">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
                  <p className="text-4xl font-bold text-primary">R$ 199<span className="text-sm text-gray-400">/mês</span></p>
                </div>
                <ul className="space-y-3 text-gray-400 text-sm">
                  <li className="flex items-center gap-2">✅ Barbeiros ilimitados</li>
                  <li className="flex items-center gap-2">✅ Agendamentos ilimitados</li>
                  <li className="flex items-center gap-2">✅ Controle financeiro completo</li>
                  <li className="flex items-center gap-2">✅ Relatórios mensais</li>
                  <li className="flex items-center gap-2">✅ Bot WhatsApp</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'configuracoes' && (
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
        )}
      </main>
    </div>
  );
}
