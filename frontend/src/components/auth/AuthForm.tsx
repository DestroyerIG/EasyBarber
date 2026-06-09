'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { PasswordInput } from '@/components/ui';
import api from '@/lib/api';
import { getApiErrorCode, getApiErrorMessage } from '@/utils/handleApiError';
import { formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpjDigits } from '@/utils/cpfCnpj';
import { resolveAuthConfirmRedirectUrl } from '@/lib/supabase/client';
import easyBarberLogo from '@/icons/easybarber.png';

type AuthMode = 'login' | 'register';

interface AuthFormProps {
  mode: AuthMode;
  selectedPlan?: string | null;
}

const isTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  if (err.code === 'ECONNABORTED') return true;
  if (err.code === 'ERR_NETWORK') return true;
  if (typeof err.message === 'string' && err.message.toLowerCase().includes('timeout')) return true;
  return false;
};

export function AuthForm({ mode, selectedPlan }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [showConfirmedNotice, setShowConfirmedNotice] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [cpfCnpjValidationError, setCpfCnpjValidationError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    barbershopName: '',
    ownerName: '',
    whatsapp: '',
    cpfCnpj: '',
  });

  const { login, register } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const isLogin = mode === 'login';

  useEffect(() => {
    if (!isLogin || typeof window === 'undefined') {
      setShowConfirmedNotice(false);
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    setShowConfirmedNotice(searchParams.get('confirmed') === '1');
  }, [isLogin]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'cpfCnpj') {
      setFormData((prev) => ({
        ...prev,
        cpfCnpj: formatCpfCnpj(value),
      }));

      if (cpfCnpjValidationError) {
        setCpfCnpjValidationError(null);
      }

      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setVerificationNotice(null);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
        showToast('Login realizado com sucesso.', 'success');
      } else {
        const normalizedCpfCnpj = normalizeCpfCnpjDigits(formData.cpfCnpj);

        if (!normalizedCpfCnpj) {
          setCpfCnpjValidationError('CPF/CNPJ é obrigatório.');
          showToast('Informe o CPF/CNPJ para concluir o cadastro.', 'error');
          return;
        }

        if (!isValidCpfCnpj(normalizedCpfCnpj)) {
          setCpfCnpjValidationError('CPF/CNPJ inválido. Verifique os dados informados.');
          showToast('CPF/CNPJ inválido. Verifique os dados informados.', 'error');
          return;
        }

        setCpfCnpjValidationError(null);

        const result = await register({
          barbershopName: formData.barbershopName,
          ownerName: formData.ownerName,
          email: formData.email,
          whatsapp: formData.whatsapp,
          cpfCnpj: normalizedCpfCnpj,
          password: formData.password,
        });

        // ✅ Redireciona para tela de verificação após cadastro bem-sucedido
        if (result.verificationRequired) {
          router.push(
            `/verificar-email?email=${encodeURIComponent(result.email || formData.email)}`
          );
          return;
        }

        // Fallback: cadastro sem verificação obrigatória
        showToast(result.message, 'success');
      }
    } catch (error: unknown) {
      const errorCode = getApiErrorCode(error);

      // Login com e-mail não verificado
      if (isLogin && errorCode === 'EMAIL_NOT_VERIFIED') {
        setVerificationEmail(formData.email.trim());
        setVerificationSent(false);
        setVerificationNotice(
          'Sua conta ainda não foi verificada. Reenvie o link e confirme seu e-mail para entrar.'
        );
        showToast(getApiErrorMessage(error, 'Erro ao processar solicitação'), 'error');
        return;
      }

      // Timeout — servidor hibernado (Render free tier)
      if (!isLogin && isTimeoutError(error)) {
        setVerificationEmail(formData.email.trim());
        setVerificationSent(false);
        setVerificationNotice(
          'O servidor demorou para responder. Caso já tenha tentado antes, seu cadastro pode ter sido criado — tente reenviar o e-mail de verificação ou faça login.'
        );
        showToast(
          'Tempo esgotado. Verifique se o cadastro foi criado tentando fazer login ou reenviar a verificação.',
          'info'
        );
        return;
      }

      // E-mail já cadastrado (409)
      if (!isLogin && errorCode === 'CONFLICT') {
        setVerificationEmail(formData.email.trim());
        setVerificationSent(false);
        setVerificationNotice(
          'Este e-mail já possui uma conta cadastrada. Caso não tenha verificado seu e-mail, reenvie o link abaixo.'
        );
        showToast('E-mail já cadastrado.', 'error');
        return;
      }

      showToast(getApiErrorMessage(error, 'Erro ao processar solicitação'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const email = (verificationEmail || formData.email || '').trim();

    if (!email) {
      showToast('Informe o e-mail da conta para reenviar a verificação.', 'error');
      return;
    }

    setResendingVerification(true);

    try {
      const response = await api.post('/auth/resend-verification', {
        email,
        emailRedirectTo: resolveAuthConfirmRedirectUrl(),
      });
      const message =
        typeof response.data?.message === 'string'
          ? response.data.message
          : 'Se existir uma conta pendente para este e-mail, processaremos um novo envio de verificação.';

      setVerificationEmail(email);
      setVerificationSent(true);
      setVerificationNotice(message);
      showToast(message, 'info');
    } catch (error: unknown) {
      showToast(
        getApiErrorMessage(error, 'Não foi possível reenviar o e-mail de verificação.'),
        'error'
      );
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.25),_rgba(0,0,0,0.9)_45%)] px-4 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <section className="max-w-xl">
          <div className="inline-flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-primary/30 bg-black/40">
              <Image
                src={easyBarberLogo}
                alt="Logo EasyBarber"
                width={40}
                height={40}
                className="h-full w-full object-contain"
                priority
              />
            </span>
            <p className="text-xs uppercase tracking-[0.24em] text-primary/70">EasyBarber</p>
          </div>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            {isLogin
              ? 'Acesse sua operação e mantenha o controle da barbearia.'
              : 'Abra sua conta e transforme sua barbearia em um negócio previsível.'}
          </h1>
          <p className="mt-4 text-gray-300">
            {isLogin
              ? 'Dashboard completo de agendamentos, clientes, financeiro e performance da equipe.'
              : 'Estrutura SaaS pronta para vender mais, reduzir no-show e operar com eficiência.'}
          </p>

          {!isLogin && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
              14 dias grátis · acesso completo ao Profissional
            </div>
          )}
        </section>

        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-black/70 p-6 sm:p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-black">{isLogin ? 'Login' : 'Criar conta'}</h2>
            <p className="mt-1 text-sm text-gray-400">
              {isLogin ? 'Entre para continuar.' : 'Leva menos de 2 minutos.'}
            </p>
          </div>

          {isLogin && showConfirmedNotice && (
            <div className="mb-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
              E-mail confirmado com sucesso. Agora você já pode entrar.
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-label={isLogin ? 'Formulário de login' : 'Formulário de cadastro'}
          >
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

                <div>
                  <label
                    htmlFor="register-cpf-cnpj"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400"
                  >
                    CPF/CNPJ
                  </label>
                  <input
                    id="register-cpf-cnpj"
                    type="text"
                    name="cpfCnpj"
                    placeholder="Digite o CPF ou CNPJ"
                    value={formData.cpfCnpj}
                    onChange={handleChange}
                    required
                    maxLength={18}
                    className="input"
                  />
                  {cpfCnpjValidationError && (
                    <p className="mt-2 text-sm text-rose-300">{cpfCnpjValidationError}</p>
                  )}
                </div>

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

            <PasswordInput
              name="password"
              placeholder={
                isLogin ? 'Senha' : 'Senha (mín. 8 caracteres, maiúscula e número)'
              }
              value={formData.password}
              onChange={handleChange}
              required
              minLength={isLogin ? 1 : 8}
              className="input"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              toggleLabel="senha"
            />

            {isLogin && (
              <div className="-mt-2 text-right">
                <Link
                  href="/esqueci-senha"
                  className="text-xs font-semibold text-primary transition hover:text-orange-400"
                >
                  Esqueceu sua senha?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-base disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Criar conta'}
            </button>

            {!isLogin && (
              <p className="text-center text-xs leading-relaxed text-gray-400">
                Ao criar conta, você concorda com os{' '}
                <Link href="/termos" target="_blank" className="text-primary hover:underline">
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link href="/privacidade" target="_blank" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            )}

            {/* Aviso de verificação — aparece só em casos de erro/timeout/conflito */}
            {verificationNotice && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
                <p>{verificationNotice}</p>
                {verificationEmail && (
                  <p className="mt-2 text-xs text-gray-300">
                    E-mail: <strong>{verificationEmail}</strong>
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  className="mt-3 rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {resendingVerification ? 'Reenviando...' : 'Reenviar e-mail de verificação'}
                </button>
                {verificationSent && (
                  <p className="mt-2 text-xs text-gray-300">
                    Se não encontrar na caixa de entrada, confira a pasta de spam.
                  </p>
                )}
              </div>
            )}

            {!isLogin && (
              <p className="text-xs text-gray-400">
                Após verificar o e-mail você terá 14 dias de acesso gratuito ao plano Profissional. Assine quando quiser para continuar.
              </p>
            )}
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
