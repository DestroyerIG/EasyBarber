import {
  getRequiredPlanForFeature,
  hasFeature,
  normalizePlan,
  normalizeSubscriptionStatus,
  PLAN_LEVELS,
  PLAN_NAMES,
  STATUS_FEATURE_ALLOWLIST,
} from '../config/planPermissions.js';

const BILLING_ACTION_STATUSES = new Set(['pending', 'past_due', 'unpaid', 'incomplete', 'canceled']);

const STATUS_RESTRICTED_MESSAGES = Object.freeze({
  pending: 'Pagamento pendente. Assim que a cobrança for confirmada, a funcionalidade será liberada.',
  past_due: 'Sua assinatura está com pagamento pendente. Regularize para retomar esta funcionalidade.',
  unpaid: 'Sua assinatura está inadimplente. Regularize o pagamento para retomar esta funcionalidade.',
  incomplete: 'Finalize sua assinatura para liberar esta funcionalidade.',
  canceled: 'Sua assinatura foi cancelada. Reative um plano para usar esta funcionalidade.',
});

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
}) => ({
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

export const evaluateFeatureAccess = ({ feature, plan, subscriptionStatus }) => {
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

  if (statusAllowlist instanceof Set && !statusAllowlist.has(feature)) {
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
  const requiredPlanLevel = PLAN_LEVELS[requiredPlan] || 0;

  if (userPlanLevel < requiredPlanLevel) {
    return buildDecision({
      feature,
      plan: normalizedPlan,
      subscriptionStatus: normalizedStatus,
      allowed: false,
      reason: 'plan_upgrade_required',
      requiredPlan,
      message: `Esta funcionalidade requer o plano ${PLAN_NAMES[requiredPlan] || requiredPlan} ou superior.`,
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