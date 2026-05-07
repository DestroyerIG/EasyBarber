const INTERNAL_STATUSES = Object.freeze([
  'trialing',
  'pending',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
] as const);

export type InternalSubscriptionStatus = (typeof INTERNAL_STATUSES)[number];

export const INTERNAL_SUBSCRIPTION_STATUSES: readonly InternalSubscriptionStatus[] = INTERNAL_STATUSES;

const normalize = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
};

export const normalizeInternalSubscriptionStatus = (value: unknown): InternalSubscriptionStatus => {
  const normalized = normalize(value);

  if ((INTERNAL_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as InternalSubscriptionStatus;
  }

  return 'incomplete';
};

export const mapStripeStatusToInternalStatus = (externalStatus: unknown): InternalSubscriptionStatus => {
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

const ASAAS_STATUS_MAP: Readonly<Record<string, InternalSubscriptionStatus>> = Object.freeze({
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

export const mapAsaasStatusToInternalStatus = (externalStatus: unknown): InternalSubscriptionStatus => {
  if (typeof externalStatus !== 'string') {
    return 'incomplete';
  }

  const normalized = externalStatus.trim().toUpperCase();
  return ASAAS_STATUS_MAP[normalized] ?? 'incomplete';
};

export type BillingProvider = 'stripe' | 'asaas' | 'coupon';

export const resolveBillingProviderFromContext = (context: Record<string, unknown> = {}): BillingProvider | null => {
  const explicit = normalize(context.provider);
  if (explicit === 'stripe' || explicit === 'asaas' || explicit === 'coupon') {
    return explicit as BillingProvider;
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
