import Stripe from 'stripe';
import { AppError } from '../utils/errors.js';

let stripeClient;

const RECURRING_PRICE_ENV_MAP = Object.freeze({
  basico: 'STRIPE_PRICE_ID_BASICO',
  profissional: 'STRIPE_PRICE_ID_PROFISSIONAL',
  premium: 'STRIPE_PRICE_ID_PREMIUM',
});

const ONE_TIME_PRICE_ENV_MAP = Object.freeze({
  basico: 'STRIPE_PRICE_ID_BASICO_ONE_TIME',
  profissional: 'STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME',
  premium: 'STRIPE_PRICE_ID_PREMIUM_ONE_TIME',
});

const resolvePriceIdsByMap = (envMap) => {
  return Object.entries(envMap).reduce((acc, [plan, envKey]) => {
    acc[plan] = process.env[envKey] || null;
    return acc;
  }, {});
};

const resolveMissingPriceEnvVarsByMap = (envMap) => {
  return Object.values(envMap).filter((envKey) => !process.env[envKey]);
};

export const getStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new AppError(
      'Billing Stripe não configurado no servidor',
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });
  }

  return stripeClient;
};

export const getStripePriceIds = () => resolvePriceIdsByMap(RECURRING_PRICE_ENV_MAP);

export const getStripeOneTimePriceIds = () => resolvePriceIdsByMap(ONE_TIME_PRICE_ENV_MAP);

export const getStripePriceCatalog = () => ({
  recurring: getStripePriceIds(),
  oneTime: getStripeOneTimePriceIds(),
});

export const getMissingStripeRecurringPriceEnvVars = () => {
  return resolveMissingPriceEnvVarsByMap(RECURRING_PRICE_ENV_MAP);
};

export const getMissingStripeOneTimePriceEnvVars = () => {
  return resolveMissingPriceEnvVarsByMap(ONE_TIME_PRICE_ENV_MAP);
};

export const assertStripeRecurringPriceCatalogConfigured = () => {
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

export const assertStripeOneTimePriceCatalogConfigured = () => {
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

export const getFrontendBaseUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';