'use client';

import type { EmailOtpType } from '@supabase/supabase-js';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  getSupabaseBrowserClient,
  isSupabaseBrowserClientConfigured,
} from '@/lib/supabase/browserClient';

type ConfirmationStatus = 'loading' | 'success' | 'error';

interface CallbackParams {
  code: string | null;
  tokenHash: string | null;
  type: EmailOtpType | null;
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  legacyToken: string | null;
}

const SUCCESS_REDIRECT_URL = '/login?confirmed=1';

const SUPABASE_EMAIL_OTP_TYPES: EmailOtpType[] = [
  'signup',
  'email',
];

const normalizeValue = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const firstValue = (...candidates: Array<string | null>) => {
  for (const candidate of candidates) {
    const normalized = normalizeValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const toEmailOtpType = (value: string | null): EmailOtpType | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (SUPABASE_EMAIL_OTP_TYPES.includes(normalized as EmailOtpType)) {
    return normalized as EmailOtpType;
  }

  return null;
};

const resolveOtpTypeCandidates = (type: EmailOtpType | null): EmailOtpType[] => {
  const candidates: EmailOtpType[] = [];

  if (type) {
    candidates.push(type);
  }

  for (const fallbackType of ['signup', 'email'] as const) {
    if (!candidates.includes(fallbackType)) {
      candidates.push(fallbackType);
    }
  }

  return candidates;
};

const getBackendMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object') {
    const candidate = payload as { message?: unknown };
    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return fallback;
};

