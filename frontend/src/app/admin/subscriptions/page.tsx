'use client';

import { useEffect, useState } from 'react';
import { RefreshCcw, Search } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { AdminConfirmModal } from '@/components/admin/AdminConfirmModal';
import type { AdminSubscription, PaginationMeta } from '@/types/admin';

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('pt-BR');
};

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState<AdminSubscription[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const response = await adminApi.getSubscriptions({
          page,
          limit: 20,
          search,
          status,
          plan,
          overdueOnly,
        });

        setItems(response.data);
        setMeta(response.meta);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [overdueOnly, page, plan, search, status]);

  const pendingTenant = items.find((item) => item.tenant_id === pendingTenantId) || null;

  const reload = async () => {
    const response = await adminApi.getSubscriptions({
      page,
      limit: 20,
      search,
      status,
      plan,
      overdueOnly,
    });

    setItems(response.data);
    setMeta(response.meta);
  };

  const handleResync = async (reason?: string) => {
    if (!pendingTenantId) {
      return;
    }

    setSubmitting(true);

    try {
      await adminApi.resyncSubscription(pendingTenantId, reason);
      await reload();
      setPendingTenantId(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black">Assinaturas</h1>
        <p className="mt-2 text-sm text-gray-400">Monitore status de cobrança, vencimentos e execute re-sync manual com Stripe.</p>
      </section>

      <section className="card">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Buscar por conta ou email"
              className="input pl-9"
            />
          </label>

          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            className="input"
          >
            <option value="">Status da assinatura</option>
            <option value="active">active</option>
            <option value="trialing">trialing</option>
            <option value="past_due">past_due</option>
            <option value="incomplete">incomplete</option>
            <option value="canceled">canceled</option>
          </select>

          <select
            value={plan}
            onChange={(event) => {
              setPage(1);
              setPlan(event.target.value);
            }}
            className="input"
          >
            <option value="">Plano</option>
            <option value="basico">basico</option>
            <option value="profissional">profissional</option>
            <option value="premium">premium</option>
          </select>

          <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 md:col-span-2">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => {
                setPage(1);
                setOverdueOnly(event.target.checked);
              }}
            />
            Mostrar apenas contas em atraso
          </label>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-3 py-3">Conta</th>
              <th className="px-3 py-3">Plano</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Fim do ciclo</th>
              <th className="px-3 py-3">Atualizado em</th>
              <th className="px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">Nenhuma assinatura encontrada.</td>
              </tr>
            )}

            {items.map((item) => (
              <tr key={item.tenant_id} className="border-t border-white/5">
                <td className="px-3 py-4">
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.email}</p>
                  <p className="text-xs text-gray-500">Owner: {item.owner_user_email || '-'}</p>
                </td>
                <td className="px-3 py-4">
                  <span className="rounded-md border border-white/10 px-2 py-1 text-xs uppercase tracking-wider text-gray-200">{item.plan}</span>
                </td>
                <td className="px-3 py-4">
                  <AdminStatusBadge value={item.subscription_status} variant="subscription" />
                </td>
                <td className="px-3 py-4 text-xs text-gray-300">{formatDate(item.subscription_current_period_end)}</td>
                <td className="px-3 py-4 text-xs text-gray-300">{formatDate(item.subscription_updated_at)}</td>
                <td className="px-3 py-4 text-right">
                  <button
                    onClick={() => setPendingTenantId(item.tenant_id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    <RefreshCcw size={14} /> Re-sync
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex items-center justify-between text-sm text-gray-400">
        <p>Total: {meta.total} contas</p>
        <div className="flex items-center gap-2">
          <button
            disabled={meta.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            Anterior
          </button>
          <span>Página {meta.page} de {meta.totalPages}</span>
          <button
            disabled={meta.page >= meta.totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </section>

      <AdminConfirmModal
        isOpen={Boolean(pendingTenantId)}
        title="Forçar re-sync de assinatura"
        description={`Você está iniciando sincronização manual da conta ${pendingTenant?.name || '-'}.`}
        confirmLabel="Executar re-sync"
        submitting={submitting}
        onClose={() => setPendingTenantId(null)}
        onConfirm={handleResync}
      />
    </div>
  );
}
