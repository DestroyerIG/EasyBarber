import Stripe from 'stripe';
import { AppError } from '../utils/errors.js';

type PlanId = 'basico' | 'profissional' | 'premium';

const RECURRING_PRICE_ENV_MAP: Readonly<Record<PlanId, string>> = Object.freeze({
  basico: 'STRIPE_PRICE_ID_BASICO',
  profissional: 'STRIPE_PRICE_ID_PROFISSIONAL',
  premium: 'STRIPE_PRICE_ID_PREMIUM',
});

const ONE_TIME_PRICE_ENV_MAP: Readonly<Record<PlanId, string>> = Object.freeze({
  basico: 'STRIPE_PRICE_ID_BASICO_ONE_TIME',
  profissional: 'STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME',
  premium: 'STRIPE_PRICE_ID_PREMIUM_ONE_TIME',
});

let stripeClient: Stripe | undefined;

const resolvePriceIdsByMap = (
  envMap: Record<string, string>
): Record<string, string | null> =>
  Object.entries(envMap).reduce<Record<string, string | null>>((acc, [plan, envKey]) => {
    acc[plan] = process.env[envKey] ?? null;
    return acc;
  }, {});

const resolveMissingPriceEnvVarsByMap = (envMap: Record<string, string>): string[] =>
  Object.values(envMap).filter((envKey) => !process.env[envKey]);

export const getStripeClient = (): Stripe => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new AppError(
      'Billing Stripe não configurado no servidor',
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    });
  }

  return stripeClient;
};

export const getStripePriceIds = (): Record<string, string | null> =>
  resolvePriceIdsByMap(RECURRING_PRICE_ENV_MAP);

export const getStripeOneTimePriceIds = (): Record<string, string | null> =>
  resolvePriceIdsByMap(ONE_TIME_PRICE_ENV_MAP);

export const getStripePriceCatalog = () => ({
  recurring: getStripePriceIds(),
  oneTime: getStripeOneTimePriceIds(),
});

export const getMissingStripeRecurringPriceEnvVars = (): string[] =>
  resolveMissingPriceEnvVarsByMap(RECURRING_PRICE_ENV_MAP);

export const getMissingStripeOneTimePriceEnvVars = (): string[] =>
  resolveMissingPriceEnvVarsByMap(ONE_TIME_PRICE_ENV_MAP);

export const assertStripeRecurringPriceCatalogConfigured = (): void => {
  const missingEnvVars = getMissingStripeRecurringPriceEnvVars();
  if (missingEnvVars.length > 0) {
    const error = new AppError(
      'Price IDs Stripe recorrentes não configurados para todos os planos',
      503,
      'BILLING_NOT_CONFIGURED'
    );
    error.details = missingEnvVars;
    throw error;
  }
};

export const assertStripeOneTimePriceCatalogConfigured = (): void => {
  const missingEnvVars = getMissingStripeOneTimePriceEnvVars();
  if (missingEnvVars.length > 0) {
    const error = new AppError(
      'Price IDs Stripe avulsos não configurados para todos os planos',
      503,
      'BILLING_NOT_CONFIGURED'
    );
    error.details = missingEnvVars;
    throw error;
  }
};

export const getFrontendBaseUrl = (): string =>
  process.env.FRONTEND_URL ?? 'http://localhost:3000';
