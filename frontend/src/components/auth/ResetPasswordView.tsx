'use client';

import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  getSupabaseClient,
  getMissingSupabasePublicEnvVars,
  isSupabaseClientConfigured,
} from '@/lib/supabase/client';

type Status = 'loading' | 'ready' | 'success' | 'error';
const MIN_PASSWORD_LENGTH = 6;

const readAuthParam = (searchParams: URLSearchParams, hashParams: URLSearchParams, key: string) => {
  return searchParams.get(key) || hashParams.get(key);
};

export function ResetPasswordView() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Validando link de redefinição...');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const prepareSession = async () => {
      try {
        if (!isSupabaseClientConfigured()) {
          throw new Error(
            `Configuração do Supabase ausente no frontend. Verifique ${getMissingSupabasePublicEnvVars().join(', ')}.`
          );
        }

        const supabase = getSupabaseClient();
        const currentUrl = new URL(window.location.href);
        const searchParams = currentUrl.searchParams;

        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);

        const accessToken = readAuthParam(searchParams, hashParams, 'access_token');
        const refreshToken = readAuthParam(searchParams, hashParams, 'refresh_token');
        const type = readAuthParam(searchParams, hashParams, 'type');
        const authCode = readAuthParam(searchParams, hashParams, 'code');
        const tokenHash = readAuthParam(searchParams, hashParams, 'token_hash');

        if (type === 'recovery' && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }
        } else if (authCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(authCode);

          if (error) {
            throw error;
          }
        } else if (type === 'recovery' && tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });

          if (error) {
            throw error;
          }
        } else {
          throw new Error('Link inválido ou expirado.');
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('Sessão de recuperação não foi criada.');
        }

        const cleanUrl = new URL(window.location.origin + window.location.pathname);
        window.history.replaceState({}, document.title, cleanUrl.toString());

        if (!active) return;

        setStatus('ready');
        setMessage('Defina sua nova senha para concluir o processo.');
      } catch (error) {
        console.error('Erro ao preparar redefinição de senha:', error);

        if (!active) return;

        setStatus('error');
        setMessage('O link de redefinição é inválido ou expirou. Solicite um novo.');
      }
    };

    void prepareSession();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus('error');
      setMessage(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    if (password !== confirmPassword) {
      setStatus('error');
      setMessage('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    setMessage('Atualizando sua senha...');

    try {
      if (!isSupabaseClientConfigured()) {
        throw new Error(
          `Configuração do Supabase ausente no frontend. Verifique ${getMissingSupabasePublicEnvVars().join(', ')}.`
        );
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setStatus('success');
      setMessage('Senha redefinida com sucesso. Redirecionando para o login...');
      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace('/login?reset=1');
      }, 1800);
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      setStatus('error');
      if (error instanceof Error && error.message.includes('Configuração do Supabase')) {
        setMessage(error.message);
      } else {
        setMessage('Não foi possível redefinir sua senha. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.2),_rgba(0,0,0,0.92)_45%)] px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
        <h1 className="mt-3 text-3xl font-black text-white">Redefinir senha</h1>

        <p className="mt-4 text-sm text-gray-300">{message}</p>

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400"
              >
                Nova senha
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input mt-2"
                placeholder="Digite a nova senha"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400"
              >
                Confirmar nova senha
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="input mt-2"
                placeholder="Repita a nova senha"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        {status === 'success' && (
          <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Senha atualizada com sucesso.
          </div>
        )}

        {status === 'error' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Não foi possível concluir a redefinição com este link.
            </div>

            <Link
              href="/esqueci-senha"
              className="inline-flex rounded-lg border border-primary/40 px-4 py-2 font-semibold text-primary hover:border-primary"
            >
              Solicitar novo link
            </Link>
          </div>
        )}

        <div className="mt-7 text-sm">
          <Link href="/login" className="text-gray-300 hover:text-white">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
