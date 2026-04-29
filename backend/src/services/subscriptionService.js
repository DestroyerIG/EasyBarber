import logger from '../utils/logger.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { getFrontendBaseUrl, getStripeClient, getStripePriceCatalog } from '../config/stripe.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { stripePricingService } from './stripePricingService.js';
import { stripeCheckoutService } from './stripeCheckoutService.js';

const VALID_STATUSES = new Set(['active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete']);
const CHECKOUT_COMPLETION_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
]);

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

const INVOICE_EVENT_TYPES = new Set([
  'invoice.payment_succeeded',
  'invoice.paid',
  'invoice.payment_failed',
]);

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

  if (status === 'unpaid') {
    return 'unpaid';
  }

  if (status === 'paused') {
    return 'past_due';
  }

  return 'incomplete';
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

const getStripeObjectId = (value) => {
  if (!value) {
    return null;
  }

  return typeof value === 'string' ? value : value.id || null;
};

const getCheckoutSessionData = async (stripe, session) => {
  if (!session?.id || (session.customer && session.subscription)) {
    return session;
  }

  return stripe.checkout.sessions.retrieve(session.id);
};

const isActivatingStatus = (status) => status === 'active' || status === 'trialing';

const findLatestCustomerSubscription = async (stripe, customerId) => {
  if (!customerId) {
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });

  return subscriptions.data.find((subscription) => isActivatingStatus(subscription.status)) ||
    subscriptions.data[0] ||
    null;
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

const hasPriorStripeSubscription = async (stripe, customerId, barbershop) => {
  if (barbershop.stripe_subscription_id) {
    return true;
  }

  if (!barbershop.stripe_customer_id) {
    return false;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 1,
  });

  return subscriptions.data.length > 0;
};

