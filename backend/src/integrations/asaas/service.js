import { AppError } from '../../utils/errors.js';
import { isValidCpfCnpj, normalizeDocumentDigits } from '../../utils/cpfCnpj.js';
import { asaasClient } from './client.js';
import { asaasMapper } from './mapper.js';

const PLAN_VALUES = Object.freeze({
  basico: 49.9,
  profissional: 99.9,
  premium: 199.9,
});

const normalizePhoneDigits = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const stringValue = String(value);
  const digits = stringValue.replace(/\D+/g, '');
  return digits.length >= 10 && digits.length <= 18 ? digits : null;
};

const resolvePlanValue = (plan) => {
  const normalizedPlan = typeof plan === 'string' ? plan.trim().toLowerCase() : '';

  if (!(normalizedPlan in PLAN_VALUES)) {
    throw new AppError('Plano inválido para cobrança Pix', 400, 'INVALID_PLAN');
  }

  return PLAN_VALUES[normalizedPlan];
};

const addDays = (referenceDate, days) => {
  const date = new Date(referenceDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const toAsaasDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Data inválida para cobrança no Asaas', 400, 'INVALID_BILLING_DATE');
  }

  return date.toISOString().slice(0, 10);
};

const resolveBillingDescription = ({ plan, barbershopName }) => {
  const template =
    process.env.ASAAS_BILLING_DESCRIPTION ||
    'EasyBarber - Plano {plan} ({barbershop})';

  return template
    .replaceAll('{plan}', plan)
    .replaceAll('{barbershop}', barbershopName || 'Barbearia')
    .slice(0, 500);
};

const buildExternalReference = ({ barbershopId, plan }) => {
  return `barbershop:${barbershopId}:plan:${plan}`;
};

const parseAsaasDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyRegex.test(value)) {
    const parsedDateOnly = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsedDateOnly.getTime()) ? null : parsedDateOnly;
  }

  return null;
};

const addMonths = (value, months = 1) => {
  const date = value instanceof Date ? new Date(value) : parseAsaasDate(value);
  if (!date) {
    return null;
  }

  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
};

const findCustomerByExternalReference = async (externalReference) => {
  const response = await asaasClient.get('/customers', {
    query: {
      externalReference,
      limit: 1,
      offset: 0,
    },
  });

  return response?.data?.[0] || null;
};

const findMostRecentPaymentBySubscription = async (subscriptionId) => {
  const response = await asaasClient.get('/payments', {
    query: {
      subscription: subscriptionId,
      limit: 1,
      offset: 0,
      sort: 'desc',
      order: 'desc',
    },
  });

  return response?.data?.[0] || null;
};

const resolvePixQrCode = async (paymentId) => {
  try {
    return await asaasClient.get(`/payments/${paymentId}/pixQrCode`);
  } catch {
    return null;
  }
};

const resolveCustomerName = (barbershop) => {
  return barbershop?.owner_name || barbershop?.name || 'Cliente EasyBarber';
};

const resolveCustomerEmail = (barbershop) => {
  return barbershop?.email || 'cliente@easybarber.com';
};

const resolveCustomerCpfCnpj = (barbershop) => {
  const candidates = [
    barbershop?.cpf_cnpj,
    barbershop?.cpfCnpj,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDocumentDigits(candidate);
    if (isValidCpfCnpj(normalized)) {
      return normalized;
    }
  }

  return null;
};

const buildCustomerPayload = (barbershop) => {
  const name = resolveCustomerName(barbershop);
  const email = resolveCustomerEmail(barbershop);
  const mobilePhone = normalizePhoneDigits(barbershop?.whatsapp);
  const cpfCnpj = resolveCustomerCpfCnpj(barbershop);
  const externalReference = barbershop.id;

  if (!cpfCnpj) {
    throw new AppError(
      'Cadastre CPF ou CNPJ antes de gerar pagamento via PIX.',
      400,
      'CPF_CNPJ_REQUIRED'
    );
  }

  if (!mobilePhone) {
    throw new AppError(
      'Telefone da barbearia é obrigatório para pagamentos via Pix',
      400,
      'MOBILE_PHONE_REQUIRED'
    );
  }

  return {
    name,
    email,
    mobilePhone,
    cpfCnpj,
    externalReference,
    notificationDisabled: false,
  };
};

const rethrowAsaasError = (
  error,
  fallbackMessage,
  fallbackCode = 'ASAAS_REQUEST_ERROR'
) => {
  if (error instanceof AppError) {
    throw error;
  }

  const responseData = error?.response?.data;
  const asaasMessage =
    responseData?.errors?.map((item) => item.description).filter(Boolean).join(' | ') ||
    responseData?.message ||
    error?.message ||
    fallbackMessage;

  const appError = new AppError(
    asaasMessage || fallbackMessage,
    error?.response?.status || 502,
    fallbackCode
  );

  appError.details = responseData || null;
  throw appError;
};

