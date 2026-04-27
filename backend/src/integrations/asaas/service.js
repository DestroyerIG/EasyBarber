import { AppError } from '../../utils/errors.js';
import {
  isValidCpf as validateCpf,
  isValidCnpj as validateCnpj,
  isValidCpfCnpj as validateCpfCnpj,
  normalizeDocumentDigits,
} from '../../utils/cpfCnpj.js';
import logger from '../../utils/logger.js';
import { asaasClient } from './client.js';
import { asaasMapper } from './mapper.js';

const PLAN_VALUES = Object.freeze({
  basico: 49.9,
  profissional: 99.9,
  premium: 199.9,
});

const GENERIC_CUSTOMER_NAMES = new Set([
  'equipe easybarber',
  'equipe easy barber',
  'easybarber',
  'easy barber',
]);

const DUPLICATE_CUSTOMER_ERROR_HINTS = [
  'already exists',
  'já existe',
  'ja existe',
  'duplic',
  'cpf já cadastrado',
  'cpf ja cadastrado',
  'cnpj já cadastrado',
  'cnpj ja cadastrado',
  'external reference',
  'documento já cadastrado',
  'documento ja cadastrado',
];

const parseJsonSafely = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
};

const safeJSONStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const normalizeText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
};

const maskDigitsTail = (value, visibleDigits = 4) => {
  if (value === undefined || value === null) {
    return null;
  }

  const digits = String(value).replace(/\D+/g, '');
  if (!digits) {
    return '***';
  }

  if (digits.length <= visibleDigits) {
    return digits;
  }

  return `${'*'.repeat(Math.max(0, digits.length - visibleDigits))}${digits.slice(-visibleDigits)}`;
};

const maskEmail = (value) => {
  if (typeof value !== 'string') {
    return value || null;
  }

  const normalized = value.trim();
  const atIndex = normalized.indexOf('@');

  if (atIndex <= 0) {
    return normalized;
  }

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  if (!domain) {
    return `${local.slice(0, 1) || '*'}***`;
  }

  const maskedLocal = `${local.slice(0, 1) || '*'}***`;

  return `${maskedLocal}@${domain}`;
};

const maskSensitiveByKey = (key, value) => {
  const normalizedKey = String(key || '').toLowerCase();

  if (normalizedKey.includes('email')) {
    return maskEmail(value);
  }

  if (
    normalizedKey.includes('cpf') ||
    normalizedKey.includes('cnpj') ||
    normalizedKey.includes('phone') ||
    normalizedKey.includes('whatsapp') ||
    normalizedKey.includes('mobile')
  ) {
    return maskDigitsTail(value);
  }

  return value;
};

const maskSensitiveData = (value, key = '') => {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        maskSensitiveData(entryValue, entryKey),
      ])
    );
  }

  return maskSensitiveByKey(key, value);
};

const removeEmptyFields = (payload = {}) => {
  return Object.fromEntries(
    Object.entries(payload)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => {
        if (value === null || value === undefined) {
          return false;
        }

        if (typeof value === 'string') {
          return value.length > 0;
        }

        return true;
      })
  );
};

const extractAsaasErrors = (responseBody) => {
  if (Array.isArray(responseBody?.errors)) {
    return responseBody.errors;
  }

  if (Array.isArray(responseBody?.error)) {
    return responseBody.error;
  }

  return [];
};

