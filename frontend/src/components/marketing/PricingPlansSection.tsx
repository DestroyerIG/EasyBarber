'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import {
  billingApi,
  type CheckoutPaymentMethod,
  type PixCheckoutSessionResponse,
} from '@/lib/billing';
import { SAAS_PLANS, type PlanId } from '@/lib/plans';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';

const PIX_STORAGE_KEY = 'easybarber:pixCheckout';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando pagamento',
  active: 'Pagamento confirmado',
  past_due: 'Cobrança vencida',
  unpaid: 'Cobrança inadimplente',
  canceled: 'Cobrança cancelada',
  incomplete: 'Cobrança incompleta',
  trialing: 'Período de teste',
};

const PAYMENT_METHOD_OPTIONS: Array<{
  id: CheckoutPaymentMethod;
  label: string;
  description: string;
}> = [
  {
    id: 'card',
    label: 'Cartão',
    description: 'Assinatura recorrente mensal',
  },
  {
    id: 'pix',
    label: 'Pix',
    description: 'Cobrança Pix no Asaas com QR Code',
  },
];

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
  subtitle = 'Na primeira assinatura, qualquer plano inclui 7 dias grátis para você testar com previsibilidade comercial e operação organizada.',
  currentPlan,
  subscriptionStatus,
  showHeader = true,
  className,
}: PricingPlansSectionProps) {
  const [processingPlan, setProcessingPlan] = useState<PlanId | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('card');
  const [pixCheckout, setPixCheckout] = useState<PixCheckoutSessionResponse | null>(null);
  const [pixStatusLoading, setPixStatusLoading] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const isRecurringFlow = paymentMethod === 'card';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const raw = window.sessionStorage.getItem(PIX_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PixCheckoutSessionResponse;
      if (parsed?.provider === 'asaas' && parsed?.paymentId) {
        setPixCheckout(parsed);
      }
    } catch {
      window.sessionStorage.removeItem(PIX_STORAGE_KEY);
    }
  }, []);

  const persistPixCheckout = (value: PixCheckoutSessionResponse | null) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!value) {
      window.sessionStorage.removeItem(PIX_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(PIX_STORAGE_KEY, JSON.stringify(value));
  };

  const copyPixPayload = async () => {
    if (!pixCheckout?.pixCopyPaste) {
      showToast('Payload Pix indisponível para cópia.', 'info');
      return;
    }

    try {
      await navigator.clipboard.writeText(pixCheckout.pixCopyPaste);
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
      persistPixCheckout(nextCheckout);

      if (updated.status === 'active') {
        showToast('Pagamento confirmado. Assinatura ativada.', 'success');
      } else {
        showToast(`Status atualizado: ${STATUS_LABEL[updated.status] || updated.status}.`, 'info');
      }
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Não foi possível atualizar o status do Pix.');
      showToast(message, 'error');
    } finally {
      setPixStatusLoading(false);
    }
  };

  const isCurrentPlan = (planId: PlanId) => {
    return currentPlan === planId && (subscriptionStatus === 'active' || subscriptionStatus === 'trialing');
  };

  const handlePlanSelect = async (planId: PlanId) => {
    if (!user) {
      router.push(`/cadastro?plan=${planId}&paymentMethod=${paymentMethod}`);
      return;
    }

    if (isCurrentPlan(planId)) {
      showToast('Este já é o seu plano ativo.', 'info');
      return;
    }

    setProcessingPlan(planId);
    try {
      const session = await billingApi.createCheckoutSession(planId, paymentMethod);

      if (session.provider === 'stripe') {
        window.location.assign(session.checkoutUrl);
        return;
      }

      setPixCheckout(session);
      persistPixCheckout(session);
      showToast('Cobrança Pix criada. Finalize o pagamento para ativar o plano.', 'success');
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Não foi possível iniciar o checkout no momento.');
      showToast(message, 'error');
    } finally {
      setProcessingPlan(null);
    }
  };

  return (
    <section id={sectionId} className={className}>
      {showHeader && (
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">Planos</p>
          <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 text-gray-400">{subtitle}</p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-3 text-left">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Forma de pagamento</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {PAYMENT_METHOD_OPTIONS.map((option) => {
                const selected = paymentMethod === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPaymentMethod(option.id)}
                    className={[
                      'rounded-xl border px-3 py-2 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-white'
                        : 'border-white/10 bg-black/20 text-gray-300 hover:border-white/30',
                    ].join(' ')}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {pixCheckout && (
        <div className="mb-8 rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                Pagamento Pix em andamento
              </p>
              <h4 className="mt-2 text-xl font-black text-white">
                {STATUS_LABEL[pixCheckout.status] || pixCheckout.status}
              </h4>
              <p className="mt-2 text-sm text-cyan-100/90">
                Escaneie o QR Code ou use o código copia e cola para concluir a cobrança.
              </p>
              {pixCheckout.expiresAt && (
                <p className="mt-2 text-xs text-cyan-100/70">
                  Expira em: {new Date(pixCheckout.expiresAt).toLocaleString('pt-BR')}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyPixPayload}
                  className="rounded-lg border border-cyan-300/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300/10"
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

            <div className="rounded-xl border border-cyan-300/30 bg-black/30 p-3">
              {pixCheckout.qrCode ? (
                <Image
                  src={pixCheckout.qrCode}
                  alt="QR Code Pix"
                  width={176}
                  height={176}
                  unoptimized
                  className="h-44 w-44 rounded-lg bg-white p-2"
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-cyan-300/40 text-xs text-cyan-100/80">
                  QR Code indisponível para esta cobrança.
                </div>
              )}
            </div>
          </div>

          {pixCheckout.pixCopyPaste && (
            <div className="mt-4 rounded-lg border border-cyan-300/20 bg-black/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/80">
                Copia e cola
              </p>
              <p className="break-all text-xs text-cyan-50/95">{pixCheckout.pixCopyPaste}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {SAAS_PLANS.map((plan) => {
          const recommended = plan.recommended;
          const current = isCurrentPlan(plan.id);
          const busy = processingPlan === plan.id;

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
                  <span className="text-sm font-medium text-gray-400">
                    {isRecurringFlow ? '/mês' : ' pagamento avulso'}
                  </span>
                </p>
                <p className="mt-2 inline-flex items-center rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium leading-snug text-emerald-200 sm:text-xs">
                  {isRecurringFlow
                    ? `Teste gratuito por ${plan.trialDays} dias com acesso completo.`
                    : 'Acesso liberado por 30 dias apos a confirmacao do pagamento.'}
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

              <button
                type="button"
                onClick={() => handlePlanSelect(plan.id)}
                disabled={busy || current}
                className={[
                  'mt-7 w-full rounded-xl px-4 py-3 text-sm font-bold transition-colors',
                  current
                    ? 'cursor-not-allowed bg-emerald-500/20 text-emerald-300'
                    : recommended
                    ? 'bg-primary text-black hover:bg-orange-500'
                    : 'bg-white text-black hover:bg-gray-200',
                ].join(' ')}
              >
                {busy ? 'Redirecionando...' : current ? 'Plano atual' : plan.ctaLabel}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
