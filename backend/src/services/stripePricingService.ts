import {
  getStripePriceIds,
  getStripeOneTimePriceIds,
  assertStripeRecurringPriceCatalogConfigured,
  assertStripeOneTimePriceCatalogConfigured,
} from '../config/stripe.js';
import { AppError } from '../utils/errors.js';

type ValidPlan = 'basico' | 'profissional' | 'premium';
type ValidPaymentMethod = 'card' | 'pix' | 'boleto';

const VALID_PLANS = new Set<string>(['basico', 'profissional', 'premium']);
const VALID_PAYMENT_METHODS = new Set<string>(['card', 'pix', 'boleto']);

const normalizePlan = (plan: unknown): ValidPlan | null => {
  if (typeof plan !== 'string') return null;
  const normalized = plan.trim().toLowerCase();
  return VALID_PLANS.has(normalized) ? (normalized as ValidPlan) : null;
};

const normalizePaymentMethod = (paymentMethod: unknown): ValidPaymentMethod | null => {
  if (typeof paymentMethod !== 'string') return null;
  const normalized = paymentMethod.trim().toLowerCase();
  return VALID_PAYMENT_METHODS.has(normalized) ? (normalized as ValidPaymentMethod) : null;
};

const getRecurringPriceIdByPlan = (plan: ValidPlan): string => {
  assertStripeRecurringPriceCatalogConfigured();

  const recurring = getStripePriceIds();
  const priceId = recurring[plan] ?? null;

  if (!priceId) {
    throw new AppError(
      `Price ID recorrente não configurado para o plano: ${plan}`,
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  return priceId;
};

const getOneTimePriceIdByPlan = (plan: ValidPlan): string => {
  assertStripeOneTimePriceCatalogConfigured();

  const oneTime = getStripeOneTimePriceIds();
  const priceId = oneTime[plan] ?? null;

  if (!priceId) {
    throw new AppError(
      `Price ID avulso não configurado para o plano: ${plan}`,
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  return priceId;
};

interface PriceCatalog {
  recurring?: Record<string, string | null>;
  oneTime?: Record<string, string | null>;
}

interface PlanResolution {
  plan: string;
  flowType: 'recurring' | 'one_time';
}

const resolvePlanByPriceIdFromCatalog = (priceId: string | null | undefined, catalog: PriceCatalog | null | undefined): PlanResolution | null => {
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

interface CheckoutPricingParams {
  plan: unknown;
  paymentMethod: unknown;
}

interface CheckoutPricingResult {
  plan: ValidPlan;
  paymentMethod: ValidPaymentMethod;
  mode: 'subscription' | 'payment';
  flowType: 'recurring' | 'one_time';
  priceId: string;
}

export const stripePricingService = {
  normalizePlan,
  normalizePaymentMethod,

  resolveCheckoutPricing({ plan, paymentMethod }: CheckoutPricingParams): CheckoutPricingResult {
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

  resolvePlanByPriceId(priceId: string | null | undefined, priceCatalog: PriceCatalog | null | undefined): PlanResolution | null {
    return resolvePlanByPriceIdFromCatalog(priceId, priceCatalog);
  },
};
