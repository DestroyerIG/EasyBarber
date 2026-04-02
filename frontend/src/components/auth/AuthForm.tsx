'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { isPlanId, PLAN_MAP } from '@/lib/plans';

type AuthMode = 'login' | 'register';

interface AuthFormProps {
  mode: AuthMode;
  selectedPlan?: string | null;
}

export function AuthForm({ mode, selectedPlan }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    barbershopName: '',
    ownerName: '',
    whatsapp: '',
  });

  const { login, register } = useAuth();
  const { showToast } = useToast();

  const isLogin = mode === 'login';
  const normalizedPlan = selectedPlan && isPlanId(selectedPlan) ? selectedPlan : null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
        showToast('Login realizado com sucesso.', 'success');
      } else {
        const redirectTo = normalizedPlan && normalizedPlan !== 'basico'
          ? `/dashboard?checkoutPlan=${normalizedPlan}`
          : '/dashboard';

        await register(
          {
            barbershopName: formData.barbershopName,
            ownerName: formData.ownerName,
            email: formData.email,
            whatsapp: formData.whatsapp,
            password: formData.password,
          },
          { redirectTo }
        );

        showToast('Cadastro concluído com sucesso.', 'success');
      }
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const resData = error.response?.data;
        const message =
          resData?.details?.join(' | ') ||
          (typeof resData?.error === 'string' ? resData.error : resData?.error?.message) ||
          'Erro ao processar solicitação';
        showToast(message, 'error');
      } else {
        showToast('Erro inesperado. Tente novamente.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.25),_rgba(0,0,0,0.9)_45%)] px-4 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <section className="max-w-xl">
          <p className="text-xs uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">
            {isLogin ? 'Acesse sua operação e mantenha o controle da barbearia.' : 'Abra sua conta e transforme sua barbearia em um negócio previsível.'}
          </h1>
          <p className="mt-4 text-gray-300">
            {isLogin
              ? 'Dashboard completo de agendamentos, clientes, financeiro e performance da equipe.'
              : 'Estrutura SaaS pronta para vender mais, reduzir no-show e operar com eficiência.'}
          </p>

          {normalizedPlan && !isLogin && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
              Plano selecionado: <strong>{PLAN_MAP[normalizedPlan].name}</strong>
            </div>
          )}
        </section>

        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-black">{isLogin ? 'Login' : 'Criar conta'}</h2>
            <p className="mt-1 text-sm text-gray-400">
              {isLogin ? 'Entre para continuar.' : 'Leva menos de 2 minutos.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" aria-label={isLogin ? 'Formulário de login' : 'Formulário de cadastro'}>
            {!isLogin && (
              <>
                <input
                  type="text"
                  name="barbershopName"
                  placeholder="Nome da barbearia"
                  value={formData.barbershopName}
                  onChange={handleChange}
                  required
                  className="input"
                />
                <input
                  type="text"
                  name="ownerName"
                  placeholder="Nome do responsável"
                  value={formData.ownerName}
                  onChange={handleChange}
                  required
                  className="input"
                />
                <input
                  type="tel"
                  name="whatsapp"
                  placeholder="WhatsApp"
                  value={formData.whatsapp}
                  onChange={handleChange}
                  required
                  className="input"
                />
              </>
            )}

            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="input"
            />

            <input
              type="password"
              name="password"
              placeholder={isLogin ? 'Senha' : 'Senha (mín. 8 caracteres, maiúscula e número)'}
              value={formData.password}
              onChange={handleChange}
              required
              minLength={isLogin ? 1 : 8}
              className="input"
            />

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-base disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-400">
            {isLogin ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <Link
              href={isLogin ? '/cadastro' : '/login'}
              className="font-semibold text-primary hover:text-orange-400"
            >
              {isLogin ? 'Cadastrar-se' : 'Fazer login'}
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
