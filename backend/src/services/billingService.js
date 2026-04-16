import crypto from 'crypto';
import logger from '../utils/logger.js';
import { AppError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { asaasService } from '../integrations/asaas/service.js';
import { asaasMapper } from '../integrations/asaas/mapper.js';
import { billingProviderFactory } from './billing/billingProviderFactory.js';
import {
  normalizeInternalSubscriptionStatus,
  resolveBillingProviderFromContext,
} from './billing/statusMapper.js';

const VALID_PLANS = new Set(['basico', 'profissional', 'premium']);
const VALID_PAYMENT_METHODS = new Set(['card', 'pix']);
const SAFE_WEBHOOK_TOKEN_HEADERS = [
  'asaas-access-token',
  'x-asaas-access-token',
  'x-webhook-token',
  'authorization',
];

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveAsaasWebhookToken = (headers = {}) => {
  for (const headerName of SAFE_WEBHOOK_TOKEN_HEADERS) {
    const raw = headers[headerName] || headers[headerName.toLowerCase()] || headers[headerName.toUpperCase()];

    if (!raw) {
      continue;
    }

    if (headerName === 'authorization' && typeof raw === 'string') {
      const match = raw.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) {
        return match[1].trim();
      }

      return raw.trim();
    }

    if (typeof raw === 'string') {
      return raw.trim();
    }

    if (Array.isArray(raw) && raw.length > 0) {
      return String(raw[0]).trim();
    }
  }

  return null;
};

const resolvePlanFromExternalReference = (externalReference) => {
  if (typeof externalReference !== 'string' || externalReference.trim().length === 0) {
    return null;
  }

  const match = externalReference.match(/plan:([a-z_]+)/i);
  if (!match?.[1]) {
    return null;
  }

  const normalized = match[1].toLowerCase();
  return VALID_PLANS.has(normalized) ? normalized : null;
};

const buildAsaasMetadata = (payload = {}) => {
  return {
    billingProvider: 'asaas',
    asaas: {
      eventType: payload.eventType || null,
      externalStatus: payload.externalStatus || null,
      subscriptionId: payload.subscriptionId || null,
      paymentId: payload.paymentId || null,
      customerId: payload.customerId || null,
    },
  };
};

const saveAsaasPaymentSnapshot = async ({
  barbershopId,
  payment,
  subscriptionId,
  internalStatus,
  pixData,
  client = null,
}) => {
  if (!payment?.id) {
    return null;
  }

  return subscriptionRepository.upsertBillingPayment(
    {
      barbershopId,
      provider: 'asaas',
      providerPaymentId: payment.id,
      providerSubscriptionId: subscriptionId || payment.subscription || null,
      paymentMethod: 'pix',
      externalStatus: payment.status || null,
      internalStatus,
      amount: typeof payment.value === 'number' ? payment.value : null,
      dueDate: parseDate(payment.dueDate),
      paidAt: parseDate(payment.confirmedDate || payment.clientPaymentDate || payment.paymentDate),
      pixCopyPaste: pixData?.pixCopyPaste || null,
      qrCode: pixData?.qrCode || null,
      metadata: {
        rawPayment: payment,
      },
    },
    client
  );
};

const updateBarbershopFromAsaasPayment = async ({
  barbershop,
  plan,
  payment,
  subscriptionId,
  customerId,
  internalStatus,
  eventType = null,
  client = null,
}) => {
  const { periodStart, periodEnd } = asaasService.resolveBillingPeriodFromPayment(payment);
  const dueDate = parseDate(payment?.dueDate);
  const paidAt = parseDate(payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate);

  return subscriptionRepository.updateSubscriptionState(
    barbershop.id,
    {
      plan,
      paymentMethod: 'pix',
      subscriptionStatus: internalStatus,
      cancelAtPeriodEnd: internalStatus === 'canceled',
      provider: 'asaas',
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
      providerPaymentId: payment?.id || null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextDueDate: dueDate,
      lastPaymentDate: paidAt,
      canceledAt: internalStatus === 'canceled' ? new Date() : null,
      metadata: buildAsaasMetadata({
        eventType,
        externalStatus: payment?.status,
        subscriptionId,
        paymentId: payment?.id,
        customerId,
      }),
    },
    client
  );
};

