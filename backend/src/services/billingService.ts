import crypto from 'crypto';
import logger from '../utils/logger.js';
import { AppError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { asaasService, type AsaasPayment, type AsaasBarbershopInput } from '../integrations/asaas/service.js';
import { asaasMapper, type AsaasWebhookPayment } from '../integrations/asaas/mapper.js';
import { subscriptionService } from './subscriptionService.js';
import { couponService } from './couponService.js';
import { billingProviderFactory } from './billing/billingProviderFactory.js';
import { stripeBillingProvider as stripeProvider } from './billing/providers/stripeBillingProvider.js';
import { asaasBillingProvider as asaasProvider } from './billing/providers/asaasBillingProvider.js';
import {
  normalizeInternalSubscriptionStatus,
  resolveBillingProviderFromContext,
  type InternalSubscriptionStatus,
} from './billing/statusMapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AsaasMetadata {
  billingProvider: 'asaas';
  asaas: {
    eventType: string | null;
    externalStatus: string | null;
    subscriptionId: string | null;
    paymentId: string | null;
    customerId: string | null;
  };
}

interface AsaasPaymentSnapshotInput {
  barbershopId: string;
  payment: AsaasPayment;
  subscriptionId: string | null;
  internalStatus: InternalSubscriptionStatus;
  pixData?: PixData | null;
  client?: unknown;
}

interface UpdateBarbershopFromAsaasPaymentInput {
  barbershop: BarbershopBillingContext;
  plan: string;
  payment: AsaasPayment | null | undefined;
  subscriptionId: string | null;
  customerId: string | null;
  internalStatus: InternalSubscriptionStatus;
  eventType?: string | null;
  client?: unknown;
}

interface BarbershopBillingContext {
  id: string;
  name?: string | null;
  email?: string | null;
  plan?: string | null;
  desired_plan?: string | null;
  subscription_status?: string | null;
  payment_method?: string | null;
  provider?: string | null;
  provider_customer_id?: string | null;
  stripe_customer_id?: string | null;
  provider_subscription_id?: string | null;
  stripe_subscription_id?: string | null;
  provider_payment_id?: string | null;
  [key: string]: unknown;
}

interface PixData {
  qrCode: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
  dueDate?: string | null;
  confirmedDate?: string | null;
}

interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
}

interface NormalizedWebhookPayload {
  eventId: string;
  eventType: string;
  externalStatus: string | null;
  internalStatus: InternalSubscriptionStatus;
  paymentId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  externalReference: string | null;
  barbershopId: string | null;
  amount: number | null;
  dueDate: string | null;
  confirmedDate: string | null;
  payment: AsaasWebhookPayment;
}