export function AuthConfirmView() {
  const [status, setStatus] = useState<ConfirmationStatus>('loading');
  const [message, setMessage] = useState('Validando a confirmação do seu e-mail...');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);

  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;

    const confirmEmail = async () => {
      setStatus('loading');
      setMessage('Validando a confirmação do seu e-mail...');

      try {
        if (!isSupabaseBrowserClientConfigured()) {
          throw new Error(
            'Configuração Supabase ausente no frontend. Solicite suporte para configurar as variáveis públicas.'
          );
        }

        const readCallbackParams = (): CallbackParams => {
          const searchParams = new URLSearchParams(window.location.search);
          const hash = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : window.location.hash;
          const hashParams = new URLSearchParams(hash);

          return {
            code: firstValue(hashParams.get('code'), searchParams.get('code')),
            tokenHash: firstValue(
              hashParams.get('token_hash'),
              hashParams.get('tokenHash'),
              searchParams.get('token_hash'),
              searchParams.get('tokenHash')
            ),
            type: toEmailOtpType(firstValue(hashParams.get('type'), searchParams.get('type'))),
            accessToken: firstValue(
              hashParams.get('access_token'),
              hashParams.get('accessToken'),
              searchParams.get('access_token'),
              searchParams.get('accessToken')
            ),
            refreshToken: firstValue(
              hashParams.get('refresh_token'),
              hashParams.get('refreshToken'),
              searchParams.get('refresh_token'),
              searchParams.get('refreshToken')
            ),
            email: firstValue(hashParams.get('email'), searchParams.get('email')),
            legacyToken: firstValue(searchParams.get('token')),
          };
        };

        const scrubSensitiveUrlParams = (currentEmail: string | null) => {
          const cleanUrl = new URL(window.location.origin + window.location.pathname);

          if (currentEmail) {
            cleanUrl.searchParams.set('email', currentEmail);
          }

          window.history.replaceState({}, document.title, cleanUrl.toString());
        };

        const callbackParams = readCallbackParams();
        scrubSensitiveUrlParams(callbackParams.email);

        if (callbackParams.email && active) {
          setEmail(callbackParams.email);
        }

        const supabase = getSupabaseBrowserClient();
        let accessToken = callbackParams.accessToken;
        let supabaseConfirmed = false;

        if (callbackParams.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(callbackParams.code);

          if (error) {
            throw error;
          }

          supabaseConfirmed = true;
          accessToken = data.session?.access_token || accessToken;

          if (active && data.user?.email) {
            setEmail(data.user.email);
          }
        } else if (callbackParams.tokenHash) {
          const otpTypes = resolveOtpTypeCandidates(callbackParams.type);
          let otpError: unknown = null;

          for (const otpType of otpTypes) {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: callbackParams.tokenHash,
              type: otpType,
            });

            if (error) {
              otpError = error;
              continue;
            }

            supabaseConfirmed = true;
            accessToken = data.session?.access_token || accessToken;

            if (active && data.user?.email) {
              setEmail(data.user.email);
            }

            otpError = null;
            break;
          }

          if (otpError) {
            throw otpError;
          }
        } else if (callbackParams.accessToken && callbackParams.refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: callbackParams.accessToken,
            refresh_token: callbackParams.refreshToken,
          });

          if (error) {
            throw error;
          }

          supabaseConfirmed = true;
          accessToken = data.session?.access_token || callbackParams.accessToken;

          if (active && data.user?.email) {
            setEmail(data.user.email);
          }
        } else if (callbackParams.legacyToken) {
          const legacyResponse = await api.get('/auth/verify-email', {
            params: { token: callbackParams.legacyToken },
          });

          if (!active) return;

          const successMessage = getBackendMessage(
            legacyResponse.data,
            'E-mail confirmado com sucesso. Agora você já pode entrar.'
          );

          setStatus('success');
          setMessage(successMessage);
          showToast(successMessage, 'success');
          return;
        } else {
          throw new Error('Link de confirmação inválido ou incompleto. Solicite um novo e-mail.');
        }

        try {
          let syncResponse = null;

          if (accessToken) {
            syncResponse = await api.post('/auth/verify-email-session', {
              accessToken,
            });
          } else if (callbackParams.tokenHash) {
            syncResponse = await api.get('/auth/verify-email', {
              params: {
                token_hash: callbackParams.tokenHash,
                ...(callbackParams.type ? { type: callbackParams.type } : {}),
              },
            });
          }

          if (!active) return;

          const successMessage = getBackendMessage(
            syncResponse?.data,
            'E-mail confirmado com sucesso. Agora você já pode entrar.'
          );

          setStatus('success');
          setMessage(successMessage);
          showToast(successMessage, 'success');
        } catch (syncError) {
          if (!active) return;

          const fallbackMessage = supabaseConfirmed
            ? 'Seu e-mail foi confirmado no provedor de autenticação, mas não foi possível sincronizar tudo agora. Tente entrar novamente em instantes.'
            : 'Não foi possível finalizar a confirmação do seu e-mail.';

          setStatus('error');
          setMessage(getApiErrorMessage(syncError, fallbackMessage));
          showToast(getApiErrorMessage(syncError, fallbackMessage), 'error');
        }
      } catch (error: unknown) {
        if (!active) return;

        const errorMessage = getApiErrorMessage(
          error,
          'Não foi possível confirmar seu e-mail. O link pode estar inválido ou expirado.'
        );

        setStatus('error');
        setMessage(errorMessage);
        showToast(errorMessage, 'error');
      }
    };

    void confirmEmail();

    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    if (status !== 'success') {
      return;
    }

    const redirectId = window.setTimeout(() => {
      router.replace(SUCCESS_REDIRECT_URL);
    }, 1800);

    return () => {
      window.clearTimeout(redirectId);
    };
  }, [router, status]);

  const handleResendVerification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      showToast('Informe o e-mail da conta para reenviar a verificação.', 'error');
      return;
    }

    setResending(true);

    try {
      const response = await api.post('/auth/resend-verification', {
        email: normalizedEmail,
      });

      const resendMessage = getBackendMessage(
        response.data,
        'Se existir uma conta pendente, enviaremos um novo link de verificação.'
      );

      setMessage(resendMessage);
      showToast(resendMessage, 'info');
    } catch (error: unknown) {
      showToast(
        getApiErrorMessage(error, 'Não foi possível reenviar o e-mail de verificação.'),
        'error'
      );
    } finally {
      setResending(false);
    }
  };

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
            Conta validada com sucesso. Você será redirecionado para o login em instantes.
          </div>
        )}

        {status === 'error' && (
          <form onSubmit={handleResendVerification} className="mt-6 space-y-3">
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Se o link expirou, informe seu e-mail para reenviar a verificação.
            </div>

            <label
              htmlFor="confirm-resend-email"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400"
            >
              E-mail da conta
            </label>

            <input
              id="confirm-resend-email"
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
              {resending ? 'Reenviando...' : 'Reenviar e-mail de verificação'}
            </button>
          </form>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={SUCCESS_REDIRECT_URL}
            className="rounded-lg border border-primary/40 px-4 py-2 font-semibold text-primary hover:border-primary"
          >
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