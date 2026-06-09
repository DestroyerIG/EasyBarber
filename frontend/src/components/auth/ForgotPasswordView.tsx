'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  getSupabaseClient,
  getSupabaseClientDiagnostics,
  getMissingSupabasePublicEnvVars,
  isSupabaseClientConfigured,
} from '@/lib/supabase/client';
import { resolveResetPasswordRedirectUrl } from '@/lib/appUrl';

type ForgotPasswordViewProps = {
  appUrl?: string;
};

const AUTH_CONNECTION_ERROR_MESSAGE =
  'Não foi possível conectar ao serviço de autenticação. Verifique a configuração do Supabase.';

const maskEmail = (email: string) => {
  const [localPart, domainPart = ''] = email.split('@');

  if (!localPart || !domainPart) {
    return 'email-invalido';
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || '*'}***@${domainPart}`;
  }

  return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domainPart}`;
};

export function ForgotPasswordView({ appUrl }: ForgotPasswordViewProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus('error');
      setMessage('Informe seu e-mail.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setMessage('');

    try {
      const redirectTo = resolveResetPasswordRedirectUrl(appUrl);
      const maskedEmail = maskEmail(normalizedEmail);
      const diagnostics = getSupabaseClientDiagnostics();

      console.info('[forgot-password] debug seguro de configuração', {
        operation: 'resetPasswordForEmail',
        email: maskedEmail,
        redirectTo,
        supabaseUrl: diagnostics.supabaseUrlMasked,
        hasSupabaseUrl: diagnostics.hasSupabaseUrl,
        hasSupabaseAnonKey: diagnostics.hasSupabaseAnonKey,
        supabaseUrlProjectRef: diagnostics.supabaseUrlProjectRef,
        anonKeyProjectRef: diagnostics.anonKeyProjectRef,
        canCompareProjectRef: diagnostics.canCompareProjectRef,
        isProjectRefMismatch: diagnostics.isProjectRefMismatch,
      });

      if (!isSupabaseClientConfigured()) {
        throw new Error(
          `Configuração do Supabase ausente no frontend. Verifique ${getMissingSupabasePublicEnvVars().join(', ')}.`
        );
      }

      const supabase = getSupabaseClient();

      const response = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      console.info('[forgot-password] operação concluída', {
        operation: 'resetPasswordForEmail',
        email: maskedEmail,
        redirectTo,
        supabaseUrl: diagnostics.supabaseUrlMasked,
        message: response.error?.message || null,
        name: response.error?.name || null,
      });

      if (response.error) {
        throw response.error;
      }

      setStatus('success');
      setMessage('Link de redefinição enviado. Confira seu e-mail para continuar.');
    } catch (error) {
      const diagnostics = getSupabaseClientDiagnostics();
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      const name = error instanceof Error ? error.name : 'UnknownError';

      console.error('[forgot-password] operação falhou', {
        operation: 'resetPasswordForEmail',
        email: maskEmail(normalizedEmail),
        redirectTo: resolveResetPasswordRedirectUrl(appUrl),
        supabaseUrl: diagnostics.supabaseUrlMasked,
        message,
        name,
      });

      setStatus('error');
      if (message.includes('Failed to fetch')) {
        setMessage(AUTH_CONNECTION_ERROR_MESSAGE);
      } else if (message.includes('Configuração do Supabase')) {
        setMessage(message);
      } else {
        setMessage('Não foi possível enviar o link de redefinição agora. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.2),_rgba(0,0,0,0.92)_45%)] px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-6 sm:p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <p className="section-eyebrow">EasyBarber</p>
        <h1 className="mt-3 text-3xl font-black text-white">Esqueceu a senha?</h1>
        <p className="mt-4 text-sm text-gray-300">
          Informe o e-mail da sua conta para receber o link de redefinição.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="forgot-password-email"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400"
            >
              E-mail
            </label>
            <input
              id="forgot-password-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu e-mail"
              className="input mt-2"
              required
            />
          </div>

          {message ? (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                status === 'success'
                  ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border border-amber-500/40 bg-amber-500/10 text-amber-200'
              }`}
            >
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full text-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Enviando...' : 'Enviar link de redefinição'}
          </button>
        </form>

        <div className="mt-6 text-sm">
          <Link href="/login" className="text-gray-300 hover:text-white">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
