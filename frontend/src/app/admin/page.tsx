'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Building2, CreditCard, ScrollText, ShieldAlert, Users } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { AdminMetricCard } from '@/components/admin/AdminMetricCard';
import type { AdminMetricsResponse } from '@/types/admin';

export default function AdminHomePage() {
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

  if (loading) {
    return <p className="text-sm text-gray-400">Carregando visão administrativa...</p>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black">Resumo da Plataforma</h1>
        <p className="mt-2 text-sm text-gray-400">
          Acompanhe saúde comercial, contas e operações administrativas em um único painel.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Contas cadastradas"
          value={metrics?.totals.totalAccounts || 0}
          icon={Building2}
          tone="primary"
        />
        <AdminMetricCard
          label="Assinaturas ativas"
          value={metrics?.subscriptions.active || 0}
          icon={CreditCard}
          tone="success"
        />
        <AdminMetricCard
          label="Contas suspensas"
          value={metrics?.totals.suspendedAccounts || 0}
          icon={ShieldAlert}
          tone="warning"
        />
        <AdminMetricCard
          label="Usuários bloqueados"
          value={metrics?.totals.blockedUsers || 0}
          icon={Users}
          tone="danger"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card">
          <h2 className="text-lg font-bold">Atalhos administrativos</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/admin/metrics" className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-sm hover:bg-white/5">
              <span className="inline-flex items-center gap-2"><BarChart3 size={16} /> Métricas detalhadas</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/admin/tenants" className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-sm hover:bg-white/5">
              <span className="inline-flex items-center gap-2"><Building2 size={16} /> Gerenciar contas</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/admin/subscriptions" className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-sm hover:bg-white/5">
              <span className="inline-flex items-center gap-2"><CreditCard size={16} /> Assinaturas</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/admin/logs" className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-sm hover:bg-white/5">
              <span className="inline-flex items-center gap-2"><ScrollText size={16} /> Auditoria</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </article>

        <article className="card">
          <h2 className="text-lg font-bold">Indicadores do período (30 dias)</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-300">
            <li className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
              <span>Novas contas</span>
              <strong>{metrics?.usage.newAccountsTrend.reduce((acc, row) => acc + Number(row.total || 0), 0) || 0}</strong>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
              <span>Agendamentos registrados</span>
              <strong>{metrics?.usage.appointmentsInPeriod || 0}</strong>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
              <span>MRR estimado</span>
              <strong>R$ {(metrics?.revenue.estimatedMrr || 0).toFixed(2)}</strong>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
              <span>Receita coletada no mês</span>
              <strong>R$ {(metrics?.revenue.monthlyRevenueCollected || 0).toFixed(2)}</strong>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