const buildAsaasErrorContext = (
  error,
  { method = null, path = null, requestPayload = null } = {}
) => {
  const details = error?.details || {};
  const providerData = error?.providerData || null;
  const responseTextFromProvider =
    typeof providerData?.responseText === 'string'
      ? providerData.responseText
      : null;
  const responseTextFromDetails =
    typeof details?.responseText === 'string'
      ? details.responseText
      : null;
  const responseTextFromResponseData =
    typeof error?.response?.data === 'string'
      ? error.response.data
      : null;
  const responseText =
    responseTextFromProvider ||
    responseTextFromDetails ||
    responseTextFromResponseData ||
    null;
  const responsePayloadFromString = parseJsonSafely(responseText);
  const responseBody =
    providerData?.payload ||
    error?.response?.data ||
    details?.payload ||
    responsePayloadFromString ||
    (responseText ? { rawBody: responseText } : null);
  const responseJson =
    providerData?.responseJson ||
    (responseBody && typeof responseBody === 'object' && !Object.prototype.hasOwnProperty.call(responseBody, 'rawBody')
      ? responseBody
      : responsePayloadFromString) ||
    null;
  const responseBodyRaw =
    responseText ||
    (responseJson ? safeJSONStringify(responseJson) : null);
  const responseHeaders =
    providerData?.responseHeaders ||
    error?.response?.headers ||
    details?.responseHeaders ||
    null;
  const parsedRequestBody = parseJsonSafely(details?.requestBody);
  const resolvedRequestPayload =
    requestPayload ||
    providerData?.requestPayload ||
    parsedRequestBody ||
    details?.requestBody ||
    null;

  return {
    provider: 'asaas',
    statusCode:
      error?.providerStatus ||
      error?.response?.status ||
      details?.statusCode ||
      error?.statusCode ||
      null,
    method: providerData?.method || details?.method || method,
    path: providerData?.path || details?.path || path,
    url: providerData?.url || details?.url || null,
    requestPayload: resolvedRequestPayload,
    responseText: responseBodyRaw,
    responseBody,
    responseJson,
    responseHeaders,
    responseErrors: providerData?.errors || extractAsaasErrors(responseJson || responseBody),
  };
};

const isDuplicateCustomerError = (errorContext) => {
  const statusCode = Number(errorContext?.statusCode || 0);
  if (statusCode !== 400 && statusCode !== 409) {
    return false;
  }

  const responseErrors = Array.isArray(errorContext?.responseErrors)
    ? errorContext.responseErrors
    : [];
  const errorCodes = responseErrors
    .map((item) => String(item?.code || '').toLowerCase())
    .filter(Boolean);

  if (
    errorCodes.some(
      (code) =>
        code.includes('already') ||
        code.includes('exists') ||
        code.includes('duplicate') ||
        code.includes('document')
    )
  ) {
    return true;
  }

  const messageChunks = [
    errorContext?.responseBody?.message,
    ...responseErrors.map((item) => item?.description || item?.message || null),
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();

  return DUPLICATE_CUSTOMER_ERROR_HINTS.some((hint) => messageChunks.includes(hint));
};

const onlyNumbers = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const digits = String(value).replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
};

const normalizeBrazilPhone = (value) => {
  const digits = onlyNumbers(value);

  if (!digits) {
    return null;
  }

  const nationalDigits =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  return nationalDigits.length === 10 || nationalDigits.length === 11
    ? nationalDigits
    : null;
};

const isValidCpf = (value) => {
  const digits = onlyNumbers(value);
  return digits ? validateCpf(digits) : false;
};

const isValidCnpj = (value) => {
  const digits = onlyNumbers(value);
  return digits ? validateCnpj(digits) : false;
};

