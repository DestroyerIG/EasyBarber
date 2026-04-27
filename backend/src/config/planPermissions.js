export const PLAN_LEVELS = Object.freeze({
  basico: 1,
  profissional: 2,
  premium: 3,
});

export const PLAN_NAMES = Object.freeze({
  basico: 'Básico',
  profissional: 'Profissional',
  premium: 'Premium',
});

export const FEATURE_REQUIREMENTS = Object.freeze({
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
});

const KNOWN_FEATURES = Object.freeze(Object.keys(FEATURE_REQUIREMENTS));

const createFeatureSet = (features) => {
  return new Set(features.filter((feature) => KNOWN_FEATURES.includes(feature)));
};

export const STATUS_FEATURE_ALLOWLIST = Object.freeze({
  active: null,
  trialing: null,
  pending: createFeatureSet([
    'billing',
    'subscription_status',
  ]),
  past_due: createFeatureSet([
    'billing',
    'subscription_status',
  ]),
  unpaid: createFeatureSet([
    'billing',
    'subscription_status',
  ]),
  incomplete: createFeatureSet([
    'billing',
    'subscription_status',
  ]),
  canceled: createFeatureSet([
    'billing',
    'subscription_status',
  ]),
});

export const normalizePlan = (value) => {
  if (typeof value !== 'string') {
    return 'basico';
  }

  const normalized = value.toLowerCase();
  if (normalized in PLAN_LEVELS) {
    return normalized;
  }

  return 'basico';
};

export const normalizeSubscriptionStatus = (value) => {
  if (typeof value !== 'string') {
    return 'incomplete';
  }

  const normalized = value.toLowerCase();
  if (normalized in STATUS_FEATURE_ALLOWLIST) {
    return normalized;
  }

  return 'incomplete';
};

export const getRequiredPlanForFeature = (feature) => {
  return FEATURE_REQUIREMENTS[feature] || null;
};

export const hasFeature = (feature) => {
  return Boolean(FEATURE_REQUIREMENTS[feature]);
};
