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

const resolveMissingPriceEnvVars = (envMap) => {
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
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
};

export const getStripePriceIds = () => resolvePriceIdsByMap(RECURRING_PRICE_ENV_MAP);

export const getStripeOneTimePriceIds = () => resolvePriceIdsByMap(ONE_TIME_PRICE_ENV_MAP);

export const getStripePriceCatalog = () => ({
  recurring: getStripePriceIds(),
  oneTime: getStripeOneTimePriceIds(),
});

export const getMissingStripePriceEnvVars = () => {
  return [
    ...resolveMissingPriceEnvVars(RECURRING_PRICE_ENV_MAP),
    ...resolveMissingPriceEnvVars(ONE_TIME_PRICE_ENV_MAP),
  ];
};

export const assertStripePriceCatalogConfigured = () => {
  const missingEnvVars = getMissingStripePriceEnvVars();

  if (missingEnvVars.length > 0) {
    const error = new AppError(
      'Price IDs Stripe não configurados para todos os planos e fluxos',
      503,
      'BILLING_NOT_CONFIGURED'
    );

    error.details = missingEnvVars;
    throw error;
  }
};

export const getFrontendBaseUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';
