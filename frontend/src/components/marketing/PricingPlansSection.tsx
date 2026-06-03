'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, QrCode } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { CpfCnpjModal } from '@/components/billing/CpfCnpjModal';
import { Modal } from '@/components/ui';
import {
  billingApi,
  type CheckoutPaymentMethod,
  type CouponValidationResponse,
  type PixCheckoutSessionResponse,
  type SubscriptionStatus,
} from '@/lib/billing';
import { barbershopProfileApi } from '@/lib/barbershopProfile';
import { PLAN_MAP, SAAS_PLANS, type PlanId, isPlanId } from '@/lib/plans';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorCode, getApiErrorMessage } from '@/utils/handleApiError';
import {
  formatCpfCnpj,
  isValidCpfCnpj,
  normalizeCpfCnpjDigits,
} from '@/utils/cpfCnpj';

const PIX_STORAGE_KEY = 'easybarber:pixCheckout';

type SupportedPaymentMethod = Extract<CheckoutPaymentMethod, 'card' | 'pix'>;

type CheckoutAction = {
  planId: PlanId;
  paymentMethod: SupportedPaymentMethod;
};

type PixCheckoutStoragePayload = PixCheckoutSessionResponse & {
  planId?: PlanId | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando pagamento',
  active: 'Pagamento confirmado',
  past_due: 'Cobrança vencida',
  unpaid: 'Cobrança inadimplente',
  canceled: 'Cobrança cancelada',
  incomplete: 'Cobrança incompleta',
  trialing: 'Período de teste',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'border-amber-300/40 bg-amber-500/10 text-amber-200',
  active: 'border-emerald-300/40 bg-emerald-500/10 text-emerald-200',
  past_due: 'border-orange-300/40 bg-orange-500/10 text-orange-200',
  unpaid: 'border-rose-300/40 bg-rose-500/10 text-rose-200',
  canceled: 'border-rose-300/40 bg-rose-500/10 text-rose-200',
  incomplete: 'border-orange-300/40 bg-orange-500/10 text-orange-200',
  trialing: 'border-sky-300/40 bg-sky-500/10 text-sky-200',
};

const STATUS_TOAST_VARIANT: Record<string, 'success' | 'info' | 'error'> = {
  pending: 'info',
  active: 'success',
  past_due: 'error',
  unpaid: 'error',
  canceled: 'error',
  incomplete: 'error',
  trialing: 'info',
};

const normalizeQrCodeSource = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value.startsWith('data:image/')) {
    return value;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  return `data:image/png;base64,${value}`;
};

const resolveStoredPlanId = (value: unknown): PlanId | null => {
  if (typeof value !== 'string') {
    return null;
  }

  return isPlanId(value) ? value : null;
};

const formatPixExpiration = (value: string | null) => {
  if (!value) {
    return 'Sem data de expiração informada';
  }

  return new Date(value).toLocaleString('pt-BR');
};

interface PricingPlansSectionProps {
  sectionId?: string;
  title?: string;
  subtitle?: string;
  currentPlan?: string | null;
  subscriptionStatus?: string | null;
  showHeader?: boolean;
  className?: string;
}

