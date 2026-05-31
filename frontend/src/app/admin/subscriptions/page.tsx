'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, RefreshCcw, Search, ShieldOff, Pencil } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { AdminConfirmModal } from '@/components/admin/AdminConfirmModal';
import { useToast } from '@/components/Toast';
import type { AdminSubscription, PaginationMeta } from '@/types/admin';

const PLANS = ['basico', 'profissional', 'premium'] as const;
const STATUSES = ['active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete'] as const;

type PlanId = (typeof PLANS)[number];
type StatusId = (typeof STATUSES)[number];

type ActionKind = 'resync' | 'override-plan' | 'override-status' | 'cancel';

interface PendingAction {
  kind: ActionKind;
  tenant: AdminSubscription;
  value?: string;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
};

const PLAN_LABEL: Record<string, string> = {
  basico: 'Básico',
  profissional: 'Profissional',
  premium: 'Premium',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  trialing: 'Trial',
  pending: 'Pendente',
  past_due: 'Em atraso',
  unpaid: 'Inadimplente',
  canceled: 'Cancelado',
  incomplete: 'Incompleto',
};

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState<AdminSubscription[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [inlineSelectTenant, setInlineSelectTenant] = useState<{ id: string; kind: 'plan' | 'status' } | null>(null);

  const { showToast } = useToast();

  const fetchData = async (params?: { page?: number }) => {
    setLoading(true);
    try {
      const response = await adminApi.getSubscriptions({
        page: params?.page ?? page,
        limit: 20,
        search,
        status: statusFilter,
        plan: planFilter,
        overdueOnly,
      });
      setItems(response.data);
      setMeta(response.meta);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [overdueOnly, page, planFilter, search, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = async (reason?: string) => {
    if (!pendingAction) return;
    setSubmitting(true);
    try {
      const { kind, tenant, value } = pendingAction;
      if (kind === 'resync') {
        await adminApi.resyncSubscription(tenant.tenant_id, reason);
        showToast('Re-sync executado.', 'success');
      } else if (kind === 'override-plan' && value) {
        await adminApi.overrideSubscriptionPlan(tenant.tenant_id, value, reason);
        showToast(`Plano alterado para ${PLAN_LABEL[value] ?? value}.`, 'success');
      } else if (kind === 'override-status' && value) {
        await adminApi.overrideSubscriptionStatus(tenant.tenant_id, value, reason);
        showToast(`Status alterado para ${STATUS_LABEL[value] ?? value}.`, 'success');
      } else if (kind === 'cancel') {
        await adminApi.cancelSubscriptionAdmin(tenant.tenant_id, reason);
        showToast('Assinatura cancelada.', 'success');
      }
      await fetchData();
      setPendingAction(null);
    } catch {
      showToast('Falha ao executar ação. Tente novamente.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmTitle: Record<ActionKind, string> = {
    resync: 'Forçar re-sync',
    'override-plan': 'Alterar plano',
    'override-status': 'Alterar status',
    cancel: 'Cancelar assinatura',
  };

  const confirmDescription = (action: PendingAction): string => {
    const name = action.tenant.name;
    if (action.kind === 'resync') return `Sincronização manual da conta ${name}.`;
    if (action.kind === 'override-plan') return `Alterar plano da conta ${name} para ${PLAN_LABEL[action.value ?? ''] ?? action.value}.`;
    if (action.kind === 'override-status') return `Alterar status da conta ${name} para ${STATUS_LABEL[action.value ?? ''] ?? action.value}.`;
    if (action.kind === 'cancel') return `Cancelar assinatura da conta ${name}. Ação irreversível.`;
    return '';
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black">Assinaturas</h1>
        <p className="mt-2 text-sm text-gray-400">Monitore e gerencie planos, status e cobranças.</p>
      </section>

      {/* Filters */}
      <section className="card">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Buscar por conta ou email"
              className="input pl-9"
            />
          </label>

          <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }} className="input">
            <option value="">Status da assinatura</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>

          <select value={planFilter} onChange={(e) => { setPage(1); setPlanFilter(e.target.value); }} className="input">
            <option value="">Plano</option>
            {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>

          <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 md:col-span-2">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => { setPage(1); setOverdueOnly(e.target.checked); }} />
            Mostrar apenas contas em atraso
          </label>
        </div>
      </section>

      {/* Table */}
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

                {/* Plan cell — inline select */}
                <td className="px-3 py-4">
                  {inlineSelectTenant?.id === item.tenant_id && inlineSelectTenant.kind === 'plan' ? (
                    <select
                      autoFocus
                      defaultValue={item.plan}
                      className="input py-1 text-xs"
                      onBlur={() => setInlineSelectTenant(null)}
                      onChange={(e) => {
                        const next = e.target.value as PlanId;
                        setInlineSelectTenant(null);
                        setPendingAction({ kind: 'override-plan', tenant: item, value: next });
                      }}
                    >
                      {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                    </select>
                  ) : (
                    <button
                      onClick={() => setInlineSelectTenant({ id: item.tenant_id, kind: 'plan' })}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs uppercase tracking-wider text-gray-200 hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      {item.plan}
                      <Pencil size={10} className="opacity-50" />
                    </button>
                  )}
                </td>

                {/* Status cell — inline select */}
                <td className="px-3 py-4">
                  {inlineSelectTenant?.id === item.tenant_id && inlineSelectTenant.kind === 'status' ? (
                    <select
                      autoFocus
                      defaultValue={item.subscription_status}
                      className="input py-1 text-xs"
                      onBlur={() => setInlineSelectTenant(null)}
                      onChange={(e) => {
                        const next = e.target.value as StatusId;
                        setInlineSelectTenant(null);
                        setPendingAction({ kind: 'override-status', tenant: item, value: next });
                      }}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  ) : (
                    <button
                      onClick={() => setInlineSelectTenant({ id: item.tenant_id, kind: 'status' })}
                      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    >
                      <AdminStatusBadge value={item.subscription_status} variant="subscription" />
                      <ChevronDown size={10} className="text-gray-500" />
                    </button>
                  )}
                </td>

                <td className="px-3 py-4 text-xs text-gray-300">{formatDate(item.subscription_current_period_end)}</td>
                <td className="px-3 py-4 text-xs text-gray-300">{formatDate(item.subscription_updated_at)}</td>

                <td className="px-3 py-4 text-right">
                  <div className="inline-flex flex-col gap-1.5 items-end">
                    <button
                      onClick={() => setPendingAction({ kind: 'resync', tenant: item })}
                      className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      <RefreshCcw size={13} /> Re-sync
                    </button>
                    <button
                      onClick={() => setPendingAction({ kind: 'cancel', tenant: item })}
                      disabled={item.subscription_status === 'canceled'}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ShieldOff size={13} /> Cancelar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Pagination */}
      <section className="flex items-center justify-between text-sm text-gray-400">
        <p>Total: {meta.total} contas</p>
        <div className="flex items-center gap-2">
          <button
            disabled={meta.page <= 1}
            onClick={() => setPage((c) => Math.max(1, c - 1))}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            Anterior
          </button>
          <span>Página {meta.page} de {meta.totalPages}</span>
          <button
            disabled={meta.page >= meta.totalPages}
            onClick={() => setPage((c) => c + 1)}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </section>

      {/* Confirm modal */}
      {pendingAction && (
        <AdminConfirmModal
          isOpen
          title={confirmTitle[pendingAction.kind]}
          description={confirmDescription(pendingAction)}
          confirmLabel={pendingAction.kind === 'cancel' ? 'Cancelar assinatura' : 'Confirmar'}
          submitting={submitting}
          onClose={() => setPendingAction(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