const resolveAsaasWebhookBarbershop = async (normalizedPayload, client = null) => {
  if (normalizedPayload.barbershopId) {
    return subscriptionRepository.getBarbershopBillingContext(normalizedPayload.barbershopId, client);
  }

  if (normalizedPayload.paymentId) {
    const byProviderPayment = await subscriptionRepository.findByProviderPaymentId(
      'asaas',
      normalizedPayload.paymentId,
      client
    );

    if (byProviderPayment) {
      return byProviderPayment;
    }

    const paymentSnapshot = await subscriptionRepository.findBillingPaymentByProviderPaymentId(
      'asaas',
      normalizedPayload.paymentId,
      client
    );

    if (paymentSnapshot?.barbershop_id) {
      return subscriptionRepository.getBarbershopBillingContext(paymentSnapshot.barbershop_id, client);
    }
  }

  if (normalizedPayload.subscriptionId) {
    const byProviderSubscription = await subscriptionRepository.findByProviderSubscriptionId(
      'asaas',
      normalizedPayload.subscriptionId,
      client
    );

    if (byProviderSubscription) {
      return byProviderSubscription;
    }
  }

  if (normalizedPayload.customerId) {
    return subscriptionRepository.findByProviderCustomerId(
      'asaas',
      normalizedPayload.customerId,
      client
    );
  }

  return null;
};

