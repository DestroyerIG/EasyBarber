'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import type { AdminAuditLog, PaginationMeta } from '@/types/admin';

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('pt-BR');
};

export default function AdminLogsPage() {
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [searchActor, setSearchActor] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const response = await adminApi.getAuditLogs({
          page,
          limit: 20,
          action,
          status,
          actor: searchActor,
        });

        setItems(response.data);
        setMeta(response.meta);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [action, page, searchActor, status]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black">Logs de Auditoria</h1>
        <p className="mt-2 text-sm text-gray-400">Rastreabilidade completa das ações administrativas críticas da plataforma.</p>
      </section>

      <section className="card">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={action}
            onChange={(event) => {
              setPage(1);
              setAction(event.target.value);
            }}
            placeholder="Filtrar por action_type"
            className="input"
          />

          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            className="input"
          >
            <option value="">Status</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
          </select>

          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={searchActor}
              onChange={(event) => {
                setPage(1);
                setSearchActor(event.target.value);
              }}
              placeholder="Actor user ID (uuid)"
              className="input pl-9"
            />
          </label>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-3 py-3">Ação</th>
              <th className="px-3 py-3">Ator</th>
              <th className="px-3 py-3">Alvo</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Quando</th>
              <th className="px-3 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">Nenhum log encontrado.</td>
              </tr>
            )}

            {items.map((item) => (
              <tr key={item.id} className="border-t border-white/5 align-top">
                <td className="px-3 py-4">
                  <p className="font-semibold text-white">{item.action_type}</p>
                  <p className="text-xs text-gray-500">{item.resource_type || '-'} · {item.resource_id || '-'}</p>
                </td>
                <td className="px-3 py-4 text-xs text-gray-300">
                  <p>{item.actor_user_email || '-'}</p>
                  <p className="text-gray-500">{item.actor_tenant_name || '-'}</p>
                </td>
                <td className="px-3 py-4 text-xs text-gray-300">
                  <p>{item.target_user_email || '-'}</p>
                  <p className="text-gray-500">{item.target_tenant_name || '-'}</p>
                </td>
                <td className="px-3 py-4">
                  <AdminStatusBadge value={item.status} variant="audit" />
                </td>
                <td className="px-3 py-4 text-xs text-gray-300">{formatDate(item.created_at)}</td>
                <td className="px-3 py-4 text-xs text-gray-400">
                  <pre className="max-w-[420px] whitespace-pre-wrap break-words rounded-md bg-black/40 p-2 text-[11px]">{JSON.stringify(item.details || {}, null, 2)}</pre>
                  {item.error_message ? <p className="mt-1 text-rose-300">{item.error_message}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex items-center justify-between text-sm text-gray-400">
        <p>Total: {meta.total} registros</p>
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
    </div>
  );
}
