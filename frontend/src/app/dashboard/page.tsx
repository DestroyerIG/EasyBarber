'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar, DollarSign, TrendingUp, Users, LogOut, Menu } from 'lucide-react';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get('/dashboard');
      setData(response.data);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      router.push('/');
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-2xl text-primary">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <nav className="bg-dark-light border-b border-primary/20 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden text-primary"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-2xl font-bold text-primary">💈 BarberPro</h1>
          </div>
          
          <div className="hidden lg:flex gap-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'dashboard' 
                  ? 'bg-primary text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('agendamentos')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'agendamentos' 
                  ? 'bg-primary text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Agendamentos
            </button>
            <button
              onClick={() => setActiveTab('financeiro')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'financeiro' 
                  ? 'bg-primary text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Financeiro
            </button>
            <button
              onClick={() => setActiveTab('clientes')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'clientes' 
                  ? 'bg-primary text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Clientes
            </button>
            <button
              onClick={() => setActiveTab('servicos')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'servicos' 
                  ? 'bg-primary text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Serviços
            </button>
              <button
              onClick={() => setActiveTab('configuracoes')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'configuracoes' 
                  ? 'bg-primary text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Configurações
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-primary transition-all"
          >
            <LogOut size={24} />
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 lg:p-8">
        {activeTab === 'dashboard' && (
          <>
            <h2 className="text-3xl font-bold text-white mb-8">Dashboard</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-dark-light border border-primary/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Calendar className="text-primary" size={32} />
                  <span className="text-3xl font-bold text-primary">
                    {data.appointmentsToday}
                  </span>
                </div>
                <p className="text-gray-400">Agendamentos Hoje</p>
              </div>

              <div className="bg-dark-light border border-green-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <DollarSign className="text-green-500" size={32} />
                  <span className="text-3xl font-bold text-green-500">
                    R$ {data.earningsToday.toFixed(2)}
                  </span>
                </div>
                <p className="text-gray-400">Ganhos do Dia</p>
              </div>

              <div className="bg-dark-light border border-red-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <TrendingUp className="text-red-500" size={32} />
                  <span className="text-3xl font-bold text-red-500">
                    R$ {data.expensesToday.toFixed(2)}
                  </span>
                </div>
                <p className="text-gray-400">Gastos do Dia</p>
              </div>

              <div className="bg-dark-light border border-blue-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Users className="text-blue-500" size={32} />
                  <span className="text-3xl font-bold text-blue-500">
                    {data.totalClients}
                  </span>
                </div>
                <p className="text-gray-400">Total de Clientes</p>
              </div>
            </div>

            <div className="bg-dark-light border border-primary/20 rounded-xl p-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Lucro do Dia</h3>
                <span className={`text-3xl font-bold ${
                  data.profitToday >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  R$ {data.profitToday.toFixed(2)}
                </span>
              </div>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ 
                    width: data.earningsToday > 0 
                      ? `${(data.profitToday / data.earningsToday) * 100}%` 
                      : '0%' 
                  }}
                />
              </div>
            </div>

            <div className="bg-dark-light border border-primary/20 rounded-xl p-8">
              <h3 className="text-2xl font-bold text-white mb-6">Faturamento Semanal</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.weeklyEarnings}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#999"
                    tickFormatter={(date) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  />
                  <YAxis stroke="#999" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a1a1a', 
                      border: '1px solid #FF7A00',
                      borderRadius: '8px'
                    }}
                    labelFormatter={(date) => new Date(date).toLocaleDateString('pt-BR')}
                    formatter={(value: any) => [`R$ ${value}`, 'Faturamento']}
                  />
                  <Bar dataKey="total" fill="#FF7A00" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {activeTab === 'agendamentos' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-8">Agendamentos</h2>
            <div className="bg-dark-light border border-primary/20 rounded-xl p-8">
              <p className="text-gray-400 text-center">
                Módulo de agendamentos em desenvolvimento...
              </p>
            </div>
          </div>
        )}

        {activeTab === 'financeiro' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-8">Financeiro</h2>
            <div className="bg-dark-light border border-primary/20 rounded-xl p-8">
              <p className="text-gray-400 text-center">
                Módulo financeiro em desenvolvimento...
              </p>
            </div>
          </div>
        )}

        {activeTab === 'clientes' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-8">Clientes</h2>
            <div className="bg-dark-light border border-primary/20 rounded-xl p-8">
              <p className="text-gray-400 text-center">
                Módulo de clientes em desenvolvimento...
              </p>
            </div>
          </div>
        )}

        {activeTab === 'servicos' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-8">Serviços e Barbeiros</h2>
            <div className="bg-dark-light border border-primary/20 rounded-xl p-8">
              <p className="text-gray-400 text-center">
                Módulo de serviços em desenvolvimento...
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