export const billingService = {
  async createCheckoutSession(barbershopId, plan, paymentMethod) {
    if (!VALID_PLANS.has(plan)) {
      throw new AppError('Plano inválido para checkout', 400, 'INVALID_PLAN');
    }

    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      throw new AppError('Método de pagamento inválido para checkout', 400, 'INVALID_PAYMENT_METHOD');
    }

    const barbershop = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!barbershop) {
      throw new NotFoundError('Barbearia');
    }

    const providerName = billingProviderFactory.resolveProviderByPaymentMethod(paymentMethod);
    const provider = billingProviderFactory.getProvider(providerName);

    if (providerName === 'stripe') {
      const stripeCheckout = await provider.createSubscription({
        barbershopId,
        plan,
        paymentMethod,
      });

      return {
        provider: 'stripe',
        checkoutUrl: stripeCheckout.checkoutUrl,
        sessionId: stripeCheckout.sessionId,
      };
    }

    const idempotencyKey = `pix-checkout:${barbershopId}:${plan}:${crypto.randomUUID()}`;
    const pixCheckout = await provider.createSubscription({
      barbershop,
      plan,
      idempotencyKey,
    });

    const payment = pixCheckout.payment || null;
    const internalStatus = provider.mapExternalStatusToInternalStatus(payment?.status);
    const resolvedPlan = resolvePlanFromExternalReference(payment?.externalReference) || plan;

    await updateBarbershopFromAsaasPayment({
      barbershop,
      plan: resolvedPlan,
      payment,
      subscriptionId: pixCheckout.subscription?.id || payment?.subscription || null,
      customerId: pixCheckout.customer?.id || null,
      internalStatus,
      eventType: 'checkout.pix.created',
    });

    await saveAsaasPaymentSnapshot({
      barbershopId,
      payment,
      subscriptionId: pixCheckout.subscription?.id || payment?.subscription || null,
      internalStatus,
      pixData: pixCheckout.pixData,
    });

    return {
      provider: 'asaas',
      paymentId: payment?.id || null,
      subscriptionId: pixCheckout.subscription?.id || payment?.subscription || null,
      status: internalStatus,
      qrCode: pixCheckout.pixData?.qrCode || null,
      pixCopyPaste: pixCheckout.pixData?.pixCopyPaste || null,
      expiresAt: pixCheckout.pixData?.expiresAt || null,
    };
  },

  async getStatus(barbershopId) {
    const data = await subscriptionRepository.getSubscriptionStatus(barbershopId);
    if (!data) {
      throw new NotFoundError('Barbearia');
    }

    const provider = resolveBillingProviderFromContext(data);

    return {
      plan: data.plan,
      provider,
      paymentMethod: data.payment_method || null,
      subscriptionStatus: normalizeInternalSubscriptionStatus(data.subscription_status),
      currentPeriodStart: data.current_period_start || data.subscription_current_period_start,
      currentPeriodEnd: data.current_period_end || data.subscription_current_period_end,
      nextDueDate: data.next_due_date || data.current_period_end || data.subscription_current_period_end,
      lastPaymentDate: data.last_payment_date || null,
      canceledAt: data.canceled_at || null,
      cancelAtPeriodEnd: Boolean(data.subscription_cancel_at_period_end),
      hasCustomer: Boolean(data.provider_customer_id || data.stripe_customer_id),
      paymentMode: data.stripe_payment_mode || null,
      providerCustomerId: data.provider_customer_id || data.stripe_customer_id || null,
      providerSubscriptionId: data.provider_subscription_id || data.stripe_subscription_id || null,
      providerPaymentId: data.provider_payment_id || null,
      metadata: data.metadata || null,
    };
  },

  async cancelSubscription(barbershopId) {
    const context = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!context) {
      throw new NotFoundError('Barbearia');
    }

    const providerName = resolveBillingProviderFromContext(context);
    if (!providerName) {
      throw new AppError('Nenhum provider de billing vinculado à conta', 400, 'BILLING_PROVIDER_NOT_SET');
    }

    const provider = billingProviderFactory.getProvider(providerName);

    if (providerName === 'stripe') {
      return provider.cancelSubscription({ barbershopId, context });
    }

    if (context.provider_subscription_id) {
      await provider.cancelSubscription({ subscriptionId: context.provider_subscription_id });
    }

    await subscriptionRepository.updateSubscriptionState(barbershopId, {
      provider: 'asaas',
      paymentMethod: 'pix',
      subscriptionStatus: 'canceled',
      canceledAt: new Date(),
      cancelAtPeriodEnd: true,
      metadata: {
        billingProvider: 'asaas',
        cancelSource: 'manual_action',
      },
    });

    return {
      provider: 'asaas',
      subscriptionStatus: 'canceled',
      canceledAt: new Date().toISOString(),
    };
  },

  async reactivateSubscription(barbershopId) {
    const context = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!context) {
      throw new NotFoundError('Barbearia');
    }

    const providerName = resolveBillingProviderFromContext(context);
    if (!providerName) {
      throw new AppError('Nenhum provider de billing vinculado à conta', 400, 'BILLING_PROVIDER_NOT_SET');
    }

    const provider = billingProviderFactory.getProvider(providerName);

    if (providerName === 'stripe') {
      return provider.reactivateSubscription({ barbershopId, context });
    }

    const plan = context.plan || 'basico';
    const checkout = await this.createCheckoutSession(barbershopId, plan, 'pix');

    return {
      ...checkout,
      reactivationMode: 'new_pix_checkout',
    };
  },

  async getPixPaymentStatus(barbershopId, paymentId) {
    const existingPayment = await subscriptionRepository.findBillingPaymentByProviderPaymentId(
      'asaas',
      paymentId
    );

    if (existingPayment && existingPayment.barbershop_id !== barbershopId) {
      throw new UnauthorizedError('Cobrança Pix não pertence à barbearia autenticada');
    }

    const provider = billingProviderFactory.getProvider('asaas');
    const paymentResult = await provider.getPaymentStatus(paymentId);

    const payment = paymentResult.payment;
    const internalStatus = provider.mapExternalStatusToInternalStatus(payment?.status);

    const barbershop = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
    if (!barbershop) {
      throw new NotFoundError('Barbearia');
    }

    const paymentBarbershopId = asaasMapper.extractBarbershopIdFromExternalReference(
      payment?.externalReference
    );

    if (paymentBarbershopId && paymentBarbershopId !== barbershopId) {
      throw new UnauthorizedError('Cobrança Pix não pertence à barbearia autenticada');
    }

    if (
      payment?.customer &&
      barbershop.provider_customer_id &&
      payment.customer !== barbershop.provider_customer_id
    ) {
      throw new UnauthorizedError('Cobrança Pix não pertence à barbearia autenticada');
    }

    const resolvedPlan =
      resolvePlanFromExternalReference(payment?.externalReference) || barbershop.plan;

    await updateBarbershopFromAsaasPayment({
      barbershop,
      plan: resolvedPlan,
      payment,
      subscriptionId: payment?.subscription || barbershop.provider_subscription_id || null,
      customerId: payment?.customer || barbershop.provider_customer_id || null,
      internalStatus,
      eventType: 'pix.status.refresh',
    });

    await saveAsaasPaymentSnapshot({
      barbershopId,
      payment,
      subscriptionId: payment?.subscription || barbershop.provider_subscription_id || null,
      internalStatus,
      pixData: paymentResult.pixData,
    });

    return {
      provider: 'asaas',
      paymentId: payment?.id || paymentId,
      subscriptionId: payment?.subscription || null,
      status: internalStatus,
      externalStatus: payment?.status || null,
      qrCode: paymentResult.pixData?.qrCode || null,
      pixCopyPaste: paymentResult.pixData?.pixCopyPaste || null,
      expiresAt: paymentResult.pixData?.expiresAt || null,
      dueDate: paymentResult.pixData?.dueDate || null,
      confirmedDate: paymentResult.pixData?.confirmedDate || null,
    };
  },

  validateAsaasWebhook(headers = {}) {
    const configuredToken = process.env.ASAAS_WEBHOOK_TOKEN;

    if (!configuredToken) {
      return true;
    }

    const token = resolveAsaasWebhookToken(headers);

    if (!token || token !== configuredToken) {
      throw new UnauthorizedError('Assinatura do webhook Asaas inválida');
    }

    return true;
  },

  async handleAsaasWebhook(payload, headers = {}) {
    this.validateAsaasWebhook(headers);

    const provider = billingProviderFactory.getProvider('asaas');
    const normalizedPayload = await provider.handleWebhook(payload);

    const client = await subscriptionRepository.getClient();

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`billing:asaas:${normalizedPayload.eventId}`]
      );

      const alreadyProcessed = await subscriptionRepository.hasProcessedBillingWebhookEvent(
        'asaas',
        normalizedPayload.eventId,
        client
      );

      if (alreadyProcessed) {
        await client.query('ROLLBACK');
        return {
          processed: false,
          duplicate: true,
          eventType: normalizedPayload.eventType,
        };
      }

      const barbershop = await resolveAsaasWebhookBarbershop(normalizedPayload, client);
      let processingStatus = 'ignored';
      let resolvedBarbershopId = null;

      if (barbershop) {
        resolvedBarbershopId = barbershop.id;
        const resolvedPlan =
          resolvePlanFromExternalReference(normalizedPayload.externalReference) ||
          barbershop.plan;

        await updateBarbershopFromAsaasPayment({
          barbershop,
          plan: resolvedPlan,
          payment: normalizedPayload.payment,
          subscriptionId:
            normalizedPayload.subscriptionId || barbershop.provider_subscription_id || null,
          customerId: normalizedPayload.customerId || barbershop.provider_customer_id || null,
          internalStatus: normalizedPayload.internalStatus,
          eventType: normalizedPayload.eventType,
          client,
        });

        await saveAsaasPaymentSnapshot({
          barbershopId: barbershop.id,
          payment: normalizedPayload.payment,
          subscriptionId:
            normalizedPayload.subscriptionId || barbershop.provider_subscription_id || null,
          internalStatus: normalizedPayload.internalStatus,
          pixData: asaasMapper.mapAsaasPaymentToPixData(normalizedPayload.payment),
          client,
        });

        processingStatus = 'processed';
      } else {
        logger.warn(
          {
            eventType: normalizedPayload.eventType,
            paymentId: normalizedPayload.paymentId,
            customerId: normalizedPayload.customerId,
            subscriptionId: normalizedPayload.subscriptionId,
          },
          'Webhook Asaas recebido sem barbearia correspondente'
        );
      }

      await subscriptionRepository.storeBillingWebhookEvent(
        {
          provider: 'asaas',
          eventId: normalizedPayload.eventId,
          eventType: normalizedPayload.eventType,
          barbershopId: resolvedBarbershopId,
          payload,
          status: processingStatus,
        },
        client
      );

      await client.query('COMMIT');

      return {
        processed: true,
        duplicate: false,
        eventType: normalizedPayload.eventType,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      logger.error(
        {
          err: error,
          provider: 'asaas',
          payloadSummary: {
            event: payload?.event || null,
            paymentId: payload?.payment?.id || null,
          },
        },
        'Falha ao processar webhook Asaas'
      );

      throw error;
    } finally {
      client.release();
    }
  },
};