export function PricingPlansSection({
  sectionId = 'planos',
  title = 'Planos para cada fase da sua barbearia',
  subtitle = 'Teste 14 dias grátis com acesso completo ao plano Profissional — sem cartão, sem compromisso. Assine quando quiser para continuar.',
  currentPlan,
  subscriptionStatus,
  showHeader = true,
  className,
}: PricingPlansSectionProps) {
  const [processingAction, setProcessingAction] = useState<CheckoutAction | null>(null);
  const [pixCheckout, setPixCheckout] = useState<PixCheckoutSessionResponse | null>(null);
  const [pixCheckoutPlanId, setPixCheckoutPlanId] = useState<PlanId | null>(null);
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [pixStatusLoading, setPixStatusLoading] = useState(false);
  const [barbershopCpfCnpj, setBarbershopCpfCnpj] = useState<string>('');
  const [pendingPixPlanId, setPendingPixPlanId] = useState<PlanId | null>(null);
  const [isCpfCnpjModalOpen, setIsCpfCnpjModalOpen] = useState(false);
  const [cpfCnpjInput, setCpfCnpjInput] = useState('');
  const [cpfCnpjError, setCpfCnpjError] = useState<string | null>(null);
  const [cpfCnpjSaving, setCpfCnpjSaving] = useState(false);
  const [pixCouponCode, setPixCouponCode] = useState('');
  const [pixAppliedCoupon, setPixAppliedCoupon] = useState<CouponValidationResponse | null>(null);
  const [pixValidatingCoupon, setPixValidatingCoupon] = useState(false);
  const [pixCouponError, setPixCouponError] = useState<string | null>(null);
  const [pixRegenerating, setPixRegenerating] = useState(false);
  const [pixPreCheckoutPlanId, setPixPreCheckoutPlanId] = useState<PlanId | null>(null);
  const [isPixPreCheckoutOpen, setIsPixPreCheckoutOpen] = useState(false);
  const [generatingPixCharge, setGeneratingPixCharge] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const pixQrCodeSource = useMemo(() => normalizeQrCodeSource(pixCheckout?.qrCode || null), [pixCheckout?.qrCode]);
  const pixStatusLabel = pixCheckout ? STATUS_LABEL[pixCheckout.status] || pixCheckout.status : null;
  const pixBadgeClass = pixCheckout
    ? STATUS_BADGE_CLASS[pixCheckout.status] || 'border-white/20 bg-white/10 text-gray-100'
    : 'border-white/20 bg-white/10 text-gray-100';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const raw = window.sessionStorage.getItem(PIX_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PixCheckoutStoragePayload;
      if (parsed?.provider === 'asaas' && parsed?.paymentId) {
        const { planId, ...checkoutPayload } = parsed;
        setPixCheckout(checkoutPayload);
        setPixCheckoutPlanId(resolveStoredPlanId(planId));
      }
    } catch {
      window.sessionStorage.removeItem(PIX_STORAGE_KEY);
    }
  }, []);

  const persistPixCheckout = (value: PixCheckoutSessionResponse | null, planId: PlanId | null) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!value) {
      window.sessionStorage.removeItem(PIX_STORAGE_KEY);
      return;
    }

    const payload: PixCheckoutStoragePayload = {
      ...value,
      planId,
    };

    window.sessionStorage.setItem(PIX_STORAGE_KEY, JSON.stringify(payload));
  };

  const getStatusToastVariant = (status: SubscriptionStatus): 'success' | 'info' | 'error' => {
    return STATUS_TOAST_VARIANT[status] || 'info';
  };

  const copyPixPayload = async () => {
    if (!pixCheckout?.pixCopyPaste) {
      showToast('Payload Pix indisponível para cópia.', 'info');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pixCheckout.pixCopyPaste);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = pixCheckout.pixCopyPaste;
        textArea.setAttribute('readonly', 'true');
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      showToast('Código Pix copiado para a área de transferência.', 'success');
    } catch {
      showToast('Não foi possível copiar o código Pix.', 'error');
    }
  };

  const refreshPixStatus = async () => {
    if (!pixCheckout?.paymentId) {
      showToast('Cobrança Pix inválida para atualização.', 'error');
      return;
    }

    setPixStatusLoading(true);

    try {
      const updated = await billingApi.getPixPaymentStatus(pixCheckout.paymentId);

      const nextCheckout: PixCheckoutSessionResponse = {
        ...pixCheckout,
        status: updated.status,
        qrCode: updated.qrCode || pixCheckout.qrCode,
        pixCopyPaste: updated.pixCopyPaste || pixCheckout.pixCopyPaste,
        expiresAt: updated.expiresAt || pixCheckout.expiresAt,
      };

      setPixCheckout(nextCheckout);
      persistPixCheckout(nextCheckout, pixCheckoutPlanId);

      if (updated.status === 'active') {
        showToast('Pagamento confirmado. Assinatura ativada.', 'success');
      } else {
        const statusLabel = STATUS_LABEL[updated.status] || updated.status;
        showToast(`Status atualizado: ${statusLabel}.`, getStatusToastVariant(updated.status));
      }
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Não foi possível atualizar o status do Pix.');
      showToast(message, 'error');
    } finally {
      setPixStatusLoading(false);
    }
  };

  const handleApplyPixCoupon = async () => {
    const code = pixCouponCode.trim();
    if (!code || !pixCheckoutPlanId) return;

    setPixValidatingCoupon(true);
    setPixCouponError(null);
    setPixAppliedCoupon(null);

    try {
      // 1. Valida o cupom (mostra o desconto ao usuário).
      const result = await billingApi.validateCoupon(pixCheckoutPlanId, code);
      setPixAppliedCoupon(result);

      // 2. Regenera a cobrança Pix imediatamente para que o QR Code (e o valor
      //    escaneado no banco) já reflita o desconto, sem exigir um segundo clique.
      const hasCpfCnpj = await ensureCpfCnpjForPix(pixCheckoutPlanId);
      if (!hasCpfCnpj) return;

      const session = await billingApi.createCheckoutSession(pixCheckoutPlanId, 'pix', code);

      if ('type' in session && session.type === 'FREE_ACTIVATION') {
        showToast('Cupom aplicado: plano ativado gratuitamente!', 'success');
        router.push('/dashboard');
        return;
      }

      if ('provider' in session && session.provider === 'asaas') {
        setPixCheckout(session);
        persistPixCheckout(session, pixCheckoutPlanId);
        showToast('Cupom aplicado. QR Code atualizado com desconto.', 'success');
      }
    } catch (error: unknown) {
      const errorCode = getApiErrorCode(error);
      const msg =
        errorCode === 'INVALID_COUPON'
          ? 'Cupom inválido ou expirado.'
          : getApiErrorMessage(error, 'Falha ao aplicar cupom.');
      setPixCouponError(msg);
      setPixAppliedCoupon(null);
    } finally {
      setPixValidatingCoupon(false);
    }
  };

  const handleRegeneratePixWithCoupon = async () => {
    if (!pixCheckoutPlanId || !pixAppliedCoupon) return;

    setPixRegenerating(true);

    try {
      const hasCpfCnpj = await ensureCpfCnpjForPix(pixCheckoutPlanId);
      if (!hasCpfCnpj) return;

      const session = await billingApi.createCheckoutSession(
        pixCheckoutPlanId,
        'pix',
        pixCouponCode.trim()
      );

      if ('provider' in session && session.provider === 'asaas') {
        setPixCheckout(session);
        persistPixCheckout(session, pixCheckoutPlanId);
        setPixAppliedCoupon(null);
        showToast('QR Code atualizado com desconto aplicado.', 'success');
      }
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Não foi possível regenerar a cobrança.');
      showToast(message, 'error');
    } finally {
      setPixRegenerating(false);
    }
  };

  const closePixPreCheckout = () => {
    if (generatingPixCharge) return;
    setIsPixPreCheckoutOpen(false);
    setPixPreCheckoutPlanId(null);
    setPixCouponCode('');
    setPixAppliedCoupon(null);
    setPixCouponError(null);
  };

  const handleApplyPreCheckoutCoupon = async () => {
    const code = pixCouponCode.trim();
    if (!code || !pixPreCheckoutPlanId) return;

    setPixValidatingCoupon(true);
    setPixCouponError(null);
    setPixAppliedCoupon(null);

    try {
      const result = await billingApi.validateCoupon(pixPreCheckoutPlanId, code);
      setPixAppliedCoupon(result);
    } catch (error: unknown) {
      const errorCode = getApiErrorCode(error);
      const msg =
        errorCode === 'INVALID_COUPON'
          ? 'Cupom inválido ou expirado.'
          : getApiErrorMessage(error, 'Falha ao validar cupom.');
      setPixCouponError(msg);
      setPixAppliedCoupon(null);
    } finally {
      setPixValidatingCoupon(false);
    }
  };

  const handleGeneratePixCharge = async () => {
    if (!pixPreCheckoutPlanId) return;

    setGeneratingPixCharge(true);

    try {
      const couponCode = pixAppliedCoupon ? pixCouponCode.trim() : undefined;
      const session = await billingApi.createCheckoutSession(pixPreCheckoutPlanId, 'pix', couponCode);

      if ('type' in session && session.type === 'FREE_ACTIVATION') {
        showToast('Cupom aplicado: plano ativado gratuitamente!', 'success');
        router.push('/dashboard');
        return;
      }

      if (!('provider' in session) || session.provider !== 'asaas') {
        showToast('Checkout Pix indisponível no momento. Tente novamente.', 'error');
        return;
      }

      const planId = pixPreCheckoutPlanId;
      setPixCheckout(session);
      setPixCheckoutPlanId(planId);
      persistPixCheckout(session, planId);
      setIsPixPreCheckoutOpen(false);
      setPixPreCheckoutPlanId(null);
      setPixAppliedCoupon(null);
      setPixCouponCode('');
      setPixCouponError(null);
      setIsPixModalOpen(true);
      showToast(
        couponCode
          ? 'Cobrança Pix criada com desconto. Escaneie o QR Code.'
          : 'Cobrança Pix criada. Escaneie o QR Code para concluir o pagamento.',
        'success'
      );
    } catch (error: unknown) {
      const errorCode = getApiErrorCode(error);

      if (errorCode === 'CPF_CNPJ_REQUIRED') {
        openCpfCnpjModal(pixPreCheckoutPlanId, barbershopCpfCnpj);
        setIsPixPreCheckoutOpen(false);
        showToast('Para continuar no Pix, informe o CPF/CNPJ da barbearia.', 'info');
        return;
      }

      const message = getApiErrorMessage(error, 'Não foi possível gerar a cobrança Pix.');
      showToast(message, 'error');
    } finally {
      setGeneratingPixCharge(false);
    }
  };

  const isCurrentPlan = (planId: PlanId) => {
    return currentPlan === planId && (subscriptionStatus === 'active' || subscriptionStatus === 'trialing');
  };

  const openCpfCnpjModal = (planId: PlanId, currentValue = '') => {
    setPendingPixPlanId(planId);
    setCpfCnpjInput(formatCpfCnpj(currentValue));
    setCpfCnpjError(null);
    setIsCpfCnpjModalOpen(true);
  };

  const closeCpfCnpjModal = () => {
    if (cpfCnpjSaving) {
      return;
    }

    setIsCpfCnpjModalOpen(false);
    setPendingPixPlanId(null);
    setCpfCnpjError(null);
  };

  const ensureCpfCnpjForPix = async (planId: PlanId) => {
    if (isValidCpfCnpj(barbershopCpfCnpj)) {
      return true;
    }

    try {
      const profile = await barbershopProfileApi.getProfile();
      const normalizedCpfCnpj = normalizeCpfCnpjDigits(profile.cpfCnpj);

      if (isValidCpfCnpj(normalizedCpfCnpj)) {
        setBarbershopCpfCnpj(normalizedCpfCnpj);
        return true;
      }

      openCpfCnpjModal(planId, normalizedCpfCnpj);
      showToast('Antes de pagar com Pix, informe o CPF/CNPJ da barbearia.', 'info');
      return false;
    } catch (error: unknown) {
      const errorCode = getApiErrorCode(error);

      if (errorCode === 'NOT_FOUND' || errorCode === 'CPF_CNPJ_REQUIRED' || errorCode === 'VALIDATION_ERROR') {
        openCpfCnpjModal(planId);
        showToast('Antes de pagar com Pix, informe o CPF/CNPJ da barbearia.', 'info');
        return false;
      }

      const message = getApiErrorMessage(error, 'Não foi possível validar o CPF/CNPJ da barbearia.');
      showToast(message, 'error');
      return false;
    }
  };

  const handleCpfCnpjInputChange = (value: string) => {
    setCpfCnpjInput(formatCpfCnpj(value));
    if (cpfCnpjError) {
      setCpfCnpjError(null);
    }
  };

  const handleSaveCpfCnpj = async () => {
    const normalizedCpfCnpj = normalizeCpfCnpjDigits(cpfCnpjInput);

    if (!normalizedCpfCnpj) {
      setCpfCnpjError('Informe o CPF ou CNPJ para continuar.');
      return;
    }

    if (!isValidCpfCnpj(normalizedCpfCnpj)) {
      setCpfCnpjError('CPF/CNPJ inválido. Verifique os números informados.');
      return;
    }

    setCpfCnpjSaving(true);

    try {
      const profile = await barbershopProfileApi.updateProfile(normalizedCpfCnpj);
      const savedCpfCnpj = normalizeCpfCnpjDigits(profile.cpfCnpj) || normalizedCpfCnpj;

      setBarbershopCpfCnpj(savedCpfCnpj);
      setCpfCnpjInput(formatCpfCnpj(savedCpfCnpj));
      setIsCpfCnpjModalOpen(false);
      setCpfCnpjError(null);
      showToast('CPF/CNPJ salvo com sucesso.', 'success');

      const planToContinue = pendingPixPlanId;
      setPendingPixPlanId(null);

      if (planToContinue) {
        await handlePlanSelect(planToContinue, 'pix');
      }
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Não foi possível salvar o CPF/CNPJ agora.');
      setCpfCnpjError(message);
      showToast(message, 'error');
    } finally {
      setCpfCnpjSaving(false);
    }
  };

  const handlePlanSelect = async (planId: PlanId, paymentMethod: SupportedPaymentMethod) => {
    if (!user) {
      router.push(`/cadastro?plan=${planId}&paymentMethod=${paymentMethod}`);
      return;
    }

    if (isCurrentPlan(planId)) {
      showToast('Este já é o seu plano ativo.', 'info');
      return;
    }

    setProcessingAction({ planId, paymentMethod });

    try {
      if (paymentMethod === 'pix') {
        const hasCpfCnpj = await ensureCpfCnpjForPix(planId);
        if (!hasCpfCnpj) {
          return;
        }

        setPixPreCheckoutPlanId(planId);
        setPixCouponCode('');
        setPixAppliedCoupon(null);
        setPixCouponError(null);
        setIsPixPreCheckoutOpen(true);
        return;
      }

      const session = await billingApi.createCheckoutSession(planId, paymentMethod);

      if ('type' in session && session.type === 'FREE_ACTIVATION') {
        showToast('Plano ativado com sucesso! Aproveite o sistema.', 'success');
        router.push('/dashboard');
        return;
      }

      if (!('provider' in session)) {
        return;
      }

      if (session.provider !== 'stripe') {
        showToast('Checkout com cartão indisponível no momento. Tente novamente.', 'error');
        return;
      }

      window.location.href = session.checkoutUrl;
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Não foi possível iniciar o checkout no momento.');
      showToast(message, 'error');
    } finally {
      setProcessingAction(null);
    }
  };

  return (
    <section id={sectionId} className={className}>
      {showHeader && (
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">Planos</p>
          <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 text-gray-400">{subtitle}</p>
          <p className="mt-3 text-sm text-gray-500">
            Em cada plano você pode escolher checkout com cartão via Stripe ou pagamento Pix via Asaas.
          </p>
        </div>
      )}

      {pixCheckout && !isPixModalOpen && (
        <div className="mb-8 rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Cobrança Pix pendente</p>
              <p className="mt-1 text-sm text-cyan-50/95">
                {pixStatusLabel}
                {pixCheckoutPlanId ? ` · Plano ${PLAN_MAP[pixCheckoutPlanId].name}` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsPixModalOpen(true)}
              className="rounded-lg bg-cyan-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-cyan-200"
            >
              Abrir cobrança Pix
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {SAAS_PLANS.map((plan) => {
          const recommended = plan.recommended;
          const current = isCurrentPlan(plan.id);
          const planBusy = processingAction?.planId === plan.id;
          const cardBusy = planBusy && processingAction?.paymentMethod === 'card';
          const pixBusy = planBusy && processingAction?.paymentMethod === 'pix';

          return (
            <article
              key={plan.id}
              className={[
                'relative rounded-2xl border bg-dark-light p-7 transition-all',
                recommended ? 'border-primary shadow-xl shadow-primary/10' : 'border-white/10',
                current ? 'ring-2 ring-emerald-400/60' : '',
              ].join(' ')}
            >
              {recommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-black uppercase tracking-[0.2em] text-black">
                  Recomendado
                </span>
              )}

              <div className="mb-5 text-center">
                <h3 className="text-2xl font-black">{plan.name}</h3>
                <p className="mt-2 text-sm text-gray-400">{plan.description}</p>
                <p className="mt-4 text-4xl font-black text-primary">
                  {formatCurrency(plan.price)}
                  <span className="text-sm font-medium text-gray-400">/mês</span>
                </p>
                <p className="mt-2 inline-flex items-center rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium leading-snug text-emerald-200 sm:text-xs">
                  14 dias grátis no cadastro · sem cartão obrigatório
                </p>
              </div>

              <ul className="space-y-2 text-sm text-gray-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 space-y-2">
                {!user ? (
                  <>
                    <a
                      href="/cadastro"
                      className={[
                        'block w-full rounded-xl px-4 py-3 text-center text-sm font-bold transition-colors',
                        recommended
                          ? 'bg-primary text-black hover:bg-orange-500'
                          : 'bg-white text-black hover:bg-gray-200',
                      ].join(' ')}
                    >
                      Começar grátis
                    </a>
                    <p className="text-center text-[11px] text-gray-500">
                      14 dias grátis · sem cartão no cadastro
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePlanSelect(plan.id, 'card')}
                      disabled={planBusy || current}
                      className={[
                        'w-full rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-75',
                        current
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : recommended
                          ? 'bg-primary text-black hover:bg-orange-500'
                          : 'bg-white text-black hover:bg-gray-200',
                      ].join(' ')}
                    >
                      {cardBusy ? 'Redirecionando...' : current ? 'Plano atual' : 'Assinar com Cartão'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePlanSelect(plan.id, 'pix')}
                      disabled={planBusy || current}
                      className={[
                        'w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-75',
                        current
                          ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-200'
                          : 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20',
                      ].join(' ')}
                    >
                      {pixBusy ? 'Gerando Pix...' : current ? 'Plano atual' : 'Pagar com Pix'}
                    </button>

                    <p className="text-center text-[11px] text-gray-500">
                      Cartão abre checkout Stripe. Pix gera QR Code na tela para pagamento imediato.
                    </p>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* ── Modal pré-checkout Pix: cupom opcional + gerar cobrança ── */}
      <Modal
        isOpen={isPixPreCheckoutOpen}
        onClose={closePixPreCheckout}
        title={pixPreCheckoutPlanId ? `Pagar com Pix · ${PLAN_MAP[pixPreCheckoutPlanId].name}` : 'Pagar com Pix'}
        icon={QrCode}
      >
        <div className="space-y-5">
          {pixPreCheckoutPlanId && (
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="font-semibold text-white">{PLAN_MAP[pixPreCheckoutPlanId].name}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {formatCurrency(PLAN_MAP[pixPreCheckoutPlanId].price)}/mês · pagamento único via Pix
              </p>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Cupom de desconto (opcional)</p>

            {pixAppliedCoupon ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 text-sm">
                  <CheckCircle2 size={14} />
                  <span>Cupom validado: <strong>{pixCouponCode.toUpperCase()}</strong></span>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Valor original</span>
                    <span>{formatCurrency(pixAppliedCoupon.originalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-rose-300">
                    <span>Desconto</span>
                    <span>-{formatCurrency(pixAppliedCoupon.discount)}</span>
                  </div>
                  <div className="flex justify-between text-white font-bold border-t border-white/10 pt-1 mt-1">
                    <span>Total final</span>
                    <span>{formatCurrency(pixAppliedCoupon.finalAmount)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setPixAppliedCoupon(null); setPixCouponCode(''); setPixCouponError(null); }}
                  disabled={generatingPixCharge}
                  className="text-xs text-gray-400 transition hover:text-white disabled:opacity-50"
                >
                  Remover cupom
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={pixCouponCode}
                    onChange={(e) => { setPixCouponCode(e.target.value.toUpperCase()); setPixCouponError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyPreCheckoutCoupon()}
                    placeholder="Código do cupom"
                    disabled={pixValidatingCoupon || generatingPixCharge}
                    className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPreCheckoutCoupon}
                    disabled={pixValidatingCoupon || generatingPixCharge || !pixCouponCode.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black transition hover:bg-orange-500 disabled:opacity-60"
                  >
                    {pixValidatingCoupon ? 'Validando...' : 'Aplicar'}
                  </button>
                </div>
                {pixCouponError && (
                  <p className="text-xs text-rose-300">{pixCouponError}</p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleGeneratePixCharge}
            disabled={generatingPixCharge || pixValidatingCoupon}
            className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {generatingPixCharge ? 'Gerando cobrança...' : 'Gerar cobrança Pix'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(pixCheckout) && isPixModalOpen}
        onClose={() => setIsPixModalOpen(false)}
        title={pixCheckoutPlanId ? `Pagamento Pix · ${PLAN_MAP[pixCheckoutPlanId].name}` : 'Pagamento Pix'}
        icon={QrCode}
      >
        {pixCheckout && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={[
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em]',
                pixBadgeClass,
              ].join(' ')}>
                {pixStatusLabel}
              </span>
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-gray-300">
                Expira em {formatPixExpiration(pixCheckout.expiresAt)}
              </span>
            </div>

            <p className="text-sm text-gray-300">
              Escaneie o QR Code no app do banco ou use o código copia e cola para concluir seu pagamento.
            </p>

            {/* ── Cupom de desconto ── */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Cupom de desconto</p>

              {pixCheckout.coupon ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 size={14} />
                    <span>Cupom aplicado: <strong>{pixCheckout.coupon.code}</strong></span>
                  </div>
                  {pixCheckout.discount !== undefined && pixCheckout.discount > 0 && (
                    <p className="text-xs text-gray-400">
                      Desconto: <span className="text-rose-300 font-semibold">-{formatCurrency(pixCheckout.discount)}</span>
                    </p>
                  )}
                </div>
              ) : pixAppliedCoupon ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300 text-sm">
                    <CheckCircle2 size={14} />
                    <span>Cupom validado: <strong>{pixCouponCode.toUpperCase()}</strong></span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>Valor original</span>
                      <span>{formatCurrency(pixAppliedCoupon.originalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-rose-300">
                      <span>Desconto</span>
                      <span>-{formatCurrency(pixAppliedCoupon.discount)}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold border-t border-white/10 pt-1 mt-1">
                      <span>Total final</span>
                      <span>{formatCurrency(pixAppliedCoupon.finalAmount)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRegeneratePixWithCoupon}
                      disabled={pixRegenerating}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-70"
                    >
                      {pixRegenerating ? 'Gerando...' : 'Gerar QR Code com desconto'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPixAppliedCoupon(null); setPixCouponCode(''); setPixCouponError(null); }}
                      disabled={pixRegenerating}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs text-gray-400 transition hover:text-white disabled:opacity-60"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={pixCouponCode}
                      onChange={(e) => { setPixCouponCode(e.target.value.toUpperCase()); setPixCouponError(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyPixCoupon()}
                      placeholder="Código do cupom"
                      className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPixCoupon}
                      disabled={pixValidatingCoupon || !pixCouponCode.trim()}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black transition hover:bg-orange-500 disabled:opacity-60"
                    >
                      {pixValidatingCoupon ? 'Validando...' : 'Aplicar'}
                    </button>
                  </div>
                  {pixCouponError && (
                    <p className="text-xs text-rose-300">{pixCouponError}</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Código Pix copia e cola</p>
                  <p className="mt-2 break-all text-xs text-gray-100">
                    {pixCheckout.pixCopyPaste || 'Código Pix indisponível no momento.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyPixPayload}
                    disabled={!pixCheckout.pixCopyPaste}
                    className="rounded-lg border border-cyan-300/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Copiar código Pix
                  </button>
                  <button
                    type="button"
                    onClick={refreshPixStatus}
                    disabled={pixStatusLoading}
                    className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {pixStatusLoading ? 'Atualizando...' : 'Já paguei / Atualizar status'}
                  </button>
                </div>
              </div>

              <div className="mx-auto rounded-xl border border-cyan-300/30 bg-black/30 p-3">
                {pixQrCodeSource ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pixQrCodeSource}
                    alt="QR Code Pix"
                    className="h-44 w-44 rounded-lg bg-white p-2 object-contain"
                  />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-cyan-300/40 px-2 text-center text-xs text-cyan-100/80">
                    QR Code indisponível para esta cobrança.
                  </div>
                )}
              </div>
            </div>

            {pixCheckout.status === 'active' && (
              <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Pagamento confirmado. Sua assinatura foi ativada.
              </div>
            )}

            {(pixCheckout.status === 'past_due' ||
              pixCheckout.status === 'unpaid' ||
              pixCheckout.status === 'canceled') && (
              <div className="rounded-xl border border-rose-300/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                Esta cobrança Pix não foi concluída. Gere uma nova cobrança para continuar.
              </div>
            )}
          </div>
        )}
      </Modal>

      <CpfCnpjModal
        isOpen={isCpfCnpjModalOpen}
        value={cpfCnpjInput}
        errorMessage={cpfCnpjError}
        submitting={cpfCnpjSaving}
        onChange={handleCpfCnpjInputChange}
        onClose={closeCpfCnpjModal}
        onSubmit={handleSaveCpfCnpj}
      />
    </section>
  );
}
