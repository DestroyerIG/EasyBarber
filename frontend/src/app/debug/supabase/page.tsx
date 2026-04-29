'use client';

import { useState } from 'react';
import {
  getSupabaseAnonKeySafeDiagnostics,
  getSupabaseClientDiagnostics,
  isSupabaseClientConfigured,
} from '@/lib/supabase/client';

type SettingsTestResult = {
  ok: boolean;
  status?: number;
  message: string;
};

const readPublicEnv = () => {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  return { supabaseUrl, anonKey };
};

export default function SupabaseDebugPage() {
  const [testing, setTesting] = useState(false);
  const [settingsResult, setSettingsResult] = useState<SettingsTestResult | null>(null);

  const diagnostics = getSupabaseClientDiagnostics();
  const anonKeyDiagnostics = getSupabaseAnonKeySafeDiagnostics();
  const clientConfigured = isSupabaseClientConfigured();

  const testSettingsEndpoint = async () => {
    setTesting(true);
    setSettingsResult(null);

    try {
      const { supabaseUrl, anonKey } = readPublicEnv();

      if (!supabaseUrl || !anonKey || !clientConfigured) {
        setSettingsResult({
          ok: false,
          message: 'Configuração pública do Supabase ausente ou inválida.',
        });
        return;
      }

      const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });

      setSettingsResult({
        ok: response.ok,
        status: response.status,
        message: response.ok
          ? 'Endpoint /auth/v1/settings respondeu com sucesso.'
          : 'Endpoint /auth/v1/settings respondeu com erro.',
      });
    } catch (error) {
      setSettingsResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido ao testar Supabase.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-10 text-white">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
        <h1 className="mt-3 text-3xl font-black">Debug Supabase</h1>

        <div className="mt-8 overflow-hidden rounded-lg border border-white/10">
          <dl className="divide-y divide-white/10 text-sm">
            <div className="grid grid-cols-2 gap-4 bg-white/[0.03] px-4 py-3">
              <dt className="text-gray-400">clientConfigured</dt>
              <dd className="font-mono">{String(clientConfigured)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4 px-4 py-3">
              <dt className="text-gray-400">supabaseUrl</dt>
              <dd className="font-mono">{diagnostics.supabaseUrlMasked || 'ausente'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4 bg-white/[0.03] px-4 py-3">
              <dt className="text-gray-400">anonKeyExists</dt>
              <dd className="font-mono">{String(anonKeyDiagnostics.anonKeyExists)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4 px-4 py-3">
              <dt className="text-gray-400">anonKeyType</dt>
              <dd className="font-mono">{anonKeyDiagnostics.anonKeyType}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4 bg-white/[0.03] px-4 py-3">
              <dt className="text-gray-400">anonKeyPrefix</dt>
              <dd className="font-mono">{anonKeyDiagnostics.anonKeyPrefix || 'ausente'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4 px-4 py-3">
              <dt className="text-gray-400">anonKeyLength</dt>
              <dd className="font-mono">{anonKeyDiagnostics.anonKeyLength}</dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          onClick={testSettingsEndpoint}
          disabled={testing}
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testing ? 'Testando...' : 'Testar /auth/v1/settings'}
        </button>

        {settingsResult ? (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              settingsResult.ok
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            }`}
          >
            <p className="font-semibold">{settingsResult.message}</p>
            {settingsResult.status ? <p className="mt-1 font-mono">status: {settingsResult.status}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
