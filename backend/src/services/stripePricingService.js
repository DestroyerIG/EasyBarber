import {
  getStripePriceIds,
  getStripeOneTimePriceIds,
  assertStripeRecurringPriceCatalogConfigured,
  assertStripeOneTimePriceCatalogConfigured,
} from '../config/stripe.js';
import { AppError } from '../utils/errors.js';

const VALID_PLANS = new Set(['basico', 'profissional', 'premium']);
const VALID_PAYMENT_METHODS = new Set(['card', 'pix', 'boleto']);

const normalizePlan = (plan) => {
  if (typeof plan !== 'string') return null;
  const normalized = plan.trim().toLowerCase();
  return VALID_PLANS.has(normalized) ? normalized : null;
};

const normalizePaymentMethod = (paymentMethod) => {
  if (typeof paymentMethod !== 'string') return null;
  const normalized = paymentMethod.trim().toLowerCase();
  return VALID_PAYMENT_METHODS.has(normalized) ? normalized : null;
};

const getRecurringPriceIdByPlan = (plan) => {
  assertStripeRecurringPriceCatalogConfigured();

  const recurring = getStripePriceIds();
  const priceId = recurring[plan] || null;

  if (!priceId) {
    throw new AppError(
      `Price ID recorrente não configurado para o plano: ${plan}`,
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  return priceId;
};

const getOneTimePriceIdByPlan = (plan) => {
  assertStripeOneTimePriceCatalogConfigured();

  const oneTime = getStripeOneTimePriceIds();
  const priceId = oneTime[plan] || null;

  if (!priceId) {
    throw new AppError(
      `Price ID avulso não configurado para o plano: ${plan}`,
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  return priceId;
};

const resolvePlanByPriceIdFromCatalog = (priceId, catalog) => {
  if (!priceId || !catalog) {
    return null;
  }

  for (const [plan, mappedPriceId] of Object.entries(catalog.recurring || {})) {
    if (mappedPriceId === priceId) {
      return { plan, flowType: 'recurring' };
    }
  }

  for (const [plan, mappedPriceId] of Object.entries(catalog.oneTime || {})) {
    if (mappedPriceId === priceId) {
      return { plan, flowType: 'one_time' };
    }
  }

  return null;
};

export const stripePricingService = {
  normalizePlan,
  normalizePaymentMethod,

  resolveCheckoutPricing({ plan, paymentMethod }) {
    const normalizedPlan = normalizePlan(plan);
    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

    if (!normalizedPlan) {
      throw new AppError('Plano inválido para checkout Stripe', 400, 'INVALID_PLAN');
    }

    if (!normalizedPaymentMethod) {
      throw new AppError('Método de pagamento inválido para checkout Stripe', 400, 'INVALID_PAYMENT_METHOD');
    }

    // Fluxo atual do seu projeto:
    // card = assinatura recorrente
    // pix = Asaas
    // boleto = caso ainda use Stripe avulso
    if (normalizedPaymentMethod === 'card') {
      return {
        plan: normalizedPlan,
        paymentMethod: 'card',
        mode: 'subscription',
        flowType: 'recurring',
        priceId: getRecurringPriceIdByPlan(normalizedPlan),
      };
    }

    if (normalizedPaymentMethod === 'boleto') {
      return {
        plan: normalizedPlan,
        paymentMethod: 'boleto',
        mode: 'payment',
        flowType: 'one_time',
        priceId: getOneTimePriceIdByPlan(normalizedPlan),
      };
    }

    throw new AppError(
      'Método de pagamento não suportado no Stripe para este fluxo',
      400,
      'INVALID_PAYMENT_METHOD'
    );
  },

  resolvePlanByPriceId(priceId, priceCatalog) {
    return resolvePlanByPriceIdFromCatalog(priceId, priceCatalog);
  },
};