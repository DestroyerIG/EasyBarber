import { getFrontendBaseUrl } from '../config/stripe.js';

export const RECURRING_TRIAL_DAYS = 7;
export const ONE_TIME_ACCESS_DAYS = 30;

const ONE_TIME_PAYMENT_METHOD_TYPES = Object.freeze({
  pix: ['pix'],
  boleto: ['boleto'],
});

const resolvePaymentMethodTypes = ({ mode, paymentMethod }) => {
  if (mode === 'subscription') {
    return ['card'];
  }

  return ONE_TIME_PAYMENT_METHOD_TYPES[paymentMethod] || null;
};

const buildCheckoutMetadata = ({ barbershopId, plan, paymentMethod, flowType }) => {
  return {
    barbershopId,
    plan,
    paymentMethod,
    flowType,
  };
};

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
  }) {
    const frontendBaseUrl = getFrontendBaseUrl();
    const metadata = buildCheckoutMetadata({
      barbershopId,
      plan,
      paymentMethod,
      flowType,
    });

    const payload = {
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

  resolveOneTimePeriodDates(referenceDate = new Date()) {
    const periodStart = new Date(referenceDate);
    const periodEnd = new Date(referenceDate);

    periodEnd.setUTCDate(periodEnd.getUTCDate() + ONE_TIME_ACCESS_DAYS);

    return {
      periodStart,
      periodEnd,
    };
  },
};