const isValidCpfCnpj = (value) => {
  const digits = onlyNumbers(value);
  return digits ? validateCpfCnpj(digits) : false;
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

const findCustomerByCpfCnpj = async (cpfCnpj) => {
  if (!cpfCnpj) {
    return null;
  }

  const response = await asaasClient.get('/customers', {
    query: {
      cpfCnpj,
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

const resolveCustomerNameCandidates = (barbershop) => {
  return [
    barbershop?.owner_name,
    barbershop?.ownerName,
    barbershop?.responsible_name,
    barbershop?.responsibleName,
    barbershop?.metadata?.ownerName,
    barbershop?.metadata?.responsibleName,
    barbershop?.name,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
};

const isGenericCustomerName = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return GENERIC_CUSTOMER_NAMES.has(normalized);
};

const resolveCustomerName = (barbershop) => {
  const candidates = resolveCustomerNameCandidates(barbershop);
  if (candidates.length === 0) {
    return null;
  }

  const nonGeneric = candidates.find((value) => !isGenericCustomerName(value));
  const resolved = nonGeneric || candidates[0];

  return resolved.length >= 3 ? resolved : null;
};

const isValidPublicEmail = (email) => {
  if (typeof email !== 'string') {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicEmailRegex.test(normalizedEmail)) {
    return false;
  }

  const [, domain = ''] = normalizedEmail.split('@');
  if (!domain || domain.endsWith('.local')) {
    return false;
  }

  if (/^example(\.|-)/i.test(domain) || domain === 'example') {
    return false;
  }

  return true;
};

const resolveCustomerEmail = (barbershop) => {
  const candidate = typeof barbershop?.email === 'string' ? barbershop.email.trim() : '';
  return isValidPublicEmail(candidate) ? candidate.toLowerCase() : null;
};

const resolveCustomerExternalReference = (barbershop) => {
  const candidates = [
    barbershop?.id,
    barbershop?.tenantId,
    barbershop?.tenant_id,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolveSavedAsaasCustomerId = (barbershop) => {
  const normalizedProvider = String(barbershop?.provider || '').trim().toLowerCase();
  const normalizedPaymentMethod = String(barbershop?.payment_method || '').trim().toLowerCase();
  const canTrustProviderCustomerId =
    normalizedProvider === 'asaas' || normalizedPaymentMethod === 'pix';

  const candidates = [
    canTrustProviderCustomerId ? barbershop?.provider_customer_id : null,
    barbershop?.asaas_customer_id,
    barbershop?.asaasCustomerId,
    barbershop?.customer_id,
    barbershop?.customerId,
    barbershop?.metadata?.asaas?.customerId,
    barbershop?.metadata?.billing?.asaas?.customerId,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolveCustomerCpfCnpjInput = (barbershop) => {
  const candidates = [
    barbershop?.cpf_cnpj,
    barbershop?.cpfCnpj,
    barbershop?.document,
    barbershop?.documentNumber,
    barbershop?.metadata?.cpfCnpj,
    barbershop?.metadata?.document,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDocumentDigits(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const validateCustomerCpfCnpjOrThrow = (cpfCnpj) => {
  if (!cpfCnpj) {
    throw new AppError(
      'CPF/CNPJ obrigatório para pagamento via Pix.',
      400,
      'CPF_CNPJ_REQUIRED'
    );
  }

  const length = cpfCnpj.length;
  if (length !== 11 && length !== 14) {
    throw new AppError(
      'CPF/CNPJ inválido. Verifique os dados cadastrais.',
      400,
      'INVALID_CPF_CNPJ'
    );
  }

  if (!isValidCpfCnpj(cpfCnpj)) {
    throw new AppError(
      'CPF/CNPJ inválido. Verifique os dados cadastrais.',
      400,
      'INVALID_CPF_CNPJ'
    );
  }
};

const buildCustomerPayload = (barbershop) => {
  const name = resolveCustomerName(barbershop);
  const email = resolveCustomerEmail(barbershop);
  const mobilePhone = normalizeBrazilPhone(
    barbershop?.whatsapp || barbershop?.phone || barbershop?.mobile_phone
  );
  const cpfCnpj = resolveCustomerCpfCnpjInput(barbershop);
  const externalReference = resolveCustomerExternalReference(barbershop);
  const notificationDisabledCandidates = [
    barbershop?.notificationDisabled,
    barbershop?.metadata?.asaas?.notificationDisabled,
    barbershop?.metadata?.billing?.asaas?.notificationDisabled,
  ];
  const notificationDisabled = notificationDisabledCandidates.find(
    (value) => typeof value === 'boolean'
  );

  if (!name) {
    throw new AppError(
      'Nome é obrigatório para pagamento via Pix.',
      400,
      'CUSTOMER_NAME_REQUIRED'
    );
  }

  if (name.length < 3) {
    throw new AppError(
      'Nome é obrigatório para pagamento via Pix.',
      400,
      'CUSTOMER_NAME_REQUIRED'
    );
  }

  validateCustomerCpfCnpjOrThrow(cpfCnpj);

  if (!mobilePhone) {
    throw new AppError(
      'Telefone/WhatsApp inválido. Verifique os dados cadastrais.',
      400,
      'MOBILE_PHONE_INVALID'
    );
  }

  return removeEmptyFields({
    name,
    cpfCnpj,
    mobilePhone,
    ...(email ? { email } : {}),
    ...(externalReference ? { externalReference } : {}),
    ...(typeof notificationDisabled === 'boolean'
      ? { notificationDisabled }
      : {}),
  });
};

const rethrowAsaasError = (
  error,
  fallbackMessage,
  fallbackCode = 'ASAAS_REQUEST_ERROR',
  contextOptions = {}
) => {
  const providerContext = buildAsaasErrorContext(error, contextOptions);
  const responseData =
    providerContext.responseBody ||
    (providerContext.responseText ? { rawBody: providerContext.responseText } : null);
  const responseHeaders = providerContext.responseHeaders || null;
  const responseErrors = providerContext.responseErrors || [];
  const asaasMessage =
    responseErrors.map((item) => item?.description || item?.message).filter(Boolean).join(' | ') ||
    (typeof responseData === 'string' ? responseData : null) ||
    responseData?.message ||
    error?.message ||
    fallbackMessage;

  const appError = new AppError(
    asaasMessage || fallbackMessage,
    providerContext.statusCode || 502,
    fallbackCode
  );

  appError.details = maskSensitiveData(responseData) || null;
  appError.providerStatus = providerContext.statusCode || null;
  appError.providerData = {
    provider: providerContext.provider,
    method: providerContext.method || contextOptions.method || null,
    path: providerContext.path || contextOptions.path || null,
    url: providerContext.url || null,
    statusCode: providerContext.statusCode || null,
    requestBody: maskSensitiveData(providerContext.requestPayload),
    requestPayload: maskSensitiveData(providerContext.requestPayload),
    payload: maskSensitiveData(responseData),
    responseText: providerContext.responseText || null,
    responseJson: maskSensitiveData(providerContext.responseJson),
    errors: maskSensitiveData(responseErrors),
    responseHeaders: providerContext.responseHeaders || null,
  };
  appError.providerHeaders = responseHeaders || null;
  throw appError;
};

const syncExistingCustomer = async ({
  customerId,
  payload,
  idempotencyKey,
  allowNotFound = false,
}) => {
  logger.debug(
    {
      code: 'ASAAS_CUSTOMER_UPDATE_REQUEST',
      customerId,
      payload: maskSensitiveData(payload),
    },
    'ASAAS CUSTOMER PAYLOAD'
  );

  try {
    return await asaasClient.put(`/customers/${customerId}`, payload, {
      idempotencyKey,
    });
  } catch (error) {
    const providerContext = buildAsaasErrorContext(error, {
      method: 'PUT',
      path: '/customers/:id',
      requestPayload: payload,
    });
    const statusCode = providerContext.statusCode;

    if (allowNotFound && statusCode === 404) {
      return null;
    }

    logger.error(
      {
        message: error?.message,
        provider: providerContext.provider,
        statusCode,
        method: providerContext.method,
        path: providerContext.path,
        url: providerContext.url,
        providerStatus: statusCode,
        requestBody: maskSensitiveData(payload),
        requestPayload: maskSensitiveData(payload),
        responseBodyRaw: providerContext.responseText,
        responseJson: maskSensitiveData(providerContext.responseJson),
        responseBody: maskSensitiveData(providerContext.responseBody),
        responseErrors: maskSensitiveData(providerContext.responseErrors),
        providerHeaders: providerContext.responseHeaders,
        code: error?.code || 'ASAAS_CUSTOMER_UPDATE_ERROR',
        customerId,
      },
      'ASAAS CUSTOMER SYNC ERROR'
    );

    rethrowAsaasError(
      error,
      'Erro Asaas (PUT /customers/:id)',
      'ASAAS_CUSTOMER_UPDATE_ERROR',
      {
        method: 'PUT',
        path: '/customers/:id',
        requestPayload: payload,
      }
    );
  }
};

export const asaasService = {
  onlyNumbers,
  normalizeBrazilPhone,
  isValidCpf,
  isValidCnpj,
  isValidPublicEmail,
  isValidCpfCnpj,
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

    logger.info(
      {
        event: 'asaas_customer_payload_prepared',
        barbershopId: barbershop.id,
        payload: maskSensitiveData(payload),
      },
      'Payload de cliente Asaas preparado'
    );

    const savedCustomerId = resolveSavedAsaasCustomerId(barbershop);

    if (savedCustomerId) {
      const syncedCustomer = await syncExistingCustomer({
        customerId: savedCustomerId,
        payload,
        idempotencyKey,
        allowNotFound: true,
      });

      if (syncedCustomer?.id) {
        logger.info(
          {
            event: 'asaas_customer_reuse',
            source: 'saved_customer_id',
            barbershopId: barbershop.id,
            customerId: syncedCustomer.id,
          },
          'Cliente Asaas reutilizado'
        );

        return syncedCustomer;
      }
    }

    const externalReference = payload.externalReference || resolveCustomerExternalReference(barbershop);

    if (externalReference) {
      try {
        const existingByReference = await findCustomerByExternalReference(externalReference);
        if (existingByReference?.id) {
          const syncedCustomer = await syncExistingCustomer({
            customerId: existingByReference.id,
            payload,
            idempotencyKey,
          });

          const reusedCustomer = syncedCustomer || existingByReference;

          logger.info(
            {
              event: 'asaas_customer_reuse',
              source: 'external_reference',
              barbershopId: barbershop.id,
              customerId: reusedCustomer.id,
            },
            'Cliente Asaas reutilizado'
          );

          return reusedCustomer;
        }
      } catch (lookupError) {
        logger.warn(
          {
            event: 'asaas_customer_lookup_warning',
            source: 'external_reference',
            barbershopId: barbershop.id,
            externalReference,
            message: lookupError?.message,
          },
          'Falha ao buscar cliente Asaas por externalReference'
        );
      }
    }

    if (payload.cpfCnpj) {
      try {
        const existingByDocument = await findCustomerByCpfCnpj(payload.cpfCnpj);
        if (existingByDocument?.id) {
          const syncedCustomer = await syncExistingCustomer({
            customerId: existingByDocument.id,
            payload,
            idempotencyKey,
          });

          const reusedCustomer = syncedCustomer || existingByDocument;

          logger.info(
            {
              event: 'asaas_customer_reuse',
              source: 'cpf_cnpj',
              barbershopId: barbershop.id,
              customerId: reusedCustomer.id,
            },
            'Cliente Asaas reutilizado'
          );

          return reusedCustomer;
        }
      } catch (lookupError) {
        logger.warn(
          {
            event: 'asaas_customer_lookup_warning',
            source: 'cpf_cnpj',
            barbershopId: barbershop.id,
            message: lookupError?.message,
            cpfCnpj: maskDigitsTail(payload.cpfCnpj),
          },
          'Falha ao buscar cliente Asaas por CPF/CNPJ'
        );
      }
    }

    logger.info(
      {
        event: 'asaas_customer_create_start',
        barbershopId: barbershop.id,
        method: 'POST',
        path: '/customers',
        payload: maskSensitiveData(payload),
      },
      'Iniciando criacao de cliente Asaas'
    );

    try {
      const createdCustomer = await asaasClient.post('/customers', payload, {
        idempotencyKey,
      });

      logger.info(
        {
          event: 'asaas_customer_create_success',
          barbershopId: barbershop.id,
          customerId: createdCustomer?.id || null,
          externalReference: payload.externalReference || null,
        },
        'Cliente Asaas criado com sucesso'
      );

      return createdCustomer;
    } catch (error) {
      const providerContext = buildAsaasErrorContext(error, {
        method: 'POST',
        path: '/customers',
        requestPayload: payload,
      });

      if (isDuplicateCustomerError(providerContext)) {
        let duplicatedCustomer = null;

        if (externalReference) {
          try {
            duplicatedCustomer = await findCustomerByExternalReference(externalReference);
          } catch {
            duplicatedCustomer = null;
          }
        }

        if (!duplicatedCustomer?.id && payload.cpfCnpj) {
          try {
            duplicatedCustomer = await findCustomerByCpfCnpj(payload.cpfCnpj);
          } catch {
            duplicatedCustomer = null;
          }
        }

        if (duplicatedCustomer?.id) {
          const syncedCustomer = await syncExistingCustomer({
            customerId: duplicatedCustomer.id,
            payload,
            idempotencyKey,
          });

          const reusedCustomer = syncedCustomer || duplicatedCustomer;

          logger.info(
            {
              event: 'asaas_customer_reuse',
              source: 'duplicate_error_recovery',
              barbershopId: barbershop.id,
              customerId: reusedCustomer.id,
            },
            'Cliente Asaas reutilizado apos erro de duplicidade'
          );

          return reusedCustomer;
        }
      }

      logger.error(
        {
          event: 'asaas_customer_create_error',
          barbershopId: barbershop.id,
          message: error?.message,
          provider: providerContext.provider,
          statusCode: providerContext.statusCode,
          method: providerContext.method,
          path: providerContext.path,
          url: providerContext.url,
          requestBody: maskSensitiveData(providerContext.requestPayload),
          requestPayload: maskSensitiveData(providerContext.requestPayload),
          responseBodyRaw: providerContext.responseText,
          responseJson: maskSensitiveData(providerContext.responseJson),
          responseBody: maskSensitiveData(providerContext.responseBody),
          responseErrors: maskSensitiveData(providerContext.responseErrors),
          providerHeaders: providerContext.responseHeaders,
          code: error?.code || 'ASAAS_CUSTOMER_CREATE_ERROR',
        },
        'Falha ao criar cliente Asaas'
      );

      rethrowAsaasError(
        error,
        'Erro Asaas (POST /customers)',
        'ASAAS_CUSTOMER_CREATE_ERROR',
        {
          method: 'POST',
          path: '/customers',
          requestPayload: payload,
        }
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

    logger.info(
      {
        event: 'asaas_pix_payment_create_start',
        barbershopId,
        method: 'POST',
        path: '/payments',
        payload: maskSensitiveData(payload),
      },
      'Iniciando criacao de cobranca Pix no Asaas'
    );

    try {
      const createdPayment = await asaasClient.post('/payments', payload, {
        idempotencyKey,
      });

      logger.info(
        {
          event: 'asaas_pix_payment_create_success',
          barbershopId,
          paymentId: createdPayment?.id || null,
          status: createdPayment?.status || null,
        },
        'Cobranca Pix criada no Asaas'
      );

      return createdPayment;
    } catch (error) {
      const providerContext = buildAsaasErrorContext(error, {
        method: 'POST',
        path: '/payments',
        requestPayload: payload,
      });

      logger.error(
        {
          message: error?.message,
          provider: providerContext.provider,
          statusCode: providerContext.statusCode,
          method: providerContext.method,
          path: providerContext.path,
          url: providerContext.url,
          requestBody: maskSensitiveData(providerContext.requestPayload),
          requestPayload: maskSensitiveData(providerContext.requestPayload),
          responseBodyRaw: providerContext.responseText,
          responseJson: maskSensitiveData(providerContext.responseJson),
          responseBody: maskSensitiveData(providerContext.responseBody),
          responseErrors: maskSensitiveData(providerContext.responseErrors),
          providerHeaders: providerContext.responseHeaders,
          code: error?.code || 'ASAAS_PIX_PAYMENT_CREATE_ERROR',
        },
        'ASAAS PAYMENT ERROR'
      );

      rethrowAsaasError(
        error,
        'Erro Asaas (POST /payments)',
        'ASAAS_PIX_PAYMENT_CREATE_ERROR',
        {
          method: 'POST',
          path: '/payments',
          requestPayload: payload,
        }
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
    const payerCpfCnpj = resolveCustomerCpfCnpjInput(barbershop);

    validateCustomerCpfCnpjOrThrow(payerCpfCnpj);

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
      logger.error(
        {
          message: error?.message,
          statusCode: error?.statusCode || error?.status || null,
          providerStatus: error?.response?.status || error?.statusCode || error?.status || null,
          providerData: error?.response?.data || error?.details || null,
          providerHeaders: error?.response?.headers || error?.details?.responseHeaders || null,
          code: error?.code || 'ASAAS_SUBSCRIPTION_CREATE_ERROR',
          details: error?.details || null,
          payload: subscriptionPayload,
        },
        'ASAAS SUBSCRIPTION ERROR'
      );

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
      logger.error(
        {
          message: error?.message,
          statusCode: error?.statusCode || error?.status || null,
          providerStatus: error?.response?.status || error?.statusCode || error?.status || null,
          providerData: error?.response?.data || error?.details || null,
          providerHeaders: error?.response?.headers || error?.details?.responseHeaders || null,
          code: error?.code || 'ASAAS_PAYMENT_FETCH_ERROR',
          details: error?.details || null,
          paymentId,
        },
        'ASAAS GET PAYMENT ERROR'
      );

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
      logger.error(
        {
          message: error?.message,
          statusCode: error?.statusCode || error?.status || null,
          providerStatus: error?.response?.status || error?.statusCode || error?.status || null,
          providerData: error?.response?.data || error?.details || null,
          providerHeaders: error?.response?.headers || error?.details?.responseHeaders || null,
          code: error?.code || 'ASAAS_SUBSCRIPTION_CANCEL_ERROR',
          details: error?.details || null,
          subscriptionId,
        },
        'ASAAS CANCEL SUBSCRIPTION ERROR'
      );

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
      logger.error(
        {
          message: error?.message,
          statusCode: error?.statusCode || error?.status || null,
          providerStatus: error?.response?.status || error?.statusCode || error?.status || null,
          providerData: error?.response?.data || error?.details || null,
          providerHeaders: error?.response?.headers || error?.details?.responseHeaders || null,
          code: error?.code || 'ASAAS_REACTIVATE_UNAVAILABLE',
          details: error?.details || null,
          subscriptionId,
        },
        'ASAAS REACTIVATE SUBSCRIPTION ERROR'
      );

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
