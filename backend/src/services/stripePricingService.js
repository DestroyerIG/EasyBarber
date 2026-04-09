import { AppError } from '../utils/errors.js';
import {
  assertStripePriceCatalogConfigured,
  getStripePriceCatalog,
} from '../config/stripe.js';

export const PLAN_IDS = Object.freeze(['basico', 'profissional', 'premium']);
export const PAYMENT_METHOD_IDS = Object.freeze(['card', 'pix', 'boleto']);

const CHECKOUT_MODE_BY_PAYMENT_METHOD = Object.freeze({
  card: 'subscription',
  pix: 'payment',
  boleto: 'payment',
});

const FLOW_TYPE_BY_PAYMENT_METHOD = Object.freeze({
  card: 'recurring',
  pix: 'one_time',
  boleto: 'one_time',
});

const normalizePaymentMethod = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase();
  if (PAYMENT_METHOD_IDS.includes(normalized)) {
    return normalized;
  }

  return null;
};

const ensurePlan = (plan) => {
  if (!PLAN_IDS.includes(plan)) {
    throw new AppError('Plano inválido para checkout', 400, 'INVALID_PLAN');
  }
};

const ensurePaymentMethod = (paymentMethod) => {
  const normalized = normalizePaymentMethod(paymentMethod);

  if (!normalized) {
    throw new AppError('Método de pagamento inválido para checkout', 400, 'INVALID_PAYMENT_METHOD');
  }

  return normalized;
};

const findPlanInPriceMap = (priceId, map, flowType) => {
  const found = Object.entries(map).find(([, id]) => id === priceId);

  if (!found) {
    return null;
  }

  return {
    plan: found[0],
    flowType,
  };
};

export const stripePricingService = {
  resolveCheckoutPricing({ plan, paymentMethod }) {
    ensurePlan(plan);

    const normalizedPaymentMethod = ensurePaymentMethod(paymentMethod);
    const mode = CHECKOUT_MODE_BY_PAYMENT_METHOD[normalizedPaymentMethod];
    const flowType = FLOW_TYPE_BY_PAYMENT_METHOD[normalizedPaymentMethod];

    assertStripePriceCatalogConfigured();
    const priceCatalog = getStripePriceCatalog();
    const priceMap = mode === 'subscription' ? priceCatalog.recurring : priceCatalog.oneTime;
    const priceId = priceMap[plan];

    if (!priceId) {
      throw new AppError(
        `Price ID não configurado para o plano ${plan} no fluxo ${flowType}`,
        503,
        'BILLING_NOT_CONFIGURED'
      );
    }

    return {
      plan,
      paymentMethod: normalizedPaymentMethod,
      mode,
      flowType,
      priceId,
      priceCatalog,
    };
  },

  resolvePlanByPriceId(priceId, priceCatalog = null) {
    if (!priceId) {
      return null;
    }

    const catalog = priceCatalog || getStripePriceCatalog();
    const recurringMatch = findPlanInPriceMap(priceId, catalog.recurring, 'recurring');

    if (recurringMatch) {
      return recurringMatch;
    }

    return findPlanInPriceMap(priceId, catalog.oneTime, 'one_time');
  },

  normalizePaymentMethod(value) {
    return normalizePaymentMethod(value);
  },
};
