import type { PlanId, SubscriptionStatus } from '../types/domain.js';

export const PLAN_LEVELS: Readonly<Record<PlanId, number>> = Object.freeze({
  basico: 1,
  profissional: 2,
  premium: 3,
});

export const PLAN_NAMES: Readonly<Record<PlanId, string>> = Object.freeze({
  basico: 'Básico',
  profissional: 'Profissional',
  premium: 'Premium',
});

export type Feature =
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

export const FEATURE_REQUIREMENTS: Readonly<Record<Feature, PlanId>> = Object.freeze({
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

const KNOWN_FEATURES = Object.freeze(Object.keys(FEATURE_REQUIREMENTS) as Feature[]);

const createFeatureSet = (features: Feature[]): Set<Feature> =>
  new Set(features.filter((f) => KNOWN_FEATURES.includes(f)));

const RESTRICTED_FEATURES = createFeatureSet(['billing', 'subscription_status']);

export const STATUS_FEATURE_ALLOWLIST: Readonly<Record<SubscriptionStatus, Set<Feature> | null>> =
  Object.freeze({
    active: null,
    trialing: null,
    pending: RESTRICTED_FEATURES,
    past_due: RESTRICTED_FEATURES,
    unpaid: RESTRICTED_FEATURES,
    incomplete: RESTRICTED_FEATURES,
    canceled: RESTRICTED_FEATURES,
  });

export const normalizePlan = (value: unknown): PlanId => {
  if (typeof value !== 'string') return 'basico';
  const normalized = value.toLowerCase();
  if (normalized in PLAN_LEVELS) return normalized as PlanId;
  return 'basico';
};

export const normalizeSubscriptionStatus = (value: unknown): SubscriptionStatus => {
  if (typeof value !== 'string') return 'incomplete';
  const normalized = value.toLowerCase();
  if (normalized in STATUS_FEATURE_ALLOWLIST) return normalized as SubscriptionStatus;
  return 'incomplete';
};

export const getRequiredPlanForFeature = (feature: string): PlanId | null =>
  (FEATURE_REQUIREMENTS as Record<string, PlanId>)[feature] ?? null;

export const hasFeature = (feature: string): boolean =>
  Boolean((FEATURE_REQUIREMENTS as Record<string, PlanId>)[feature]);
