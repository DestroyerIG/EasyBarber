import { AppError, NotFoundError } from '../../../utils/errors.js';
import { getStripeClient } from '../../../config/stripe.js';
import { subscriptionService } from '../../subscriptionService.js';
import { subscriptionRepository } from '../../../repositories/subscriptionRepository.js';
import { mapStripeStatusToInternalStatus } from '../statusMapper.js';

const unixToDate = (value) => {
  if (!value || Number.isNaN(Number(value))) {
    return null;
  }

  return new Date(Number(value) * 1000);
};

const persistStripeSubscriptionState = async ({
  barbershopId,
  plan,
  subscription,
  paymentMethod = 'card',
}) => {
  const customerId = typeof subscription?.customer === 'string'
    ? subscription.customer
    : subscription?.customer?.id || null;

  return subscriptionRepository.updateSubscriptionState(barbershopId, {
    plan,
    stripeSubscriptionId: subscription?.id || null,
    stripePriceId: subscription?.items?.data?.[0]?.price?.id || null,
    stripePaymentMode: 'subscription',
    paymentMethod,
    subscriptionStatus: mapStripeStatusToInternalStatus(subscription?.status),
    currentPeriodStart: unixToDate(subscription?.current_period_start),
    currentPeriodEnd: unixToDate(subscription?.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    provider: 'stripe',
    providerCustomerId: customerId,
    providerSubscriptionId: subscription?.id || null,
    nextDueDate: unixToDate(subscription?.current_period_end),
    canceledAt: subscription?.canceled_at ? unixToDate(subscription.canceled_at) : null,
    metadata: {
      billingProvider: 'stripe',
      stripeStatus: subscription?.status || null,
    },
  });
};

export const stripeBillingProvider = {
  provider: 'stripe',

  async createCustomer() {
    throw new AppError(
      'Criação manual de customer Stripe não suportada neste fluxo',
      400,
      'OPERATION_NOT_SUPPORTED'
    );
  },

  async createSubscription({ barbershopId, plan, paymentMethod = 'card' }) {
    if (paymentMethod !== 'card') {
      throw new AppError(
        'Stripe neste fluxo suporta apenas cartão recorrente',
        400,
        'INVALID_PAYMENT_METHOD'
      );
    }

    const session = await subscriptionService.createCheckoutSession(barbershopId, plan, paymentMethod);

    await subscriptionRepository.updateSubscriptionState(barbershopId, {
      paymentMethod: 'card',
      stripePaymentMode: 'subscription',
      provider: 'stripe',
    });

    return {
      provider: 'stripe',
      ...session,
    };
  },

  async createPixCharge() {
    throw new AppError(
      'Cobrança Pix não suportada pelo provider Stripe neste fluxo híbrido',
      400,
      'OPERATION_NOT_SUPPORTED'
    );
  },

  async getPaymentStatus() {
    throw new AppError(
      'Consulta de status de pagamento avulso não suportada para Stripe neste fluxo',
      400,
      'OPERATION_NOT_SUPPORTED'
    );
  },

  async cancelSubscription({ barbershopId, context }) {
    if (!context?.stripe_subscription_id) {
      throw new NotFoundError('Assinatura Stripe');
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.update(context.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    const updated = await persistStripeSubscriptionState({
      barbershopId,
      plan: context.plan,
      subscription,
      paymentMethod: 'card',
    });

    return {
      provider: 'stripe',
      subscriptionId: subscription.id,
      subscriptionStatus: updated?.subscription_status || mapStripeStatusToInternalStatus(subscription.status),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: updated?.subscription_current_period_end || unixToDate(subscription.current_period_end),
    };
  },

  async reactivateSubscription({ barbershopId, context }) {
    if (!context?.stripe_subscription_id) {
      throw new NotFoundError('Assinatura Stripe');
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.update(context.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    const updated = await persistStripeSubscriptionState({
      barbershopId,
      plan: context.plan,
      subscription,
      paymentMethod: 'card',
    });

    return {
      provider: 'stripe',
      subscriptionId: subscription.id,
      subscriptionStatus: updated?.subscription_status || mapStripeStatusToInternalStatus(subscription.status),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: updated?.subscription_current_period_end || unixToDate(subscription.current_period_end),
    };
  },

  async handleWebhook(rawBody, signature) {
    return subscriptionService.handleWebhook(rawBody, signature);
  },

  mapExternalStatusToInternalStatus(externalStatus) {
    return mapStripeStatusToInternalStatus(externalStatus);
  },
};
