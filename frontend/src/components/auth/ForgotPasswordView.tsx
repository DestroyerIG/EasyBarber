'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  getSupabaseBrowserClient,
  isSupabaseBrowserClientConfigured,
} from '@/lib/supabase/browserClient';

export function ForgotPasswordView() {
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
      if (!isSupabaseBrowserClientConfigured()) {
        throw new Error('Configuração do Supabase ausente no frontend.');
      }

      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/redefinir-senha`;

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) {
        throw error;
      }

      setStatus('success');
      setMessage('Se existir uma conta com esse e-mail, enviaremos um link para redefinir a senha.');
    } catch (error) {
      console.error('Erro ao solicitar redefinição de senha:', error);
      setStatus('error');
      if (error instanceof Error && error.message.includes('Configuração do Supabase')) {
        setMessage(error.message);
      } else {
        setMessage('Não foi possível enviar o link de redefinição agora. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.2),_rgba(0,0,0,0.92)_45%)] px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
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