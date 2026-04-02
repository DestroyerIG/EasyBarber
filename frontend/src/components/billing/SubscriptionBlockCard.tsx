'use client';

import { AlertTriangle, CreditCard, Lock, TrendingUp } from 'lucide-react';
import { PLAN_MAP } from '@/lib/plans';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';

interface SubscriptionBlockCardProps {
  access: FeatureAccessDecision;
  title?: string;
  onUpgrade?: () => void;
  onManageBilling?: () => void;
  className?: string;
}

export const SubscriptionBlockCard = ({
  access,
  title,
  onUpgrade,
  onManageBilling,
  className,
}: SubscriptionBlockCardProps) => {
  const requiredPlanName = access.requiredPlan ? PLAN_MAP[access.requiredPlan].name : null;

  return (
    <div className={`rounded-2xl border border-amber-400/30 bg-amber-500/5 p-6 ${className || ''}`.trim()}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-500/20 p-2 text-amber-300">
          <Lock size={16} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white">{title || 'Funcionalidade bloqueada'}</h3>
          <p className="mt-2 text-sm text-amber-100/90">{access.message}</p>

          {requiredPlanName && access.upgradeRequired && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-amber-200/90">
              Plano necessário: {requiredPlanName}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {access.billingActionRequired && onManageBilling && (
              <button
                type="button"
                onClick={onManageBilling}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-300"
              >
                <CreditCard size={16} />
                Regularizar assinatura
              </button>
            )}

            {access.upgradeRequired && onUpgrade && (
              <button
                type="button"
                onClick={onUpgrade}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300/50 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-300/10"
              >
                <TrendingUp size={16} />
                Ver planos
              </button>
            )}

            {!access.upgradeRequired && !access.billingActionRequired && (
              <span className="inline-flex items-center gap-2 rounded-lg border border-amber-300/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-100/90">
                <AlertTriangle size={14} />
                Acesso indisponível no momento
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};