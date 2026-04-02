import Stripe from 'stripe';
import { AppError } from '../utils/errors.js';

let stripeClient;

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

export const getStripePriceIds = () => ({
  basico: process.env.STRIPE_PRICE_ID_BASICO,
  profissional: process.env.STRIPE_PRICE_ID_PROFISSIONAL,
  premium: process.env.STRIPE_PRICE_ID_PREMIUM,
});

export const getFrontendBaseUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';
