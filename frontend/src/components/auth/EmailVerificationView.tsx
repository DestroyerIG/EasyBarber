'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';

type VerificationStatus = 'idle' | 'loading' | 'success' | 'error';

interface EmailVerificationViewProps {
  initialToken: string | null;
  initialEmail: string;
}

const normalizeToken = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function EmailVerificationView({ initialToken, initialEmail }: EmailVerificationViewProps) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);
  const { showToast } = useToast();

  const token = useMemo(() => normalizeToken(initialToken), [initialToken]);

  useEffect(() => {
    let mounted = true;

    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Link de verificação inválido. Solicite um novo e-mail de verificação.');
        return;
      }

      setStatus('loading');
      setMessage('Validando seu link de verificação...');

      try {
        const response = await api.get('/auth/verify-email', {
          params: { token },
        });

        if (!mounted) return;

        const successMessage =
          typeof response.data?.message === 'string'
            ? response.data.message
            : 'E-mail verificado com sucesso. Você já pode fazer login.';

        setStatus('success');
        setMessage(successMessage);
        showToast(successMessage, 'success');
      } catch (error: unknown) {
        if (!mounted) return;

        const errorMessage = getApiErrorMessage(
          error,
          'Não foi possível verificar seu e-mail. Solicite um novo link.'
        );

        setStatus('error');
        setMessage(errorMessage);
      }
    };

    verify();

    return () => {
      mounted = false;
    };
  }, [showToast, token]);

  const handleResend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      showToast('Informe o e-mail da conta para reenviar o link.', 'error');
      return;
    }

    setResending(true);

    try {
      const response = await api.post('/auth/resend-verification', {
        email: normalizedEmail,
      });

      const successMessage =
        typeof response.data?.message === 'string'
          ? response.data.message
          : 'Se existir uma conta pendente para este e-mail, enviaremos um novo link de verificação.';

      setMessage(successMessage);
      showToast(successMessage, 'info');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível reenviar o e-mail de verificação.'), 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.2),_rgba(0,0,0,0.92)_45%)] px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
        <h1 className="mt-3 text-3xl font-black">Verificação de e-mail</h1>

        <p className="mt-4 text-sm text-gray-300">{message}</p>

        {status === 'loading' && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            Aguarde enquanto validamos seu link...
          </div>
        )}

        {status === 'success' && (
          <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Conta liberada. Você já pode entrar no painel.
          </div>
        )}

        {status === 'error' && (
          <form onSubmit={handleResend} className="mt-6 space-y-3">
            <label htmlFor="resend-email" className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Reenviar e-mail de verificação
            </label>
            <input
              id="resend-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu e-mail"
              className="input"
              required
            />
            <button
              type="submit"
              disabled={resending}
              className="btn-primary w-full text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {resending ? 'Reenviando...' : 'Reenviar link de verificação'}
            </button>
          </form>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/login" className="rounded-lg border border-primary/40 px-4 py-2 font-semibold text-primary hover:border-primary">
            Ir para login
          </Link>
          <Link href="/cadastro" className="text-gray-300 hover:text-white">
            Criar nova conta
          </Link>
        </div>
      </div>
    </div>
  );
}
