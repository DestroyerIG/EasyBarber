'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, Search, ShieldCheck, Trash2, UserX, UserCheck } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { AdminConfirmModal } from '@/components/admin/AdminConfirmModal';
import type { AdminTenant, PaginationMeta } from '@/types/admin';

type PendingAction =
  | { type: 'tenant_block'; tenant: AdminTenant }
  | { type: 'tenant_unblock'; tenant: AdminTenant }
  | { type: 'tenant_delete'; tenant: AdminTenant }
  | { type: 'user_block'; tenant: AdminTenant }
  | { type: 'user_unblock'; tenant: AdminTenant }
  | null;

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('pt-BR');
};

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [activity, setActivity] = useState('');
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const response = await adminApi.getTenants({
          page,
          limit: 20,
          search,
          status,
          plan,
          activity,
        });

        setTenants(response.data);
        setMeta(response.meta);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [activity, page, plan, search, status]);

  const modalConfig = useMemo(() => {
    if (!pendingAction) {
      return null;
    }

    if (pendingAction.type === 'tenant_block') {
      return {
        title: 'Bloquear conta',
        description: `Você está bloqueando ${pendingAction.tenant.name}. Todos os usuários desta conta perderão acesso até o desbloqueio.`,
        confirmLabel: 'Bloquear conta',
      };
    }

    if (pendingAction.type === 'tenant_unblock') {
      return {
        title: 'Desbloquear conta',
        description: `Você está reativando ${pendingAction.tenant.name}.`,
        confirmLabel: 'Desbloquear conta',
      };
    }

    if (pendingAction.type === 'tenant_delete') {
      return {
        title: 'Remoção lógica de conta',
        description: `A conta ${pendingAction.tenant.name} será marcada como removida (soft delete).`,
        confirmLabel: 'Confirmar remoção',
      };
    }

    if (pendingAction.type === 'user_block') {
      return {
        title: 'Bloquear usuário responsável',
        description: `O usuário ${pendingAction.tenant.owner_user_email || '-'} será bloqueado.`,
        confirmLabel: 'Bloquear usuário',
      };
    }

    return {
      title: 'Desbloquear usuário responsável',
      description: `O usuário ${pendingAction.tenant.owner_user_email || '-'} será reativado.`,
      confirmLabel: 'Desbloquear usuário',
    };
  }, [pendingAction]);

  const reloadCurrentPage = async () => {
    const response = await adminApi.getTenants({
      page,
      limit: 20,
      search,
      status,
      plan,
      activity,
    });

    setTenants(response.data);
    setMeta(response.meta);
  };

  const handleConfirmAction = async (reason?: string) => {
    if (!pendingAction) {
      return;
    }

    setSubmitting(true);

    try {
      const tenantId = pendingAction.tenant.id;

      if (pendingAction.type === 'tenant_block') {
        await adminApi.blockTenant(tenantId, reason);
      }

      if (pendingAction.type === 'tenant_unblock') {
        await adminApi.unblockTenant(tenantId, reason);
      }

      if (pendingAction.type === 'tenant_delete') {
        await adminApi.softDeleteTenant(tenantId, reason);
      }

      if (pendingAction.type === 'user_block' && pendingAction.tenant.owner_user_id) {
        await adminApi.blockUser(pendingAction.tenant.owner_user_id, reason);
      }

      if (pendingAction.type === 'user_unblock' && pendingAction.tenant.owner_user_id) {
        await adminApi.unblockUser(pendingAction.tenant.owner_user_id, reason);
      }

      await reloadCurrentPage();
      setPendingAction(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black">Gestão de Contas</h1>
        <p className="mt-2 text-sm text-gray-400">Filtre, monitore atividade e controle bloqueios de contas e usuários.</p>
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
              placeholder="Buscar por conta, email ou responsável"
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
            <option value="">Status da conta</option>
            <option value="active">Ativa</option>
            <option value="suspended">Suspensa</option>
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
            <option value="basico">Básico</option>
            <option value="profissional">Profissional</option>
            <option value="premium">Premium</option>
          </select>

          <select
            value={activity}
            onChange={(event) => {
              setPage(1);
              setActivity(event.target.value);
            }}
            className="input md:col-span-2"
          >
            <option value="">Atividade</option>
            <option value="active">Ativo (últimos 30 dias)</option>
            <option value="inactive">Inativo (últimos 30 dias)</option>
          </select>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-3 py-3">Conta</th>
              <th className="px-3 py-3">Plano</th>
              <th className="px-3 py-3">Assinatura</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Última atividade</th>
              <th className="px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!loading && tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">Nenhuma conta encontrada com os filtros aplicados.</td>
              </tr>
            )}

            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-white/5 align-top">
                <td className="px-3 py-4">
                  <p className="font-semibold text-white">{tenant.name}</p>
                  <p className="text-xs text-gray-400">{tenant.email}</p>
                  <p className="text-xs text-gray-500">Owner: {tenant.owner_user_email || '-'}</p>
                </td>
                <td className="px-3 py-4">
                  <span className="rounded-md border border-white/10 px-2 py-1 text-xs uppercase tracking-wider text-gray-200">{tenant.plan}</span>
                </td>
                <td className="px-3 py-4">
                  <AdminStatusBadge value={tenant.subscription_status} variant="subscription" />
                  <p className="mt-2 text-xs text-gray-500">Renova: {formatDate(tenant.subscription_current_period_end)}</p>
                </td>
                <td className="px-3 py-4">
                  <AdminStatusBadge value={tenant.active} variant="account" />
                </td>
                <td className="px-3 py-4 text-xs text-gray-400">
                  {formatDate(tenant.last_activity_at)}
                </td>
                <td className="px-3 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    {tenant.active ? (
                      <button
                        onClick={() => setPendingAction({ type: 'tenant_block', tenant })}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300/30 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/10"
                      >
                        <Ban size={14} /> Bloquear
                      </button>
                    ) : (
                      <button
                        onClick={() => setPendingAction({ type: 'tenant_unblock', tenant })}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/10"
                      >
                        <ShieldCheck size={14} /> Desbloquear
                      </button>
                    )}

                    {tenant.owner_user_id ? (
                      tenant.owner_user_blocked ? (
                        <button
                          onClick={() => setPendingAction({ type: 'user_unblock', tenant })}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/10"
                        >
                          <UserCheck size={14} /> User on
                        </button>
                      ) : (
                        <button
                          onClick={() => setPendingAction({ type: 'user_block', tenant })}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300/30 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/10"
                        >
                          <UserX size={14} /> User off
                        </button>
                      )
                    ) : null}

                    <button
                      onClick={() => setPendingAction({ type: 'tenant_delete', tenant })}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300/30 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
                    >
                      <Trash2 size={14} /> Remover
                    </button>
                  </div>
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
            className="btn-ghost"
          >
            Anterior
          </button>
          <span>Página {meta.page} de {meta.totalPages}</span>
          <button
            disabled={meta.page >= meta.totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="btn-ghost"
          >
            Próxima
          </button>
        </div>
      </section>

      <AdminConfirmModal
        isOpen={Boolean(pendingAction)}
        title={modalConfig?.title || ''}
        description={modalConfig?.description || ''}
        confirmLabel={modalConfig?.confirmLabel || 'Confirmar'}
        submitting={submitting}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
