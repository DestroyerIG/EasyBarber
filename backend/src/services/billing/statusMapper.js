const INTERNAL_STATUSES = Object.freeze([
  'trialing',
  'pending',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
]);

const normalize = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
};

export const normalizeInternalSubscriptionStatus = (value) => {
  const normalized = normalize(value);

  if (INTERNAL_STATUSES.includes(normalized)) {
    return normalized;
  }

  return 'incomplete';
};

export const mapStripeStatusToInternalStatus = (externalStatus) => {
  const normalized = normalize(externalStatus);

  if (normalized === 'active') {
    return 'active';
  }

  if (normalized === 'trialing') {
    return 'trialing';
  }

  if (normalized === 'past_due') {
    return 'past_due';
  }

  if (normalized === 'unpaid') {
    return 'unpaid';
  }

  if (normalized === 'canceled') {
    return 'canceled';
  }

  if (normalized === 'paused') {
    return 'past_due';
  }

  return 'incomplete';
};

const ASAAS_STATUS_MAP = Object.freeze({
  PENDING: 'pending',
  AWAITING_PAYMENT: 'pending',
  RECEIVED: 'active',
  CONFIRMED: 'active',
  RECEIVED_IN_CASH: 'active',
  OVERDUE: 'past_due',
  CHARGEBACK_REQUESTED: 'canceled',
  CHARGEBACK_DISPUTE: 'canceled',
  CHARGEBACK_REVERSED: 'canceled',
  CHARGEBACK: 'canceled',
  REFUNDED: 'canceled',
  REFUND_REQUESTED: 'canceled',
  DELETED: 'canceled',
  CANCELED: 'canceled',
});

export const mapAsaasStatusToInternalStatus = (externalStatus) => {
  if (typeof externalStatus !== 'string') {
    return 'incomplete';
  }

  const normalized = externalStatus.trim().toUpperCase();
  return ASAAS_STATUS_MAP[normalized] || 'incomplete';
};

export const resolveBillingProviderFromContext = (context = {}) => {
  const explicit = normalize(context.provider);
  if (explicit === 'stripe' || explicit === 'asaas' || explicit === 'coupon') {
    return explicit;
  }

  if (
    context.provider_customer_id ||
    context.provider_subscription_id ||
    context.provider_payment_id
  ) {
    const method = normalize(context.payment_method);
    if (method === 'pix') {
      return 'asaas';
    }
  }

  if (context.stripe_customer_id || context.stripe_subscription_id) {
    return 'stripe';
  }

  const paymentMethod = normalize(context.payment_method);
  if (paymentMethod === 'coupon') {
    return 'coupon';
  }
  if (paymentMethod === 'pix') {
    return 'asaas';
  }

  if (paymentMethod === 'card') {
    return 'stripe';
  }

  return null;
};

export const INTERNAL_SUBSCRIPTION_STATUSES = INTERNAL_STATUSES;
