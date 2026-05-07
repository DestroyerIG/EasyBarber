import Stripe from 'stripe';
import { AppError, NotFoundError } from '../../../utils/errors.js';
import { getStripeClient } from '../../../config/stripe.js';
import { subscriptionService } from '../../subscriptionService.js';
import { subscriptionRepository } from '../../../repositories/subscriptionRepository.js';
import { mapStripeStatusToInternalStatus, type InternalSubscriptionStatus } from '../statusMapper.js';

const unixToDate = (value: unknown): Date | null => {
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
}: {
  barbershopId: string;
  plan: string;
  subscription: Stripe.Subscription;
  paymentMethod?: string;
}): Promise<Record<string, unknown> | null> => {
  const customerId =
    typeof subscription?.customer === 'string'
      ? subscription.customer
      : (subscription?.customer as Stripe.Customer | Stripe.DeletedCustomer | null)?.id ?? null;

  return subscriptionRepository.updateSubscriptionState(barbershopId, {
    plan,
    stripeSubscriptionId: subscription?.id ?? null,
    stripePriceId: subscription?.items?.data?.[0]?.price?.id ?? null,
    stripePaymentMode: 'subscription',
    paymentMethod,
    subscriptionStatus: mapStripeStatusToInternalStatus(subscription?.status),
    currentPeriodStart: unixToDate((subscription as unknown as Record<string, unknown>)?.current_period_start),
    currentPeriodEnd: unixToDate((subscription as unknown as Record<string, unknown>)?.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    provider: 'stripe',
    providerCustomerId: customerId,
    providerSubscriptionId: subscription?.id ?? null,
    nextDueDate: unixToDate((subscription as unknown as Record<string, unknown>)?.current_period_end),
    canceledAt: subscription?.canceled_at ? unixToDate(subscription.canceled_at) : null,
    metadata: {
      billingProvider: 'stripe',
      stripeStatus: subscription?.status ?? null,
    },
  });
};

interface CancelReactivateParams {
  barbershopId: string;
  context: Record<string, unknown>;
}

interface SubscriptionResult {
  provider: 'stripe';
  subscriptionId: string;
  subscriptionStatus: InternalSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}

export const stripeBillingProvider = {
  provider: 'stripe' as const,

  async createCustomer(): Promise<never> {
    throw new AppError(
      'Criação manual de customer Stripe não suportada neste fluxo',
      400,
      'OPERATION_NOT_SUPPORTED',
    );
  },

  async createSubscription({
    barbershopId,
    plan,
    paymentMethod = 'card',
  }: {
    barbershopId: string;
    plan: string;
    paymentMethod?: string;
  }): Promise<Record<string, unknown>> {
    if (paymentMethod !== 'card') {
      throw new AppError(
        'Stripe neste fluxo suporta apenas cartão recorrente',
        400,
        'INVALID_PAYMENT_METHOD',
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
      ...(session as Record<string, unknown>),
    };
  },

  async createPixCharge(): Promise<never> {
    throw new AppError(
      'Cobrança Pix não suportada pelo provider Stripe neste fluxo híbrido',
      400,
      'OPERATION_NOT_SUPPORTED',
    );
  },

  async getPaymentStatus(): Promise<never> {
    throw new AppError(
      'Consulta de status de pagamento avulso não suportada para Stripe neste fluxo',
      400,
      'OPERATION_NOT_SUPPORTED',
    );
  },

  async cancelSubscription({ barbershopId, context }: CancelReactivateParams): Promise<SubscriptionResult> {
    if (!context?.stripe_subscription_id) {
      throw new NotFoundError('Assinatura Stripe');
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.update(context.stripe_subscription_id as string, {
      cancel_at_period_end: true,
    });

    const updated = await persistStripeSubscriptionState({
      barbershopId,
      plan: context.plan as string,
      subscription,
      paymentMethod: 'card',
    });

    return {
      provider: 'stripe',
      subscriptionId: subscription.id,
      subscriptionStatus:
        (updated?.subscription_status as InternalSubscriptionStatus) ??
        mapStripeStatusToInternalStatus(subscription.status),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd:
        (updated?.subscription_current_period_end as Date | null) ??
        unixToDate((subscription as unknown as Record<string, unknown>).current_period_end),
    };
  },

  async reactivateSubscription({ barbershopId, context }: CancelReactivateParams): Promise<SubscriptionResult> {
    if (!context?.stripe_subscription_id) {
      throw new NotFoundError('Assinatura Stripe');
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.update(context.stripe_subscription_id as string, {
      cancel_at_period_end: false,
    });

    const updated = await persistStripeSubscriptionState({
      barbershopId,
      plan: context.plan as string,
      subscription,
      paymentMethod: 'card',
    });

    return {
      provider: 'stripe',
      subscriptionId: subscription.id,
      subscriptionStatus:
        (updated?.subscription_status as InternalSubscriptionStatus) ??
        mapStripeStatusToInternalStatus(subscription.status),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd:
        (updated?.subscription_current_period_end as Date | null) ??
        unixToDate((subscription as unknown as Record<string, unknown>).current_period_end),
    };
  },

  async handleWebhook(rawBody: unknown, signature: string): Promise<unknown> {
    return subscriptionService.handleWebhook(rawBody as string | Buffer, signature);
  },

  mapExternalStatusToInternalStatus(externalStatus: unknown): InternalSubscriptionStatus {
    return mapStripeStatusToInternalStatus(externalStatus);
  },
};
