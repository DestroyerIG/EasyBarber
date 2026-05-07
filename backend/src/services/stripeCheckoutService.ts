import type Stripe from 'stripe';
import { getFrontendBaseUrl } from '../config/stripe.js';

export const RECURRING_TRIAL_DAYS = 7;
export const ONE_TIME_ACCESS_DAYS = 30;

type PaymentMethodType = 'card' | 'boleto';

const ONE_TIME_PAYMENT_METHOD_TYPES: Readonly<Record<string, PaymentMethodType[]>> = Object.freeze({
  boleto: ['boleto'],
});

interface ResolvePaymentMethodTypesParams {
  mode: string;
  paymentMethod: string;
}

const resolvePaymentMethodTypes = ({ mode, paymentMethod }: ResolvePaymentMethodTypesParams): PaymentMethodType[] | null => {
  if (mode === 'subscription') {
    return ['card'];
  }

  return ONE_TIME_PAYMENT_METHOD_TYPES[paymentMethod] ?? null;
};

interface BuildCheckoutMetadataParams {
  barbershopId: string | number;
  plan: string;
  paymentMethod: string;
  flowType: string;
}

interface CheckoutMetadata {
  [key: string]: string;
  barbershopId: string;
  plan: string;
  paymentMethod: string;
  flowType: string;
}

const buildCheckoutMetadata = ({ barbershopId, plan, paymentMethod, flowType }: BuildCheckoutMetadataParams): CheckoutMetadata => {
  return {
    barbershopId: String(barbershopId),
    plan: String(plan),
    paymentMethod: String(paymentMethod),
    flowType: String(flowType),
  };
};

interface BuildCheckoutSessionPayloadParams {
  customerId: string;
  barbershopId: string | number;
  plan: string;
  paymentMethod: string;
  mode: string;
  flowType: string;
  priceId: string | null | undefined;
  applyTrial?: boolean;
}

interface CheckoutSessionPayload {
  mode: string;
  customer: string;
  allow_promotion_codes: boolean;
  line_items: Array<{ price: string; quantity: number }>;
  success_url: string;
  cancel_url: string;
  metadata: CheckoutMetadata;
  locale: Stripe.Checkout.SessionCreateParams.Locale;
  payment_method_types?: PaymentMethodType[];
  subscription_data?: {
    metadata: CheckoutMetadata;
    trial_period_days?: number;
  };
}

interface OneTimePeriodDates {
  periodStart: Date;
  periodEnd: Date;
}

export const stripeCheckoutService = {
  buildCheckoutSessionPayload({
    customerId,
    barbershopId,
    plan,
    paymentMethod,
    mode,
    flowType,
    priceId,
    applyTrial = false,
  }: BuildCheckoutSessionPayloadParams): CheckoutSessionPayload {
    const frontendBaseUrl = getFrontendBaseUrl();

    if (!frontendBaseUrl) {
      throw new Error('FRONTEND_URL não configurada');
    }

    if (!priceId) {
      throw new Error(`Price ID inválido para o checkout Stripe (${plan}/${paymentMethod})`);
    }

    const metadata = buildCheckoutMetadata({
      barbershopId,
      plan,
      paymentMethod,
      flowType,
    });

    const payload: CheckoutSessionPayload = {
      mode,
      customer: customerId,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendBaseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendBaseUrl}/dashboard?billing=canceled`,
      metadata,
      locale: 'pt-BR',
    };

    const paymentMethodTypes = resolvePaymentMethodTypes({ mode, paymentMethod });
    if (paymentMethodTypes) {
      payload.payment_method_types = paymentMethodTypes;
    }

    if (mode === 'subscription') {
      payload.subscription_data = {
        metadata,
      };

      if (applyTrial) {
        payload.subscription_data.trial_period_days = RECURRING_TRIAL_DAYS;
      }
    }

    return payload;
  },

  resolveOneTimePeriodDates(referenceDate: Date = new Date()): OneTimePeriodDates {
    const periodStart = new Date(referenceDate);
    const periodEnd = new Date(referenceDate);

    periodEnd.setUTCDate(periodEnd.getUTCDate() + ONE_TIME_ACCESS_DAYS);

    return {
      periodStart,
      periodEnd,
    };
  },
};
