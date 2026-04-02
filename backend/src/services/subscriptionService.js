import logger from '../utils/logger.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { getFrontendBaseUrl, getStripeClient, getStripePriceIds } from '../config/stripe.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';

const PLAN_IDS = ['basico', 'profissional', 'premium'];
const VALID_STATUSES = new Set(['active', 'trialing', 'past_due', 'canceled', 'incomplete']);

const ensurePlan = (plan) => {
  if (!PLAN_IDS.includes(plan)) {
    throw new AppError('Plano inválido para checkout', 400, 'INVALID_PLAN');
  }
};

const ensurePriceId = (plan) => {
  const planPriceIds = getStripePriceIds();
  const priceId = planPriceIds[plan];

  if (!priceId) {
    throw new AppError(
      `Price ID não configurado para o plano ${plan}`,
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  return { priceId, planPriceIds };
};

const unixToDate = (value) => {
  if (!value || Number.isNaN(Number(value))) {
    return null;
  }
  return new Date(Number(value) * 1000);
};

const normalizeStatus = (status) => {
  if (VALID_STATUSES.has(status)) {
    return status;
  }

  if (status === 'unpaid' || status === 'paused') {
    return 'past_due';
  }

  return 'incomplete';
};

const resolvePlanByPriceId = (priceId, planPriceIds) => {
  const found = Object.entries(planPriceIds).find(([, id]) => id === priceId);
  return found ? found[0] : null;
};

const getSubscriptionData = async (stripe, subscriptionRef) => {
  const subscriptionId = typeof subscriptionRef === 'string'
    ? subscriptionRef
    : subscriptionRef?.id;

  if (!subscriptionId) {
    return null;
  }

  return stripe.subscriptions.retrieve(subscriptionId);
};

const ensureCustomer = async (stripe, barbershop) => {
  if (barbershop.stripe_customer_id) {
    return barbershop.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    name: barbershop.name,
    email: barbershop.email,
    metadata: {
      barbershopId: barbershop.id,
    },
  });

  await subscriptionRepository.setStripeCustomerId(barbershop.id, customer.id);
  return customer.id;
};

const updateFromStripeSubscription = async ({
  barbershopId,
  subscription,
  explicitPlan,
  planPriceIds,
  client,
}) => {
  const stripePriceId = subscription.items?.data?.[0]?.price?.id || null;
  const resolvedPlan = explicitPlan || resolvePlanByPriceId(stripePriceId, planPriceIds);

  return subscriptionRepository.updateSubscriptionState(
    barbershopId,
    {
      plan: resolvedPlan,
      stripeSubscriptionId: subscription.id,
      stripePriceId,
      subscriptionStatus: normalizeStatus(subscription.status),
      currentPeriodStart: unixToDate(subscription.current_period_start),
      currentPeriodEnd: unixToDate(subscription.current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    },
    client
  );
};

export const subscriptionService = {
  async createCheckoutSession(barbershopId, plan) {
    ensurePlan(plan);
    const { priceId } = ensurePriceId(plan);
    const stripe = getStripeClient();

    const barbershop = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!barbershop) {
      throw new NotFoundError('Barbearia');
    }

    const customerId = await ensureCustomer(stripe, barbershop);
    const frontendBaseUrl = getFrontendBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendBaseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendBaseUrl}/dashboard?billing=canceled`,
      metadata: {
        barbershopId,
        plan,
      },
      subscription_data: {
        metadata: {
          barbershopId,
          plan,
        },
      },
      locale: 'pt-BR',
    });

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  },

  async getStatus(barbershopId) {
    const data = await subscriptionRepository.getSubscriptionStatus(barbershopId);
    if (!data) {
      throw new NotFoundError('Barbearia');
    }

    return {
      plan: data.plan,
      subscriptionStatus: data.subscription_status,
      currentPeriodStart: data.subscription_current_period_start,
      currentPeriodEnd: data.subscription_current_period_end,
      cancelAtPeriodEnd: data.subscription_cancel_at_period_end,
      hasCustomer: Boolean(data.stripe_customer_id),
    };
  },

  async createPortalSession(barbershopId) {
    const stripe = getStripeClient();
    const barbershop = await subscriptionRepository.getBarbershopBillingContext(barbershopId);

    if (!barbershop) {
      throw new NotFoundError('Barbearia');
    }

    if (!barbershop.stripe_customer_id) {
      throw new AppError(
        'Não foi encontrado cliente Stripe para esta conta. Conclua um checkout primeiro.',
        400,
        'CUSTOMER_NOT_FOUND'
      );
    }

    const frontendBaseUrl = getFrontendBaseUrl();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: barbershop.stripe_customer_id,
      return_url: `${frontendBaseUrl}/dashboard?billing=portal`,
    });

    return {
      portalUrl: portalSession.url,
    };
  },

  async resyncBarbershopSubscription(barbershopId) {
    const stripe = getStripeClient();
    const planPriceIds = getStripePriceIds();

    const barbershop = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!barbershop) {
      throw new NotFoundError('Barbearia');
    }

    if (!barbershop.stripe_subscription_id) {
      throw new AppError(
        'Barbearia sem assinatura Stripe vinculada para sincronização manual.',
        400,
        'SUBSCRIPTION_NOT_FOUND'
      );
    }

    const subscription = await getSubscriptionData(stripe, barbershop.stripe_subscription_id);
    if (!subscription) {
      throw new AppError('Subscription não encontrada no Stripe', 404, 'SUBSCRIPTION_NOT_FOUND');
    }

    const updated = await updateFromStripeSubscription({
      barbershopId,
      subscription,
      explicitPlan: subscription.metadata?.plan || null,
      planPriceIds,
      client: null,
    });

    return {
      plan: updated.plan,
      subscriptionStatus: updated.subscription_status,
      currentPeriodStart: updated.subscription_current_period_start,
      currentPeriodEnd: updated.subscription_current_period_end,
      cancelAtPeriodEnd: updated.subscription_cancel_at_period_end,
    };
  },

  async handleWebhook(rawBody, signature) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError(
        'Webhook Stripe não configurado no servidor',
        503,
        'BILLING_NOT_CONFIGURED'
      );
    }

    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    const planPriceIds = getStripePriceIds();
    const client = await subscriptionRepository.getClient();

    try {
      await client.query('BEGIN');

      const alreadyProcessed = await subscriptionRepository.hasProcessedEvent(event.id, client);
      if (alreadyProcessed) {
        await client.query('ROLLBACK');
        return { processed: false, duplicate: true };
      }

      let barbershopId = null;

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadataPlan = session.metadata?.plan;
        const metadataBarbershopId = session.metadata?.barbershopId;

        if (!metadataBarbershopId) {
          throw new AppError('Webhook sem barbershopId no metadata', 400, 'WEBHOOK_METADATA_ERROR');
        }

        const subscription = await getSubscriptionData(stripe, session.subscription);
        if (!subscription) {
          throw new AppError('Subscription não encontrada no Stripe', 400, 'SUBSCRIPTION_NOT_FOUND');
        }

        await updateFromStripeSubscription({
          barbershopId: metadataBarbershopId,
          subscription,
          explicitPlan: metadataPlan,
          planPriceIds,
          client,
        });

        barbershopId = metadataBarbershopId;
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;

        if (!customerId) {
          throw new AppError('Webhook sem customer id', 400, 'WEBHOOK_METADATA_ERROR');
        }

        const barbershop = await subscriptionRepository.findByStripeCustomerId(customerId, client);
        if (!barbershop) {
          throw new AppError('Barbearia não encontrada para customer Stripe', 404, 'BARBERSHOP_NOT_FOUND');
        }

        await updateFromStripeSubscription({
          barbershopId: barbershop.id,
          subscription,
          explicitPlan: subscription.metadata?.plan || null,
          planPriceIds,
          client,
        });

        barbershopId = barbershop.id;
      }

      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id;

        if (customerId) {
          const barbershop = await subscriptionRepository.findByStripeCustomerId(customerId, client);

          if (barbershop) {
            barbershopId = barbershop.id;

            const subscription = await getSubscriptionData(stripe, invoice.subscription);
            if (subscription) {
              await updateFromStripeSubscription({
                barbershopId: barbershop.id,
                subscription,
                explicitPlan: subscription.metadata?.plan || null,
                planPriceIds,
                client,
              });
            }
          }
        }
      }

      const insertedEvent = await subscriptionRepository.storeSubscriptionEvent(
        {
          eventId: event.id,
          eventType: event.type,
          barbershopId,
          payload: event.data?.object || null,
        },
        client
      );

      if (!insertedEvent) {
        await client.query('ROLLBACK');
        return { processed: false, duplicate: true };
      }

      await client.query('COMMIT');

      return {
        processed: true,
        eventType: event.type,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, eventType: event.type }, 'Falha ao processar webhook Stripe');
      throw error;
    } finally {
      client.release();
    }
  },
};
