'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';

type ConfirmationStatus = 'idle' | 'loading' | 'success' | 'error';

interface AuthConfirmViewProps {
  tokenHash: string | null;
  type: string | null;
}

const normalizeValue = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function AuthConfirmView({ tokenHash, type }: AuthConfirmViewProps) {
  const [status, setStatus] = useState<ConfirmationStatus>('idle');
  const [message, setMessage] = useState('');
  const { showToast } = useToast();

  const normalizedTokenHash = useMemo(() => normalizeValue(tokenHash), [tokenHash]);
  const normalizedType = useMemo(() => normalizeValue(type), [type]);

  useEffect(() => {
    let mounted = true;

    const confirmEmail = async () => {
      if (!normalizedTokenHash) {
        setStatus('error');
        setMessage('Link de confirmação inválido. Solicite um novo e-mail de verificação.');
        return;
      }

      setStatus('loading');
      setMessage('Validando a confirmação do seu e-mail...');

      try {
        const response = await api.get('/auth/verify-email', {
          params: {
            token_hash: normalizedTokenHash,
            ...(normalizedType ? { type: normalizedType } : {}),
          },
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
          'Não foi possível confirmar seu e-mail. Solicite um novo link.'
        );

        setStatus('error');
        setMessage(errorMessage);
      }
    };

    confirmEmail();

    return () => {
      mounted = false;
    };
  }, [normalizedTokenHash, normalizedType, showToast]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.2),_rgba(0,0,0,0.92)_45%)] px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
        <h1 className="mt-3 text-3xl font-black">Confirmação de e-mail</h1>

        <p className="mt-4 text-sm text-gray-300">{message}</p>

        {status === 'loading' && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            Aguarde enquanto finalizamos a confirmação da sua conta...
          </div>
        )}

        {status === 'success' && (
          <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Conta validada com sucesso. Faça login para acessar o painel.
          </div>
        )}

        {status === 'error' && (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Se o link expirou, solicite um novo e-mail de verificação na tela de login.
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/login" className="rounded-lg border border-primary/40 px-4 py-2 font-semibold text-primary hover:border-primary">
            Ir para login
          </Link>
          <Link href="/verificar-email" className="text-gray-300 hover:text-white">
            Reenviar verificação
          </Link>
        </div>
      </div>
    </div>
  );
}
