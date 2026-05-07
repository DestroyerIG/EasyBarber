import {
  getRequiredPlanForFeature,
  hasFeature,
  normalizePlan,
  normalizeSubscriptionStatus,
  PLAN_LEVELS,
  PLAN_NAMES,
  STATUS_FEATURE_ALLOWLIST,
} from '../config/planPermissions.js';
import type { PlanId, SubscriptionStatus } from '../types/domain.js';

const BILLING_ACTION_STATUSES = new Set<string>(['pending', 'past_due', 'unpaid', 'incomplete', 'canceled']);

const STATUS_RESTRICTED_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  pending: 'Pagamento pendente. Assim que a cobrança for confirmada, a funcionalidade será liberada.',
  past_due: 'Sua assinatura está com pagamento pendente. Regularize para retomar esta funcionalidade.',
  unpaid: 'Sua assinatura está inadimplente. Regularize o pagamento para retomar esta funcionalidade.',
  incomplete: 'Finalize sua assinatura para liberar esta funcionalidade.',
  canceled: 'Sua assinatura foi cancelada. Reative um plano para usar esta funcionalidade.',
});

interface FeatureAccessDecision {
  feature: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  allowed: boolean;
  reason: string;
  requiredPlan: PlanId | null;
  message: string;
  upgradeRequired: boolean;
  billingActionRequired: boolean;
}

interface BuildDecisionParams {
  feature: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  allowed: boolean;
  reason: string;
  requiredPlan?: PlanId | null;
  message: string;
  upgradeRequired?: boolean;
  billingActionRequired?: boolean;
}

const buildDecision = ({
  feature,
  plan,
  subscriptionStatus,
  allowed,
  reason,
  requiredPlan = null,
  message,
  upgradeRequired = false,
  billingActionRequired = false,
}: BuildDecisionParams): FeatureAccessDecision => ({
  feature,
  plan,
  subscriptionStatus,
  allowed,
  reason,
  requiredPlan,
  message,
  upgradeRequired,
  billingActionRequired,
});

interface EvaluateFeatureAccessParams {
  feature: string;
  plan: unknown;
  subscriptionStatus: unknown;
}

export const evaluateFeatureAccess = ({ feature, plan, subscriptionStatus }: EvaluateFeatureAccessParams): FeatureAccessDecision => {
  const normalizedPlan = normalizePlan(plan);
  const normalizedStatus = normalizeSubscriptionStatus(subscriptionStatus);

  if (!hasFeature(feature)) {
    return buildDecision({
      feature,
      plan: normalizedPlan,
      subscriptionStatus: normalizedStatus,
      allowed: false,
      reason: 'unknown_feature',
      message: 'Funcionalidade inválida para controle de acesso.',
    });
  }

  const requiredPlan = getRequiredPlanForFeature(feature);
  const statusAllowlist = STATUS_FEATURE_ALLOWLIST[normalizedStatus];

  if (statusAllowlist instanceof Set && !statusAllowlist.has(feature as never)) {
    return buildDecision({
      feature,
      plan: normalizedPlan,
      subscriptionStatus: normalizedStatus,
      allowed: false,
      reason: 'subscription_status_restricted',
      requiredPlan,
      message: STATUS_RESTRICTED_MESSAGES[normalizedStatus] || 'Sua assinatura precisa ser regularizada para acessar esta funcionalidade.',
      billingActionRequired: BILLING_ACTION_STATUSES.has(normalizedStatus),
    });
  }

  const userPlanLevel = PLAN_LEVELS[normalizedPlan] || 0;
  const requiredPlanLevel = (requiredPlan ? PLAN_LEVELS[requiredPlan] : 0) || 0;

  if (userPlanLevel < requiredPlanLevel) {
    return buildDecision({
      feature,
      plan: normalizedPlan,
      subscriptionStatus: normalizedStatus,
      allowed: false,
      reason: 'plan_upgrade_required',
      requiredPlan,
      message: `Esta funcionalidade requer o plano ${requiredPlan ? (PLAN_NAMES[requiredPlan] || requiredPlan) : ''} ou superior.`,
      upgradeRequired: true,
    });
  }

  return buildDecision({
    feature,
    plan: normalizedPlan,
    subscriptionStatus: normalizedStatus,
    allowed: true,
    reason: 'ok',
    requiredPlan,
    message: 'Acesso liberado.',
  });
};
