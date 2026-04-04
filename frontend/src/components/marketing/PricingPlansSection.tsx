'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { billingApi } from '@/lib/billing';
import { SAAS_PLANS, type PlanId } from '@/lib/plans';
import { getApiErrorMessage } from '@/utils/handleApiError';

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
  subtitle = 'Escolha um plano e evolua seu negócio com previsibilidade comercial e operação organizada.',
  currentPlan,
  subscriptionStatus,
  showHeader = true,
  className,
}: PricingPlansSectionProps) {
  const [processingPlan, setProcessingPlan] = useState<PlanId | null>(null);
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const isCurrentPlan = (planId: PlanId) => {
    return currentPlan === planId && (subscriptionStatus === 'active' || subscriptionStatus === 'trialing');
  };

  const handlePlanSelect = async (planId: PlanId) => {
    if (!user) {
      router.push(`/cadastro?plan=${planId}`);
      return;
    }

    if (isCurrentPlan(planId)) {
      showToast('Este já é o seu plano ativo.', 'info');
      return;
    }

    setProcessingPlan(planId);
    try {
      const session = await billingApi.createCheckoutSession(planId);
      window.location.assign(session.checkoutUrl);
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
                  R$ {plan.price}
                  <span className="text-sm font-medium text-gray-400">/mês</span>
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
