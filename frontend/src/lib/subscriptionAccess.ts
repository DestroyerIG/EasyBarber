import type { SubscriptionStatus } from '@/lib/billing';
import { PLAN_MAP, type PlanId } from '@/lib/plans';

export type FeatureKey =
  | 'dashboard'
  | 'appointments'
  | 'clients'
  | 'services'
  | 'finance'
  | 'reports'
  | 'exports'
  | 'whatsapp_automation'
  | 'advanced_admin'
  | 'billing'
  | 'subscription_status';

export type AccessReason =
  | 'ok'
  | 'unknown_feature'
  | 'plan_upgrade_required'
  | 'subscription_status_restricted';

export interface FeatureAccessDecision {
  feature: FeatureKey;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  allowed: boolean;
  reason: AccessReason;
  requiredPlan: PlanId | null;
  message: string;
  upgradeRequired: boolean;
  billingActionRequired: boolean;
}

const PLAN_LEVELS: Record<PlanId, number> = {
  basico: 1,
  profissional: 2,
  premium: 3,
};

const FEATURE_REQUIREMENTS: Record<FeatureKey, PlanId> = {
  dashboard: 'basico',
  appointments: 'basico',
  clients: 'basico',
  services: 'basico',
  finance: 'basico',
  reports: 'profissional',
  exports: 'profissional',
  whatsapp_automation: 'profissional',
  advanced_admin: 'basico',
  billing: 'basico',
  subscription_status: 'basico',
};

const STATUS_ALLOWLIST: Record<SubscriptionStatus, Set<FeatureKey> | null> = {
  active: null,
  trialing: null,
  pending: new Set([
    'billing',
    'subscription_status',
  ]),
  past_due: new Set([
    'billing',
    'subscription_status',
  ]),
  unpaid: new Set([
    'billing',
    'subscription_status',
  ]),
  incomplete: new Set([
    'billing',
    'subscription_status',
  ]),
  canceled: new Set([
    'billing',
    'subscription_status',
  ]),
};

const BILLING_ACTION_STATUSES = new Set<SubscriptionStatus>(['pending', 'past_due', 'unpaid', 'incomplete', 'canceled']);

const STATUS_MESSAGES: Record<SubscriptionStatus, string> = {
  active: 'Acesso liberado.',
  trialing: 'Acesso liberado durante o período de teste.',
  pending: 'Pagamento pendente. Assim que a cobrança for confirmada, a funcionalidade será liberada.',
  past_due: 'Sua assinatura está com pagamento pendente. Regularize para retomar esta funcionalidade.',
  unpaid: 'Sua assinatura está inadimplente. Regularize o pagamento para retomar esta funcionalidade.',
  incomplete: 'Finalize sua assinatura para liberar esta funcionalidade.',
  canceled: 'Sua assinatura foi cancelada. Reative um plano para usar esta funcionalidade.',
};

const normalizePlan = (value: string | null | undefined): PlanId => {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'profissional' || normalized === 'premium') {
    return normalized;
  }
  return 'basico';
};

const normalizeStatus = (value: string | null | undefined): SubscriptionStatus => {
  const normalized = (value || '').toLowerCase();
  if (
    normalized === 'active' ||
    normalized === 'trialing' ||
    normalized === 'pending' ||
    normalized === 'past_due' ||
    normalized === 'unpaid' ||
    normalized === 'incomplete' ||
    normalized === 'canceled'
  ) {
    return normalized;
  }
  return 'incomplete';
};

export const evaluateFeatureAccess = ({
  feature,
  plan,
  subscriptionStatus,
}: {
  feature: FeatureKey;
  plan: string | null | undefined;
  subscriptionStatus: string | null | undefined;
}): FeatureAccessDecision => {
  const normalizedPlan = normalizePlan(plan);
  const normalizedStatus = normalizeStatus(subscriptionStatus);
  const requiredPlan = FEATURE_REQUIREMENTS[feature];

  if (!requiredPlan) {
    return {
      feature,
      plan: normalizedPlan,
      subscriptionStatus: normalizedStatus,
      allowed: false,
      reason: 'unknown_feature',
      requiredPlan: null,
      message: 'Funcionalidade inválida para controle de acesso.',
      upgradeRequired: false,
      billingActionRequired: false,
    };
  }

  const statusAllowlist = STATUS_ALLOWLIST[normalizedStatus];
  if (statusAllowlist instanceof Set && !statusAllowlist.has(feature)) {
    return {
      feature,
      plan: normalizedPlan,
      subscriptionStatus: normalizedStatus,
      allowed: false,
      reason: 'subscription_status_restricted',
      requiredPlan,
      message: STATUS_MESSAGES[normalizedStatus],
      upgradeRequired: false,
      billingActionRequired: BILLING_ACTION_STATUSES.has(normalizedStatus),
    };
  }

  if (PLAN_LEVELS[normalizedPlan] < PLAN_LEVELS[requiredPlan]) {
    return {
      feature,
      plan: normalizedPlan,
      subscriptionStatus: normalizedStatus,
      allowed: false,
      reason: 'plan_upgrade_required',
      requiredPlan,
      message: `Esta funcionalidade requer o plano ${PLAN_MAP[requiredPlan].name} ou superior.`,
      upgradeRequired: true,
      billingActionRequired: false,
    };
  }

  return {
    feature,
    plan: normalizedPlan,
    subscriptionStatus: normalizedStatus,
    allowed: true,
    reason: 'ok',
    requiredPlan,
    message: STATUS_MESSAGES[normalizedStatus],
    upgradeRequired: false,
    billingActionRequired: false,
  };
};