const syncExistingCustomer = async ({
  customerId,
  payload,
  idempotencyKey,
  allowNotFound = false,
}) => {
  try {
    return await asaasClient.put(`/customers/${customerId}`, payload, {
      idempotencyKey,
    });
  } catch (error) {
    const statusCode =
      error?.statusCode ||
      error?.details?.statusCode ||
      error?.response?.status ||
      null;

    if (allowNotFound && statusCode === 404) {
      return null;
    }

    console.error('ASAAS CUSTOMER SYNC ERROR', {
      message: error?.message,
      statusCode,
      code: error?.code || null,
      details: error?.details || null,
      customerId,
      payload,
    });

    rethrowAsaasError(
      error,
      'Erro Asaas (PUT /customers/:id)',
      'ASAAS_CUSTOMER_UPDATE_ERROR'
    );
  }
};

export const asaasService = {
  resolvePlanValue,

  async createOrGetCustomer({ barbershop, idempotencyKey = null }) {
    if (!barbershop?.id) {
      throw new AppError(
        'Barbearia inválida para criação de cliente Asaas',
        400,
        'INVALID_BARBERSHOP'
      );
    }

    const payload = buildCustomerPayload(barbershop);

    if (barbershop.provider_customer_id && barbershop.provider === 'asaas') {
      const syncedCustomer = await syncExistingCustomer({
        customerId: barbershop.provider_customer_id,
        payload,
        idempotencyKey,
        allowNotFound: true,
      });

      if (syncedCustomer?.id) {
        return syncedCustomer;
      }
    }

    const externalReference = barbershop.id;

    const existing = await findCustomerByExternalReference(externalReference);
    if (existing?.id) {
      const syncedCustomer = await syncExistingCustomer({
        customerId: existing.id,
        payload,
        idempotencyKey,
      });

      return syncedCustomer || existing;
    }

    try {
      return await asaasClient.post('/customers', payload, {
        idempotencyKey,
      });
    } catch (error) {
      console.error('ASAAS CUSTOMER ERROR', {
        message: error?.message,
        statusCode: error?.statusCode || error?.status || null,
        code: error?.code || null,
        details: error?.details || null,
        payload,
      });

      rethrowAsaasError(
        error,
        'Erro Asaas (POST /customers)',
        'ASAAS_CUSTOMER_CREATE_ERROR'
      );
    }
  },

  async createPixCharge({
    customerId,
    barbershopId,
    plan,
    amount,
    dueDate,
    cpfCnpj = null,
    description,
    externalReference,
    idempotencyKey = null,
  }) {
    const resolvedAmount = typeof amount === 'number' ? amount : resolvePlanValue(plan);
    const resolvedDueDate = toAsaasDate(dueDate || addDays(new Date(), 3));
    const normalizedCpfCnpj = normalizeDocumentDigits(cpfCnpj);

    const payload = {
      customer: customerId,
      billingType: 'PIX',
      value: resolvedAmount,
      dueDate: resolvedDueDate,
      description,
      externalReference:
        externalReference || buildExternalReference({ barbershopId, plan }),
      ...(isValidCpfCnpj(normalizedCpfCnpj) ? { cpfCnpj: normalizedCpfCnpj } : {}),
    };

    try {
      return await asaasClient.post('/payments', payload, {
        idempotencyKey,
      });
    } catch (error) {
      console.error('ASAAS PAYMENT ERROR', {
        message: error?.message,
        statusCode: error?.statusCode || error?.status || null,
        code: error?.code || null,
        details: error?.details || null,
        payload,
      });

      rethrowAsaasError(
        error,
        'Erro Asaas (POST /payments)',
        'ASAAS_PIX_PAYMENT_CREATE_ERROR'
      );
    }
  },

  async createPixSubscription({
    barbershop,
    plan,
    nextDueDate,
    amount,
    idempotencyKey = null,
  }) {
    const payerCpfCnpj = resolveCustomerCpfCnpj(barbershop);

    if (!payerCpfCnpj) {
      throw new AppError(
        'Cadastre CPF ou CNPJ antes de gerar pagamento via PIX.',
        400,
        'CPF_CNPJ_REQUIRED'
      );
    }

    const customer = await this.createOrGetCustomer({
      barbershop,
      idempotencyKey,
    });

    const resolvedAmount = typeof amount === 'number' ? amount : resolvePlanValue(plan);
    const resolvedDueDate = toAsaasDate(nextDueDate || addDays(new Date(), 3));
    const description = resolveBillingDescription({
      plan,
      barbershopName: barbershop.name,
    });

    const subscriptionPayload = {
      customer: customer.id,
      billingType: 'PIX',
      cycle: 'MONTHLY',
      value: resolvedAmount,
      nextDueDate: resolvedDueDate,
      description,
      externalReference: buildExternalReference({
        barbershopId: barbershop.id,
        plan,
      }),
    };

    let subscription;

    try {
      subscription = await asaasClient.post('/subscriptions', subscriptionPayload, {
        idempotencyKey,
      });
    } catch (error) {
      console.error('ASAAS SUBSCRIPTION ERROR', {
        message: error?.message,
        statusCode: error?.statusCode || error?.status || null,
        code: error?.code || null,
        details: error?.details || null,
        payload: subscriptionPayload,
      });

      rethrowAsaasError(
        error,
        'Erro Asaas (POST /subscriptions)',
        'ASAAS_SUBSCRIPTION_CREATE_ERROR'
      );
    }

    let payment = await findMostRecentPaymentBySubscription(subscription.id);

    if (!payment) {
      payment = await this.createPixCharge({
        customerId: customer.id,
        barbershopId: barbershop.id,
        plan,
        amount: resolvedAmount,
        dueDate: resolvedDueDate,
        cpfCnpj: payerCpfCnpj,
        description,
        externalReference: buildExternalReference({
          barbershopId: barbershop.id,
          plan,
        }),
        idempotencyKey: `${idempotencyKey || 'pix'}:fallback-payment`,
      });
    }

    const pixQrCode = payment?.id ? await resolvePixQrCode(payment.id) : null;
    const pixData = asaasMapper.mapAsaasPaymentToPixData(payment, pixQrCode);

    return {
      customer,
      subscription,
      payment,
      pixQrCode,
      pixData,
    };
  },

  async getPayment(paymentId) {
    if (!paymentId) {
      throw new AppError('paymentId é obrigatório', 400, 'INVALID_PAYMENT');
    }

    try {
      return await asaasClient.get(`/payments/${paymentId}`);
    } catch (error) {
      console.error('ASAAS GET PAYMENT ERROR', {
        message: error?.message,
        statusCode: error?.statusCode || error?.status || null,
        code: error?.code || null,
        details: error?.details || null,
        paymentId,
      });

      rethrowAsaasError(
        error,
        'Erro Asaas (GET /payments/:id)',
        'ASAAS_PAYMENT_FETCH_ERROR'
      );
    }
  },

  async getPaymentWithPixData(paymentId) {
    const payment = await this.getPayment(paymentId);
    const pixQrCode = await resolvePixQrCode(paymentId);
    const pixData = asaasMapper.mapAsaasPaymentToPixData(payment, pixQrCode);

    return {
      payment,
      pixQrCode,
      pixData,
    };
  },

  async cancelSubscription(subscriptionId) {
    if (!subscriptionId) {
      throw new AppError('subscriptionId é obrigatório', 400, 'INVALID_SUBSCRIPTION');
    }

    try {
      await asaasClient.delete(`/subscriptions/${subscriptionId}`);
    } catch (error) {
      console.error('ASAAS CANCEL SUBSCRIPTION ERROR', {
        message: error?.message,
        statusCode: error?.statusCode || error?.status || null,
        code: error?.code || null,
        details: error?.details || null,
        subscriptionId,
      });

      rethrowAsaasError(
        error,
        'Erro Asaas (DELETE /subscriptions/:id)',
        'ASAAS_SUBSCRIPTION_CANCEL_ERROR'
      );
    }

    return {
      canceled: true,
      subscriptionId,
    };
  },

  async reactivateSubscription(subscriptionId) {
    if (!subscriptionId) {
      throw new AppError('subscriptionId é obrigatório', 400, 'INVALID_SUBSCRIPTION');
    }

    try {
      const restored = await asaasClient.post(
        `/subscriptions/${subscriptionId}/restore`,
        {},
        {
          idempotencyKey: `restore:${subscriptionId}`,
        }
      );

      return {
        restored: true,
        subscription: restored,
      };
    } catch (error) {
      console.error('ASAAS REACTIVATE SUBSCRIPTION ERROR', {
        message: error?.message,
        statusCode: error?.statusCode || error?.status || null,
        code: error?.code || null,
        details: error?.details || null,
        subscriptionId,
      });

      throw new AppError(
        'Não foi possível reativar a assinatura Pix no Asaas automaticamente',
        409,
        'ASAAS_REACTIVATE_UNAVAILABLE'
      );
    }
  },

  resolveBillingPeriodFromPayment(payment) {
    const paidAt = parseAsaasDate(
      payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate
    );

    if (!paidAt) {
      return {
        periodStart: null,
        periodEnd: null,
      };
    }

    return {
      periodStart: paidAt,
      periodEnd: addMonths(paidAt, 1),
    };
  },
};