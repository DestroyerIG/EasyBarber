'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { CreditCard, Loader2, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import {
  billingApi,
  type CheckoutPaymentMethod,
  type CouponValidationResponse,
  type PixCheckoutSessionResponse,
  type SubscriptionStatusResponse,
} from '@/lib/billing';
import { formatCurrency } from '@/lib/formatters';
import { isPlanId, PLAN_MAP, type PlanId } from '@/lib/plans';
import { getApiErrorMessage } from '@/utils/handleApiError';
import easyBarberLogo from '@/icons/easybarber.png';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

const normalizeQrCodeSource = (value: string | null) => {
  if (!value) return null;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `data:image/png;base64,${value}`;
};

const resolvePlan = (
  searchPlan: string | null,
  billingStatus: SubscriptionStatusResponse | null
): PlanId => {
  if (billingStatus?.desiredPlan && isPlanId(String(billingStatus.desiredPlan))) {
    return billingStatus.desiredPlan as PlanId;
  }

  if (searchPlan && isPlanId(searchPlan)) {
    return searchPlan;
  }

  if (billingStatus?.plan && isPlanId(String(billingStatus.plan))) {
    return billingStatus.plan as PlanId;
  }

  return 'basico';
};

function PagamentoContent() {
  const [billingStatus, setBillingStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [pixCheckout, setPixCheckout] = useState<PixCheckoutSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingMethod, setProcessingMethod] = useState<CheckoutPaymentMethod | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponState, setCouponState] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [couponData, setCouponData] = useState<Pick<CouponValidationResponse, 'discount' | 'finalAmount'> | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { showToast } = useToast();

  const selectedPlan = useMemo(
    () => resolvePlan(searchParams.get('plan'), billingStatus),
    [billingStatus, searchParams]
  );
  const plan = PLAN_MAP[selectedPlan];
  const pixQrCodeSource = normalizeQrCodeSource(pixCheckout?.qrCode || null);
  const couponCodeNormalized = couponCode.trim().toUpperCase();
  const appliedDiscount = couponData?.discount ?? pixCheckout?.discount ?? 0;
  const originalAmount = plan.price;
  const finalAmount = couponData?.finalAmount
    ?? (appliedDiscount > 0
      ? Math.max(0, Number((plan.price - appliedDiscount).toFixed(2)))
      : plan.price);
  const hasDiscount = appliedDiscount > 0;
  const appliedCouponCode = pixCheckout?.coupon?.code || (couponState === 'valid' ? couponCodeNormalized : null);
  const isFreeActivation = couponState === 'valid' && couponData?.finalAmount === 0;

  const refreshBillingStatus = async () => {
    const status = await billingApi.getStatus();
    setBillingStatus(status);

    if (ACTIVE_STATUSES.has(status.subscriptionStatus) && !status.paymentRequired) {
      router.replace('/dashboard');
      return status;
    }

    return status;
  };

  useEffect(() => {
    if (authLoading) return;

    if (user?.role === 'platform_admin') {
      router.replace('/admin');
      return;
    }

    let mounted = true;

    const loadStatus = async () => {
      try {
        const status = await billingApi.getStatus();
        if (!mounted) return;

        setBillingStatus(status);

        if (ACTIVE_STATUSES.has(status.subscriptionStatus) && !status.paymentRequired) {
          router.replace('/dashboard');
        }
      } catch (error: unknown) {
        if (!mounted) return;
        showToast(getApiErrorMessage(error, 'Não foi possível carregar seu status de pagamento.'), 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadStatus();

    return () => {
      mounted = false;
    };
  }, [authLoading, router, showToast, user?.role]);

  useEffect(() => {
    setCouponCode('');
    setCouponState('idle');
    setCouponData(null);
  }, [selectedPlan]);

  const handleApplyCoupon = async () => {
    if (!couponCodeNormalized) {
      return;
    }

    setCouponState('loading');

    try {
      const result = await billingApi.validateCoupon(selectedPlan, couponCodeNormalized);
      setCouponData({
        discount: result.discount,
        finalAmount: result.finalAmount,
      });
      setCouponState('valid');
    } catch {
      setCouponState('invalid');
      setCouponData(null);
    }
  };

  const handleClearCoupon = () => {
    setCouponCode('');
    setCouponState('idle');
    setCouponData(null);
  };

  const startCheckout = async (paymentMethod: CheckoutPaymentMethod) => {
    setProcessingMethod(paymentMethod);

    try {
      const couponToApply = paymentMethod === 'pix' ? (couponCodeNormalized || null) : null;
      const session = await billingApi.createCheckoutSession(selectedPlan, paymentMethod, couponToApply);

      if ('type' in session && session.type === 'FREE_ACTIVATION') {
        showToast('Plano ativado com sucesso! Aproveite o sistema.', 'success');
        router.replace('/dashboard');
        return;
      }

      if (!('provider' in session)) {
        return;
      }

      if (session.provider === 'stripe') {
        window.location.assign(session.checkoutUrl);
        return;
      }

      const pixSession = session;
      setPixCheckout(pixSession);
      if (pixSession.coupon?.code) {
        setCouponCode(pixSession.coupon.code);
        setCouponState('valid');

        if (typeof pixSession.discount === 'number') {
          const resolvedDiscount = pixSession.discount;
          const resolvedFinalAmount = Math.max(
            0,
            Number((plan.price - resolvedDiscount).toFixed(2))
          );

          setCouponData({
            discount: resolvedDiscount,
            finalAmount: resolvedFinalAmount,
          });
        }
      }
      setBillingStatus((current) => current ? {
        ...current,
        subscriptionStatus: pixSession.status,
        provider: 'asaas',
        paymentMethod: 'pix',
        providerPaymentId: pixSession.paymentId,
        providerSubscriptionId: pixSession.subscriptionId,
        paymentRequired: pixSession.status !== 'active',
      } : current);
      showToast('Cobrança Pix criada. Finalize o pagamento para ativar sua conta.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível iniciar o pagamento agora.'), 'error');
    } finally {
      setProcessingMethod(null);
    }
  };

  const copyPixPayload = async () => {
    if (!pixCheckout?.pixCopyPaste) {
      showToast('Código Pix indisponível.', 'info');
      return;
    }

    try {
      await navigator.clipboard.writeText(pixCheckout.pixCopyPaste);
      showToast('Código Pix copiado.', 'success');
    } catch {
      showToast('Não foi possível copiar o código Pix.', 'error');
    }
  };

  const checkPayment = async () => {
    setCheckingPayment(true);

    try {
      if (pixCheckout?.paymentId) {
        const updated = await billingApi.getPixPaymentStatus(pixCheckout.paymentId);
        setPixCheckout((current) => current ? {
          ...current,
          status: updated.status,
          qrCode: updated.qrCode || current.qrCode,
          pixCopyPaste: updated.pixCopyPaste || current.pixCopyPaste,
          expiresAt: updated.expiresAt || current.expiresAt,
        } : current);

        if (updated.status === 'active') {
          showToast('Pagamento confirmado. Acesso liberado.', 'success');
          router.replace('/dashboard');
          return;
        }

        showToast('Pagamento ainda aguardando confirmação.', 'info');
        return;
      }

      const status = await refreshBillingStatus();
      if (!ACTIVE_STATUSES.has(status.subscriptionStatus)) {
        showToast('Pagamento ainda aguardando confirmação.', 'info');
      }
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível verificar o pagamento.'), 'error');
    } finally {
      setCheckingPayment(false);
    }
  };

  if (loading || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="flex items-center gap-3 text-gray-300">
          <Loader2 className="animate-spin text-primary" size={20} />
          Carregando pagamento...
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-black px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-primary/30 bg-black/40">
            <Image src={easyBarberLogo} alt="Logo EasyBarber" width={40} height={40} className="h-full w-full object-contain" />
          </span>
          <span className="text-xl font-black text-primary">EasyBarber</span>
        </div>

        <button onClick={logout} className="text-sm font-semibold text-gray-400 transition hover:text-white">
          Sair
        </button>
      </div>

      <section className="mx-auto mt-10 grid w-full max-w-5xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-white/10 bg-dark-light p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">E-mail confirmado</p>
          <h1 className="mt-3 text-3xl font-black text-white">
            Finalize o pagamento para ativar sua conta
          </h1>
          <p className="mt-4 text-gray-300">
            Seu cadastro foi confirmado. O dashboard será liberado automaticamente após Pix confirmado ou assinatura com cartão ativa.
          </p>

          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <p className="text-sm text-gray-300">Plano selecionado</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-white">{plan.name}</h2>
                <p className="text-sm text-gray-400">{plan.description}</p>
              </div>
              <div className="text-right">
                {hasDiscount && (
                  <p className="text-xs text-gray-500 line-through">{formatCurrency(originalAmount)}</p>
                )}
                <p className="text-2xl font-black text-primary">
                  {formatCurrency(finalAmount)}
                  <span className="text-sm text-gray-400">/mês</span>
                </p>
                {hasDiscount && (
                  <p className="text-xs font-semibold text-emerald-300">Desconto de {formatCurrency(appliedDiscount)}</p>
                )}
              </div>
            </div>
          </div>

          <ul className="mt-6 space-y-3">
            {plan.features.slice(0, 5).map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-gray-300">
                <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={16} />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-dark-light p-7">
          <h2 className="text-xl font-black text-white">Escolha a forma de pagamento</h2>
          <p className="mt-2 text-sm text-gray-400">
            Status atual: <span className="font-semibold text-amber-200">{billingStatus?.subscriptionStatus || 'incomplete'}</span>
          </p>

          <div className="mt-6">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-2">
              Cupom de desconto
            </p>

            {couponState !== 'valid' ? (
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200
      ${couponState === 'invalid'
        ? 'border-red-500/40 bg-red-500/5'
        : 'border-zinc-700 bg-zinc-800/60 focus-within:border-zinc-500'
      }`}
              >
                <input
                  type="text"
                  value={couponCode}
                  onChange={(event) => {
                    setCouponCode(event.target.value.toUpperCase());
                    setCouponState('idle');
                    setCouponData(null);
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && handleApplyCoupon()}
                  placeholder="EX: PROMO100"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={couponState === 'loading' || !couponCode.trim()}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-40 
                   transition-colors px-1 py-0.5 whitespace-nowrap"
                >
                  {couponState === 'loading' ? 'Verificando...' : 'Aplicar'}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 
                    bg-emerald-500/10 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" 
                       strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-emerald-400">{couponCode}</p>
                    <p className="text-xs text-zinc-400">
                      {couponData?.finalAmount === 0
                        ? 'Ativação gratuita aplicada'
                        : `Desconto de R$ ${couponData?.discount.toFixed(2).replace('.', ',')}`
                      }
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClearCoupon}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-2"
                >
                  Remover
                </button>
              </div>
            )}

            {couponState === 'invalid' && (
              <p className="text-xs text-red-400 mt-1.5 ml-1">Cupom inválido ou expirado.</p>
            )}
          </div>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => startCheckout('pix')}
              disabled={Boolean(processingMethod)}
              className="btn-primary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {processingMethod === 'pix' ? <Loader2 className="animate-spin" size={18} /> : <QrCode size={18} />}
              {isFreeActivation ? 'Ativar gratuitamente' : 'Pagar com Pix'}
            </button>

            <button
              type="button"
              onClick={() => startCheckout('card')}
              disabled={Boolean(processingMethod)}
              className="btn-secondary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {processingMethod === 'card' ? <Loader2 className="animate-spin" size={18} /> : <CreditCard size={18} />}
              Assinar com Cartão
            </button>
          </div>

          {pixCheckout && (
            <div className="mt-6 rounded-xl border border-cyan-300/30 bg-cyan-500/5 p-4">
              <p className="text-sm font-semibold text-cyan-100">Aguardando confirmação do pagamento</p>

              {appliedCouponCode && hasDiscount && (
                <p className="mt-2 text-xs text-cyan-100">
                  Cupom aplicado: <span className="font-semibold">{appliedCouponCode}</span> - desconto de {formatCurrency(appliedDiscount)}
                </p>
              )}

              {pixQrCodeSource && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pixQrCodeSource}
                  alt="QR Code Pix"
                  className="mx-auto mt-4 h-48 w-48 rounded-lg bg-white p-2"
                />
              )}

              {pixCheckout.pixCopyPaste && (
                <button
                  type="button"
                  onClick={copyPixPayload}
                  className="mt-4 w-full rounded-lg border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10"
                >
                  Copiar código Pix
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={checkPayment}
            disabled={checkingPayment}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {checkingPayment ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Já paguei, verificar pagamento
          </button>
        </div>
      </section>
    </main>
  );
}

export default function PagamentoPage() {
  return (
    <Suspense fallback={<div>Carregando pagamento...</div>}>
      <PagamentoContent />
    </Suspense>
  );
}