type PlanName = 'basico' | 'profissional' | 'premium';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PLANS = new Set(['basico', 'profissional', 'premium']);
const VALID_PAYMENT_METHODS = new Set(['card', 'pix']);
const SAFE_WEBHOOK_TOKEN_HEADERS = [
  'asaas-access-token',
  'x-asaas-access-token',
  'x-webhook-token',
  'authorization',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveAsaasWebhookToken = (headers: Record<string, unknown> = {}): string | null => {
  for (const headerName of SAFE_WEBHOOK_TOKEN_HEADERS) {
    const raw =
      headers[headerName] ||
      headers[headerName.toLowerCase()] ||
      headers[headerName.toUpperCase()];

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

const resolvePlanFromExternalReference = (externalReference: unknown): string | null => {
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

const resolveCheckoutPlanFromBarbershop = (barbershop: Partial<BarbershopBillingContext>): string => {
  const desiredPlan = String(barbershop?.desired_plan || '').trim().toLowerCase();
  const currentPlan = String(barbershop?.plan || '').trim().toLowerCase();

  if (VALID_PLANS.has(desiredPlan)) {
    return desiredPlan;
  }

  if (VALID_PLANS.has(currentPlan)) {
    return currentPlan;
  }

  return 'basico';
};

const ASAAS_CUSTOMER_FAILURE_CODES = new Set([
  'ASAAS_CUSTOMER_CREATE_ERROR',
  'ASAAS_CUSTOMER_UPDATE_ERROR',
]);

const isAsaasCustomerCreationFailure = (error: unknown): boolean => {
  const err = error as { code?: string; providerData?: { path?: string } } | null;
  const code = String(err?.code || '').trim().toUpperCase();
  if (ASAAS_CUSTOMER_FAILURE_CODES.has(code)) {
    return true;
  }

  const providerPath = String(err?.providerData?.path || '').trim().toLowerCase();
  if (providerPath === '/customers' || providerPath.startsWith('/customers/')) {
    return true;
  }

  return false;
};

const hasActivePaymentEvidence = (
  data: Record<string, unknown>,
  _provider: string | null
): boolean => {
  const status = normalizeInternalSubscriptionStatus(data?.subscription_status);

  // DB subscription_status is the source of truth.
  // 'active' or 'trialing' in the database means the subscription is valid —
  // webhook, admin activation, or coupon already confirmed it.
  return status === 'active' || status === 'trialing';
};

const buildAsaasMetadata = (payload: {
  eventType?: string | null;
  externalStatus?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  customerId?: string | null;
} = {}): AsaasMetadata => {
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
}: AsaasPaymentSnapshotInput): Promise<unknown> => {
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
}: UpdateBarbershopFromAsaasPaymentInput): Promise<unknown> => {
  const { periodStart, periodEnd } = asaasService.resolveBillingPeriodFromPayment(
    payment as AsaasWebhookPayment | null | undefined
  );
  const dueDate = parseDate(payment?.dueDate);
  const paidAt = parseDate(
    payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate
  );

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

const resolveAsaasWebhookBarbershop = async (
  normalizedPayload: NormalizedWebhookPayload,
  client: unknown = null
): Promise<BarbershopBillingContext | null> => {
  if (normalizedPayload.barbershopId) {
    return subscriptionRepository.getBarbershopBillingContext(
      normalizedPayload.barbershopId,
      client
    ) as Promise<BarbershopBillingContext | null>;
  }

  if (normalizedPayload.paymentId) {
    const byProviderPayment = await subscriptionRepository.findByProviderPaymentId(
      'asaas',
      normalizedPayload.paymentId,
      client
    );

    if (byProviderPayment) {
      return byProviderPayment as BarbershopBillingContext;
    }

    const paymentSnapshot = await subscriptionRepository.findBillingPaymentByProviderPaymentId(
      'asaas',
      normalizedPayload.paymentId,
      client
    );

    const snapshot = paymentSnapshot as { barbershop_id?: string } | null;
    if (snapshot?.barbershop_id) {
      return subscriptionRepository.getBarbershopBillingContext(
        snapshot.barbershop_id,
        client
      ) as Promise<BarbershopBillingContext | null>;
    }
  }

  if (normalizedPayload.subscriptionId) {
    const byProviderSubscription = await subscriptionRepository.findByProviderSubscriptionId(
      'asaas',
      normalizedPayload.subscriptionId,
      client
    );

    if (byProviderSubscription) {
      return byProviderSubscription as BarbershopBillingContext;
    }
  }

  if (normalizedPayload.customerId) {
    return subscriptionRepository.findByProviderCustomerId(
      'asaas',
      normalizedPayload.customerId,
      client
    ) as Promise<BarbershopBillingContext | null>;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Exported service
// ---------------------------------------------------------------------------

export const billingService = {
  async createCheckoutSession(
    barbershopId: string,
    plan: string,
    paymentMethod: string,
    couponCode: string | null = null
  ): Promise<Record<string, unknown>> {
    logger.info(
      {
        event: 'billing_checkout_start',
        barbershopId,
        plan,
        paymentMethod,
      },
      'Iniciando checkout de billing'
    );

    try {
      if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
        throw new AppError(
          'Método de pagamento inválido para checkout',
          400,
          'INVALID_PAYMENT_METHOD'
        );
      }

      const barbershop = (await subscriptionRepository.getBarbershopBillingContext(
        barbershopId
      )) as BarbershopBillingContext | null;

      if (!barbershop) {
        throw new NotFoundError('Barbearia');
      }

      const checkoutPlan = resolveCheckoutPlanFromBarbershop(barbershop);
      const requestedPlan = String(plan || '').trim().toLowerCase();

      if (requestedPlan && !VALID_PLANS.has(requestedPlan)) {
        throw new AppError('Plano inválido para checkout', 400, 'INVALID_PLAN');
      }

      if (requestedPlan && requestedPlan !== checkoutPlan) {
        logger.info(
          {
            barbershopId,
            requestedPlan,
            desiredPlan: checkoutPlan,
            subscriptionStatus: barbershop.subscription_status,
            paymentRequired: true,
            checkoutCreated: false,
            paymentProvider: null,
            reason: 'requested_plan_ignored_using_desired_plan',
          },
          'Checkout solicitado com plano diferente do desired_plan salvo'
        );
      }

      const providerName = billingProviderFactory.resolveProviderByPaymentMethod(paymentMethod);
      const provider = billingProviderFactory.getProvider(providerName);

      if (providerName === 'stripe') {
        const stripeCheckout = await (provider as typeof stripeProvider).createSubscription({
          barbershopId: barbershopId,
          plan: checkoutPlan,
          paymentMethod: paymentMethod as string,
        });

        logger.info(
          {
            email: barbershop.email,
            barbershopId,
            desiredPlan: checkoutPlan,
            subscriptionStatus: barbershop.subscription_status,
            paymentRequired: true,
            checkoutCreated: true,
            paymentProvider: 'stripe',
            reason: 'card_checkout_created',
          },
          'Checkout de onboarding criado'
        );

        return {
          provider: 'stripe',
          checkoutUrl: (stripeCheckout as { checkoutUrl?: string }).checkoutUrl,
          sessionId: (stripeCheckout as { sessionId?: string }).sessionId,
          plan: checkoutPlan,
        };
      }

      const PLAN_VALUES: Record<string, number> = {
        basico: 49.9,
        profissional: 99.9,
        premium: 199.9,
      };
      const baseAmount = PLAN_VALUES[checkoutPlan] ?? 49.9;
      const {
        finalAmount: rawFinalAmount,
        discount: rawDiscount,
        coupon: appliedCoupon,
      } = (await couponService.validate(couponCode ?? '', baseAmount)) as {
        finalAmount: number;
        discount: number;
        coupon: AppliedCoupon | null;
      };

      let finalAmount = rawFinalAmount;
      let discount = rawDiscount;

      if (finalAmount > 0 && finalAmount < 5) {
        finalAmount = 5;
        discount = Number((baseAmount - finalAmount).toFixed(2));
      }

      if (finalAmount === 0) {
        const activationCouponCode = appliedCoupon?.code || couponCode || null;

        await subscriptionRepository.updateSubscriptionState(barbershopId, {
          plan: checkoutPlan,
          paymentMethod: 'coupon',
          subscriptionStatus: 'active',
          provider: 'coupon',
          cancelAtPeriodEnd: false,
        });

        // Consumir cupom somente após ativação bem-sucedida
        if (appliedCoupon) {
          await couponService.validateAndApply(couponCode ?? '', baseAmount);
        }

        await subscriptionRepository.storeSubscriptionEvent({
          eventId: `coupon_free_activation:${barbershopId}:${crypto.randomUUID()}`,
          eventType: 'coupon_free_activation',
          barbershopId,
          payload: {
            coupon_code: activationCouponCode,
            amount: 0,
            plan: checkoutPlan,
          },
        });

        logger.info(
          {
            email: barbershop.email,
            barbershopId,
            desiredPlan: checkoutPlan,
            subscriptionStatus: 'active',
            paymentRequired: false,
            checkoutCreated: false,
            paymentProvider: 'coupon',
            reason: 'coupon_free_activation',
          },
          'Ativacao gratuita aplicada via cupom'
        );

        return {
          type: 'FREE_ACTIVATION',
          activated: true,
          plan: checkoutPlan,
        };
      }

      const idempotencyKey = `pix-checkout:${barbershopId}:${plan}:${crypto.randomUUID()}`;
      const pixCheckout = await (provider as typeof asaasProvider).createSubscription({
        barbershop,
        plan: checkoutPlan,
        amount: finalAmount,
        idempotencyKey,
        onCustomerResolved: (customer: unknown) =>
          subscriptionRepository.setAsaasCustomerId(barbershopId, customer as string),
      });

      // Consumir cupom somente após checkout Asaas bem-sucedido
      if (appliedCoupon) {
        await couponService.validateAndApply(couponCode ?? '', baseAmount);
      }

      const pxCheckout = pixCheckout as {
        payment?: AsaasPayment | null;
        subscription?: { id?: string } | null;
        customer?: { id?: string } | null;
        pixData?: PixData | null;
      };

      const payment = pxCheckout.payment || null;
      const mappedStatus = provider.mapExternalStatusToInternalStatus(payment?.status);
      const internalStatus: InternalSubscriptionStatus =
        mappedStatus === 'active' ? 'pending' : (mappedStatus as InternalSubscriptionStatus);
      const resolvedPlan =
        resolvePlanFromExternalReference(payment?.externalReference) || checkoutPlan;

      await updateBarbershopFromAsaasPayment({
        barbershop,
        plan: resolvedPlan,
        payment: payment as AsaasPayment,
        subscriptionId:
          pxCheckout.subscription?.id || payment?.subscription || null,
        customerId: pxCheckout.customer?.id || null,
        internalStatus,
        eventType: 'checkout.pix.created',
      });

      await saveAsaasPaymentSnapshot({
        barbershopId,
        payment: payment as AsaasPayment,
        subscriptionId:
          pxCheckout.subscription?.id || payment?.subscription || null,
        internalStatus,
        pixData: pxCheckout.pixData,
      });

      logger.info(
        {
          email: barbershop.email,
          barbershopId,
          desiredPlan: resolvedPlan,
          subscriptionStatus: internalStatus,
          paymentRequired: internalStatus !== 'active',
          checkoutCreated: true,
          paymentProvider: 'asaas',
          reason: 'pix_checkout_created',
        },
        'Checkout de onboarding criado'
      );

      return {
        provider: 'asaas',
        paymentId: payment?.id || null,
        subscriptionId:
          pxCheckout.subscription?.id || payment?.subscription || null,
        invoiceUrl: payment?.invoiceUrl || null,
        bankSlipUrl: payment?.bankSlipUrl || null,
        status: internalStatus,
        plan: resolvedPlan,
        pixQrCode: pxCheckout.pixData?.qrCode || null,
        qrCode: pxCheckout.pixData?.qrCode || null,
        pixCopyPaste: pxCheckout.pixData?.pixCopyPaste || null,
        expiresAt: pxCheckout.pixData?.expiresAt || null,
        discount,
        coupon: appliedCoupon
          ? {
              id: appliedCoupon.id,
              code: appliedCoupon.code,
              discountType: appliedCoupon.discount_type,
              discountValue: appliedCoupon.discount_value,
            }
          : null,
      };
    } catch (error) {
      const traceCode = `billing-checkout:${crypto.randomUUID()}`;

      const err = error as {
        code?: string;
        statusCode?: number;
        providerStatus?: number;
        providerData?: unknown;
      } | null;

      logger.error(
        {
          event: 'billing_checkout_error',
          traceCode,
          barbershopId,
          plan,
          paymentMethod,
          code: err?.code || null,
          statusCode: err?.statusCode || null,
          providerStatus: err?.providerStatus || null,
          providerData: err?.providerData || null,
        },
        'Falha ao criar checkout de billing'
      );

      const normalizedPaymentMethod = String(paymentMethod || '').trim().toLowerCase();
      if (normalizedPaymentMethod === 'pix' && isAsaasCustomerCreationFailure(error)) {
        const controlledError = new AppError(
          'Não foi possível criar o cliente no Asaas. Verifique os dados cadastrais e tente novamente.',
          400,
          'ASAAS_CUSTOMER_CREATE_ERROR'
        ) as AppError & {
          details?: unknown;
          providerStatus?: number | null;
          providerData?: unknown;
          providerHeaders?: unknown;
        };

        controlledError.details = { traceCode };
        controlledError.providerStatus = err?.providerStatus || err?.statusCode || null;
        controlledError.providerData = err?.providerData || null;
        controlledError.providerHeaders = (error as { providerHeaders?: unknown })?.providerHeaders || null;

        throw controlledError;
      }

      throw error;
    }
  },

  async getStatus(barbershopId: string): Promise<Record<string, unknown>> {
    let data = (await subscriptionRepository.getSubscriptionStatus(
      barbershopId
    )) as Record<string, unknown> | null;

    if (!data) {
      throw new NotFoundError('Barbearia');
    }

    let provider = resolveBillingProviderFromContext(data);
    let subscriptionStatus = normalizeInternalSubscriptionStatus(data.subscription_status);

    if (
      provider === 'stripe' &&
      data.payment_method === 'card' &&
      subscriptionStatus === 'pending'
    ) {
      try {
        const synced = await subscriptionService.resyncBarbershopSubscription(barbershopId);
        data = (await subscriptionRepository.getSubscriptionStatus(
          barbershopId
        )) as Record<string, unknown>;
        provider = resolveBillingProviderFromContext(data);
        subscriptionStatus = normalizeInternalSubscriptionStatus(data.subscription_status);

        logger.info(
          {
            event: 'stripe_subscription_synced',
            barbershopId,
            subscriptionStatus: synced.subscriptionStatus,
            source: 'billing_status_refresh',
          },
          'Assinatura Stripe sincronizada ao consultar status'
        );
      } catch (error) {
        const err = error as { code?: string; message?: string } | null;
        logger.warn(
          {
            event: 'stripe_webhook_error',
            barbershopId,
            code: err?.code || null,
            message: err?.message || null,
            source: 'billing_status_refresh',
          },
          'Falha ao sincronizar assinatura Stripe ao consultar status'
        );
      }
    }

    const paymentRequired = !hasActivePaymentEvidence(data, provider);

    return {
      plan: data.plan,
      desiredPlan: resolveCheckoutPlanFromBarbershop(data as Partial<BarbershopBillingContext>),
      provider,
      paymentMethod: data.payment_method || null,
      subscriptionStatus,
      paymentRequired,
      currentPeriodStart:
        data.current_period_start || data.subscription_current_period_start,
      currentPeriodEnd:
        data.current_period_end || data.subscription_current_period_end,
      nextDueDate:
        data.next_due_date ||
        data.current_period_end ||
        data.subscription_current_period_end,
      lastPaymentDate: data.last_payment_date || null,
      canceledAt: data.canceled_at || null,
      cancelAtPeriodEnd: Boolean(data.subscription_cancel_at_period_end),
      hasCustomer: Boolean(data.provider_customer_id || data.stripe_customer_id),
      paymentMode: data.stripe_payment_mode || null,
      providerCustomerId:
        data.provider_customer_id || data.stripe_customer_id || null,
      providerSubscriptionId:
        data.provider_subscription_id || data.stripe_subscription_id || null,
      providerPaymentId: data.provider_payment_id || null,
      metadata: data.metadata || null,
    };
  },

  async cancelSubscription(barbershopId: string): Promise<Record<string, unknown>> {
    const context = (await subscriptionRepository.getBarbershopBillingContext(
      barbershopId
    )) as BarbershopBillingContext | null;

    if (!context) {
      throw new NotFoundError('Barbearia');
    }

    const providerName = resolveBillingProviderFromContext(
      context as unknown as Record<string, unknown>
    );

    if (!providerName) {
      throw new AppError(
        'Nenhum provider de billing vinculado à conta',
        400,
        'BILLING_PROVIDER_NOT_SET'
      );
    }

    const provider = billingProviderFactory.getProvider(providerName);

    if (providerName === 'stripe') {
      return (provider as typeof stripeProvider).cancelSubscription({ barbershopId, context }) as unknown as Promise<Record<string, unknown>>;
    }

    if (context.provider_subscription_id) {
      await (provider as typeof asaasProvider).cancelSubscription({
        subscriptionId: context.provider_subscription_id as string,
      });
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

  async reactivateSubscription(barbershopId: string): Promise<Record<string, unknown>> {
    const context = (await subscriptionRepository.getBarbershopBillingContext(
      barbershopId
    )) as BarbershopBillingContext | null;

    if (!context) {
      throw new NotFoundError('Barbearia');
    }

    const providerName = resolveBillingProviderFromContext(
      context as unknown as Record<string, unknown>
    );

    if (!providerName) {
      throw new AppError(
        'Nenhum provider de billing vinculado à conta',
        400,
        'BILLING_PROVIDER_NOT_SET'
      );
    }

    const provider = billingProviderFactory.getProvider(providerName);

    if (providerName === 'stripe') {
      return (provider as typeof stripeProvider).reactivateSubscription({
        barbershopId,
        context,
      }) as unknown as Promise<Record<string, unknown>>;
    }

    const plan = context.plan || 'basico';
    const checkout = await this.createCheckoutSession(barbershopId, plan, 'pix');

    return {
      ...checkout,
      reactivationMode: 'new_pix_checkout',
    };
  },

  async getPixPaymentStatus(
    barbershopId: string,
    paymentId: string
  ): Promise<Record<string, unknown>> {
    const existingPayment = (await subscriptionRepository.findBillingPaymentByProviderPaymentId(
      'asaas',
      paymentId
    )) as { barbershop_id?: string } | null;

    if (existingPayment && existingPayment.barbershop_id !== barbershopId) {
      throw new UnauthorizedError('Cobrança Pix não pertence à barbearia autenticada');
    }

    const provider = billingProviderFactory.getProvider('asaas');
    const paymentResult = (await provider.getPaymentStatus(paymentId)) as {
      payment: AsaasPayment;
      pixData: PixData | null;
    };

    const payment = paymentResult.payment;
    const internalStatus = provider.mapExternalStatusToInternalStatus(
      payment?.status
    ) as InternalSubscriptionStatus;

    const barbershop = (await subscriptionRepository.getBarbershopBillingContext(
      barbershopId
    )) as BarbershopBillingContext | null;

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
      resolvePlanFromExternalReference(payment?.externalReference) || barbershop.plan || 'basico';

    await updateBarbershopFromAsaasPayment({
      barbershop,
      plan: resolvedPlan,
      payment,
      subscriptionId:
        payment?.subscription || barbershop.provider_subscription_id || null,
      customerId:
        payment?.customer || barbershop.provider_customer_id || null,
      internalStatus,
      eventType: 'pix.status.refresh',
    });

    await saveAsaasPaymentSnapshot({
      barbershopId,
      payment,
      subscriptionId:
        payment?.subscription || barbershop.provider_subscription_id || null,
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

  validateAsaasWebhook(headers: Record<string, unknown> = {}): true {
    const configuredToken = process.env.ASAAS_WEBHOOK_TOKEN;

    if (!configuredToken) {
      return true;
    }

    const token = resolveAsaasWebhookToken(headers);

    if (!token) {
      throw new UnauthorizedError('Assinatura do webhook Asaas inválida');
    }

    const tokenBuffer = Buffer.from(token, 'utf8');
    const configuredBuffer = Buffer.from(configuredToken, 'utf8');

    if (
      tokenBuffer.length !== configuredBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, configuredBuffer)
    ) {
      throw new UnauthorizedError('Assinatura do webhook Asaas inválida');
    }

    return true;
  },

  async handleAsaasWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, unknown> = {}
  ): Promise<{ processed: boolean; duplicate?: boolean; eventType?: string }> {
    this.validateAsaasWebhook(headers);

    const provider = billingProviderFactory.getProvider('asaas') as typeof asaasProvider;
    const normalizedPayload = (await provider.handleWebhook(
      payload
    )) as NormalizedWebhookPayload;

    const lockKey = `billing:asaas:${normalizedPayload.eventId}`;
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    try {
      const alreadyProcessed =
        await subscriptionRepository.hasProcessedBillingWebhookEvent(
          'asaas',
          normalizedPayload.eventId,
          null
        );

      if (alreadyProcessed) {
        return {
          processed: false,
          duplicate: true,
          eventType: normalizedPayload.eventType,
        };
      }

      const barbershop = await resolveAsaasWebhookBarbershop(normalizedPayload, null);
      let processingStatus = 'ignored';
      let resolvedBarbershopId: string | null = null;

      if (barbershop) {
        resolvedBarbershopId = barbershop.id;
        const resolvedPlan =
          resolvePlanFromExternalReference(normalizedPayload.externalReference) ||
          barbershop.plan ||
          'basico';

        await updateBarbershopFromAsaasPayment({
          barbershop,
          plan: resolvedPlan,
          payment: normalizedPayload.payment as unknown as AsaasPayment,
          subscriptionId:
            normalizedPayload.subscriptionId ||
            barbershop.provider_subscription_id ||
            null,
          customerId:
            normalizedPayload.customerId ||
            barbershop.provider_customer_id ||
            null,
          internalStatus: normalizedPayload.internalStatus,
          eventType: normalizedPayload.eventType,
          client: null,
        });

        await saveAsaasPaymentSnapshot({
          barbershopId: barbershop.id,
          payment: normalizedPayload.payment as unknown as AsaasPayment,
          subscriptionId:
            normalizedPayload.subscriptionId ||
            barbershop.provider_subscription_id ||
            null,
          internalStatus: normalizedPayload.internalStatus,
          pixData: asaasMapper.mapAsaasPaymentToPixData(normalizedPayload.payment),
          client: null,
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
        null
      );

      return {
        processed: true,
        duplicate: false,
        eventType: normalizedPayload.eventType,
      };
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: 'asaas',
          payloadSummary: {
            event: payload?.event || null,
            paymentId: (payload?.payment as { id?: string } | null)?.id || null,
          },
        },
        'Falha ao processar webhook Asaas'
      );

      throw error;
    }
  },
};