const getCheckoutSessionPriceId = async (stripe, session) => {
  const inlinePriceId = session?.line_items?.data?.[0]?.price?.id;
  if (inlinePriceId) {
    return inlinePriceId;
  }

  if (!session?.id) {
    return null;
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
  return lineItems?.data?.[0]?.price?.id || null;
};

const resolveSessionPaymentMethod = (session, explicitPaymentMethod = null) => {
  const normalizedExplicit = stripePricingService.normalizePaymentMethod(explicitPaymentMethod);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const normalizedMetadata = stripePricingService.normalizePaymentMethod(session?.metadata?.paymentMethod);
  if (normalizedMetadata) {
    return normalizedMetadata;
  }

  const normalizedStripeType = stripePricingService.normalizePaymentMethod(session?.payment_method_types?.[0]);
  if (normalizedStripeType) {
    return normalizedStripeType;
  }

  return 'card';
};

const getStripeErrorMetadata = (error) => {
  return {
    message: error?.message || 'Erro desconhecido no Stripe',
    type: error?.type || null,
    code: error?.code || null,
    declineCode: error?.decline_code || null,
    requestId: error?.requestId || error?.raw?.requestId || null,
  };
};

const updateFromStripeSubscription = async ({
  barbershopId,
  subscription,
  explicitPlan,
  priceCatalog,
  client,
}) => {
  const stripePriceId = subscription.items?.data?.[0]?.price?.id || null;
  const resolvedByPriceId = stripePricingService.resolvePlanByPriceId(stripePriceId, priceCatalog);
  const resolvedPlan = explicitPlan || resolvedByPriceId?.plan || null;
  const stripeCustomerId = getStripeObjectId(subscription.customer);
  const subscriptionStatus = normalizeStatus(subscription.status);

  const updated = await subscriptionRepository.updateSubscriptionState(
    barbershopId,
    {
      plan: resolvedPlan,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId,
      stripePaymentMode: 'subscription',
      paymentMethod: 'card',
      subscriptionStatus,
      currentPeriodStart: unixToDate(subscription.current_period_start),
      currentPeriodEnd: unixToDate(subscription.current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      provider: 'stripe',
      providerCustomerId: stripeCustomerId,
      providerSubscriptionId: subscription.id,
      nextDueDate: unixToDate(subscription.current_period_end),
      canceledAt: subscription.canceled_at ? unixToDate(subscription.canceled_at) : null,
      metadata: {
        billingProvider: 'stripe',
        stripeStatus: subscription.status || null,
      },
      clearStripeSubscriptionId: false,
    },
    client
  );

  logger.info(
    {
      event: 'stripe_subscription_synced',
      barbershopId,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus,
      plan: resolvedPlan,
      activated: isActivatingStatus(subscriptionStatus),
    },
    'Assinatura Stripe sincronizada'
  );

  return updated;
};

const updatePendingOneTimePayment = async ({
  barbershopId,
  explicitPlan,
  explicitPaymentMethod,
  client,
}) => {
  const paymentMethod = stripePricingService.normalizePaymentMethod(explicitPaymentMethod);

  return subscriptionRepository.updateSubscriptionState(
    barbershopId,
    {
      plan: explicitPlan || null,
      stripePaymentMode: 'payment',
      paymentMethod: paymentMethod || null,
      subscriptionStatus: 'incomplete',
      cancelAtPeriodEnd: false,
      clearStripeSubscriptionId: true,
    },
    client
  );
};

const updatePaidOneTimeCheckout = async ({
  stripe,
  barbershopId,
  session,
  explicitPlan,
  explicitPaymentMethod,
  priceCatalog,
  client,
}) => {
  const stripePriceId = await getCheckoutSessionPriceId(stripe, session);
  const resolvedByPriceId = stripePricingService.resolvePlanByPriceId(stripePriceId, priceCatalog);
  const resolvedPlan = explicitPlan || resolvedByPriceId?.plan || null;

  if (!resolvedPlan) {
    throw new AppError('Não foi possível identificar o plano do pagamento avulso', 400, 'INVALID_PLAN');
  }

  const paymentMethod = resolveSessionPaymentMethod(session, explicitPaymentMethod);
  const { periodStart, periodEnd } = stripeCheckoutService.resolveOneTimePeriodDates();

  return subscriptionRepository.updateSubscriptionState(
    barbershopId,
    {
      plan: resolvedPlan,
      stripeSubscriptionId: null,
      stripePriceId,
      stripePaymentMode: 'payment',
      paymentMethod,
      subscriptionStatus: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      clearStripeSubscriptionId: true,
    },
    client
  );
};

export const subscriptionService = {
  async createCheckoutSession(barbershopId, plan, paymentMethod) {
    let pricing;

    try {
      pricing = stripePricingService.resolveCheckoutPricing({ plan, paymentMethod });
    } catch (error) {
      logger.error(
        {
          barbershopId,
          plan,
          paymentMethod,
          stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
          stripeRecurringPrices: {
            basico: process.env.STRIPE_PRICE_ID_BASICO || null,
            profissional: process.env.STRIPE_PRICE_ID_PROFISSIONAL || null,
            premium: process.env.STRIPE_PRICE_ID_PREMIUM || null,
          },
          stripeOneTimePrices: {
            basico: process.env.STRIPE_PRICE_ID_BASICO_ONE_TIME || null,
            profissional: process.env.STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME || null,
            premium: process.env.STRIPE_PRICE_ID_PREMIUM_ONE_TIME || null,
          },
        },
        'Falha ao resolver pricing do checkout Stripe'
      );

      throw error;
    }

    const stripe = getStripeClient();

    const barbershop = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!barbershop) {
      throw new NotFoundError('Barbearia');
    }

    const customerId = await ensureCustomer(stripe, barbershop);

    logger.info(
      {
        barbershopId,
        plan,
        paymentMethod: pricing.paymentMethod,
        mode: pricing.mode,
        flowType: pricing.flowType,
        priceId: pricing.priceId,
      },
      'Criando sessão de checkout Stripe'
    );

    const applyTrial = pricing.mode === 'subscription'
      ? !(await hasPriorStripeSubscription(stripe, customerId, barbershop))
      : false;

    const checkoutPayload = stripeCheckoutService.buildCheckoutSessionPayload({
      customerId,
      barbershopId,
      plan,
      paymentMethod: pricing.paymentMethod,
      mode: pricing.mode,
      flowType: pricing.flowType,
      priceId: pricing.priceId,
      applyTrial,
    });

    try {
      const session = await stripe.checkout.sessions.create(checkoutPayload);

      return {
        sessionId: session.id,
        checkoutUrl: session.url,
      };
    } catch (error) {
      const stripeError = getStripeErrorMetadata(error);

      logger.error(
        {
          barbershopId,
          plan,
          paymentMethod: pricing.paymentMethod,
          mode: pricing.mode,
          flowType: pricing.flowType,
          priceId: pricing.priceId,
          stripeError,
          frontendBaseUrl: getFrontendBaseUrl(),
        },
        'Falha ao criar sessão de checkout Stripe'
      );

      throw new AppError(
        'Não foi possível iniciar o checkout no Stripe no momento. Tente novamente.',
        502,
        'CHECKOUT_SESSION_ERROR'
      );
    }
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
      paymentMode: data.stripe_payment_mode,
      paymentMethod: data.payment_method,
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
    const priceCatalog = getStripePriceCatalog();

    const barbershop = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!barbershop) {
      throw new NotFoundError('Barbearia');
    }

    if (barbershop.stripe_payment_mode === 'payment') {
      throw new AppError(
        'Sincronização manual disponível apenas para assinaturas recorrentes por cartão.',
        400,
        'RESYNC_UNAVAILABLE_FOR_ONE_TIME'
      );
    }

    const subscription = barbershop.stripe_subscription_id
      ? await getSubscriptionData(stripe, barbershop.stripe_subscription_id)
      : await findLatestCustomerSubscription(
        stripe,
        barbershop.stripe_customer_id || barbershop.provider_customer_id
      );

    if (!subscription) {
      throw new AppError(
        'Barbearia sem assinatura Stripe vinculada para sincronização manual.',
        400,
        'SUBSCRIPTION_NOT_FOUND'
      );
    }

    const updated = await updateFromStripeSubscription({
      barbershopId,
      subscription,
      explicitPlan: subscription.metadata?.plan || null,
      priceCatalog,
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
    logger.info(
      {
        event: 'stripe_webhook_received',
        hasSignature: Boolean(signature),
      },
      'Webhook Stripe recebido'
    );

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

    logger.info(
      {
        event: 'stripe_webhook_signature_valid',
        stripeEventId: event.id,
        eventType: event.type,
      },
      'Assinatura do webhook Stripe validada'
    );

    const priceCatalog = getStripePriceCatalog();
    const client = await subscriptionRepository.getClient();

    try {
      await client.query('BEGIN');

      const alreadyProcessed = await subscriptionRepository.hasProcessedEvent(event.id, client);
      if (alreadyProcessed) {
        await client.query('ROLLBACK');
        return { processed: false, duplicate: true };
      }

      let barbershopId = null;

      if (CHECKOUT_COMPLETION_EVENTS.has(event.type)) {
        const session = await getCheckoutSessionData(stripe, event.data.object);
        const metadataPlan = session.metadata?.plan;
        const metadataBarbershopId = session.metadata?.barbershopId || session.metadata?.tenantId;
        const metadataPaymentMethod = session.metadata?.paymentMethod;
        const stripeCustomerId = getStripeObjectId(session.customer);

        if (!metadataBarbershopId) {
          throw new AppError('Webhook sem barbershopId no metadata', 400, 'WEBHOOK_METADATA_ERROR');
        }

        logger.info(
          {
            eventType: event.type,
            barbershopId: metadataBarbershopId,
            plan: metadataPlan || null,
            paymentMethod: metadataPaymentMethod || null,
            mode: session.mode,
            paymentStatus: session.payment_status || null,
            stripeCustomerId,
          },
          'Processando webhook de checkout Stripe'
        );

        if (session.mode === 'subscription') {
          const subscription = await getSubscriptionData(stripe, session.subscription) ||
            await findLatestCustomerSubscription(stripe, stripeCustomerId);
          if (!subscription) {
            throw new AppError('Subscription não encontrada no Stripe', 400, 'SUBSCRIPTION_NOT_FOUND');
          }

          await updateFromStripeSubscription({
            barbershopId: metadataBarbershopId,
            subscription,
            explicitPlan: metadataPlan,
            priceCatalog,
            client,
          });
        }

        if (session.mode === 'payment') {
          const shouldActivateOneTime =
            event.type === 'checkout.session.async_payment_succeeded' ||
            session.payment_status === 'paid';

          if (shouldActivateOneTime) {
            await updatePaidOneTimeCheckout({
              stripe,
              barbershopId: metadataBarbershopId,
              session,
              explicitPlan: metadataPlan,
              explicitPaymentMethod: metadataPaymentMethod,
              priceCatalog,
              client,
            });
          } else {
            await updatePendingOneTimePayment({
              barbershopId: metadataBarbershopId,
              explicitPlan: metadataPlan,
              explicitPaymentMethod: metadataPaymentMethod,
              client,
            });

            logger.info(
              {
                eventType: event.type,
                barbershopId: metadataBarbershopId,
                paymentStatus: session.payment_status || null,
              },
              'Pagamento avulso ainda pendente de confirmação no Stripe'
            );
          }
        }

        barbershopId = metadataBarbershopId;
      }

      if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
        const subscription = event.data.object;
        const customerId = getStripeObjectId(subscription.customer);

        if (!customerId) {
          throw new AppError('Webhook sem customer id', 400, 'WEBHOOK_METADATA_ERROR');
        }

        const metadataBarbershopId = subscription.metadata?.barbershopId || subscription.metadata?.tenantId;
        const barbershop = metadataBarbershopId
          ? await subscriptionRepository.getBarbershopBillingContext(metadataBarbershopId, client)
          : await subscriptionRepository.findByStripeCustomerId(customerId, client);

        if (!barbershop) {
          throw new AppError('Barbearia não encontrada para customer Stripe', 404, 'BARBERSHOP_NOT_FOUND');
        }

        const shouldIgnoreEvent =
          barbershop.stripe_payment_mode === 'payment' &&
          (!barbershop.stripe_subscription_id || barbershop.stripe_subscription_id !== subscription.id);

        if (shouldIgnoreEvent) {
          logger.info(
            {
              eventType: event.type,
              barbershopId: barbershop.id,
              stripeSubscriptionId: subscription.id,
            },
            'Evento de assinatura ignorado para conta em fluxo one-time'
          );
        } else {
          await updateFromStripeSubscription({
            barbershopId: barbershop.id,
            subscription,
            explicitPlan: subscription.metadata?.plan || null,
            priceCatalog,
            client,
          });

          barbershopId = barbershop.id;
        }
      }

      if (INVOICE_EVENT_TYPES.has(event.type)) {
        const invoice = event.data.object;
        const customerId = getStripeObjectId(invoice.customer);

        if (customerId) {
          let barbershop = await subscriptionRepository.findByStripeCustomerId(customerId, client);

          if (barbershop) {
            barbershopId = barbershop.id;

            if (barbershop.stripe_payment_mode === 'payment') {
              logger.info(
                {
                  eventType: event.type,
                  barbershopId: barbershop.id,
                  customerId,
                },
                'Evento de invoice ignorado para conta em fluxo one-time'
              );
            } else {
              const subscription = await getSubscriptionData(stripe, invoice.subscription) ||
                await findLatestCustomerSubscription(stripe, customerId);
              if (subscription) {
                await updateFromStripeSubscription({
                  barbershopId: barbershop.id,
                  subscription,
                  explicitPlan: subscription.metadata?.plan || null,
                  priceCatalog,
                  client,
                });
              }
            }
          } else {
            const subscription = await getSubscriptionData(stripe, invoice.subscription) ||
              await findLatestCustomerSubscription(stripe, customerId);
            const metadataBarbershopId = subscription?.metadata?.barbershopId ||
              subscription?.metadata?.tenantId;

            if (metadataBarbershopId) {
              barbershop = await subscriptionRepository.getBarbershopBillingContext(
                metadataBarbershopId,
                client
              );

              if (barbershop && subscription) {
                barbershopId = barbershop.id;
                await updateFromStripeSubscription({
                  barbershopId: barbershop.id,
                  subscription,
                  explicitPlan: subscription.metadata?.plan || null,
                  priceCatalog,
                  client,
                });
              }
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

      const safeStripeError = getStripeErrorMetadata(error);
      logger.error(
        {
          event: 'stripe_webhook_error',
          err: error,
          eventType: event.type,
          stripeError: safeStripeError,
        },
        'Falha ao processar webhook Stripe'
      );

      throw error;
    } finally {
      client.release();
    }
  },
};
