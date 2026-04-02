'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import { Activity, CreditCard, DollarSign, UserPlus } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { AdminMetricCard } from '@/components/admin/AdminMetricCard';
import type { AdminMetricsResponse } from '@/types/admin';

const COLORS = ['#FF7A00', '#10B981', '#F59E0B', '#F43F5E', '#60A5FA'];

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await adminApi.getMetrics(30);
        setMetrics(data);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const trendData = useMemo(() => {
    if (!metrics) {
      return [];
    }

    return metrics.usage.newAccountsTrend.map((row) => ({
      day: formatDate(row.day),
      novasContas: Number(row.total || 0),
    }));
  }, [metrics]);

  const usageData = useMemo(() => {
    if (!metrics) {
      return [];
    }

    return metrics.usage.appointmentsTrend.map((row) => ({
      day: formatDate(row.day),
      agendamentos: Number(row.appointments || 0),
    }));
  }, [metrics]);

  if (loading) {
    return <p className="text-sm text-gray-400">Carregando métricas...</p>;
  }

  if (!metrics) {
    return <p className="text-sm text-rose-300">Não foi possível carregar as métricas administrativas.</p>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black">Métricas da Plataforma</h1>
        <p className="mt-2 text-sm text-gray-400">Visão consolidada de crescimento, assinaturas e uso do produto.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Novas contas (30d)" value={metrics.usage.newAccountsTrend.reduce((acc, row) => acc + Number(row.total || 0), 0)} icon={UserPlus} tone="primary" />
        <AdminMetricCard label="Agendamentos (30d)" value={metrics.usage.appointmentsInPeriod} icon={Activity} tone="success" />
        <AdminMetricCard label="MRR estimado" value={`R$ ${metrics.revenue.estimatedMrr.toFixed(2)}`} icon={DollarSign} tone="warning" />
        <AdminMetricCard label="Assinaturas ativas" value={metrics.subscriptions.active} icon={CreditCard} tone="neutral" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="card">
          <h2 className="text-lg font-bold">Novas contas por dia</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b2b2b" />
                <XAxis dataKey="day" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="novasContas" fill="#FF7A00" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card">
          <h2 className="text-lg font-bold">Agendamentos por dia</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b2b2b" />
                <XAxis dataKey="day" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="agendamentos" fill="#10B981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="card">
          <h2 className="text-lg font-bold">Distribuição por status de assinatura</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.subscriptions.breakdown.map((row) => ({
                    name: row.subscription_status,
                    value: Number(row.total || 0),
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {metrics.subscriptions.breakdown.map((row, index) => (
                    <Cell key={row.subscription_status} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card">
          <h2 className="text-lg font-bold">Distribuição por plano</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.subscriptions.plans.map((row) => ({
                    name: row.plan,
                    value: Number(row.total || 0),
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {metrics.subscriptions.plans.map((row, index) => (
                    <Cell key={row.plan} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
    </div>
  );
}
