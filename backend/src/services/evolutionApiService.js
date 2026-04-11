import logger from '../utils/logger.js';
import { normalizePhoneForSend } from '../utils/whatsapp.js';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_ATTEMPTS = 1;
const MAX_RETRY_ATTEMPTS = 3;

class EvolutionApiError extends Error {
  constructor(message, { status = null, details = null, code = 'EVOLUTION_API_ERROR' } = {}) {
    super(message);
    this.name = 'EvolutionApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

const getConfig = () => {
  const baseURL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY || '';
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'easybarber';
  const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL || '';
  const timeoutFromEnv = Number.parseInt(
    process.env.EVOLUTION_API_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
    10
  );
  const retryFromEnv = Number.parseInt(
    process.env.EVOLUTION_API_RETRY_ATTEMPTS || String(DEFAULT_RETRY_ATTEMPTS),
    10
  );

  const timeoutMs = Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
    ? timeoutFromEnv
    : DEFAULT_TIMEOUT_MS;

  const retryAttempts = Number.isFinite(retryFromEnv)
    ? Math.min(Math.max(retryFromEnv, 0), MAX_RETRY_ATTEMPTS)
    : DEFAULT_RETRY_ATTEMPTS;

  return {
    baseURL,
    apiKey,
    instanceName,
    webhookUrl,
    timeoutMs,
    retryAttempts,
  };
};

const ensureConfigured = () => {
  const { baseURL, apiKey } = getConfig();

  if (!baseURL) {
    throw new EvolutionApiError('EVOLUTION_API_URL nao configurada', {
      code: 'EVOLUTION_CONFIG_ERROR',
    });
  }

  if (!apiKey) {
    throw new EvolutionApiError('EVOLUTION_API_KEY nao configurada', {
      code: 'EVOLUTION_CONFIG_ERROR',
    });
  }
};

const normalizePath = (path) => (path.startsWith('/') ? path : `/${path}`);

const buildHeaders = () => {
  const { apiKey } = getConfig();

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    apikey: apiKey,
  };
};

const parseResponseBody = async (response) => {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const flattenMessages = (value) => {
  if (!Array.isArray(value)) return [];
  return value.flat(Infinity).filter(Boolean).map(String);
};

const extractErrorMessage = (payload) => {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload?.message === 'string') return payload.message;

  const messageList = flattenMessages(payload?.message);
  if (messageList.length) return messageList.join(' | ');

  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;

  const responseMessageList = flattenMessages(payload?.response?.message);
  if (responseMessageList.length) return responseMessageList.join(' | ');

  return null;
};

const safeStringify = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const getProviderErrorMessage = (error = null) => {
  if (!error) return '';

  const chunks = [];

  if (typeof error?.message === 'string' && error.message.trim()) {
    chunks.push(error.message.trim());
  }

  const detailMessage = extractErrorMessage(error?.details);
  if (detailMessage) {
    chunks.push(detailMessage);
  } else if (error?.details) {
    const serializedDetails = safeStringify(error.details).trim();
    if (serializedDetails) {
      chunks.push(serializedDetails);
    }
  }

  if (!chunks.length) {
    return '';
  }

  return Array.from(new Set(chunks)).join(' | ');
};

export const isSessionStateError = (error = null) => {
  if (!error) return false;
  if (error?.sessionStateError === true) return true;
  if (error?.code === 'EVOLUTION_SESSION_STATE_ERROR') return true;

  const status = Number(error?.status || 0);
  const providerError = getProviderErrorMessage(error).toLowerCase();

  if (!providerError && !status) {
    return false;
  }

  const hasNotAcceptable = providerError.includes('not-acceptable');
  const hasPreKeyError =
    providerError.includes('prekeyerror') || providerError.includes('invalid prekey id');
  const hasStreamError =
    providerError.includes('stream:error') || providerError.includes('stream error');
  const hasInitQueriesBadRequest =
    (providerError.includes('bad-request') || providerError.includes('bad request')) &&
    providerError.includes('init quer');
  const hasUnexpectedLogout =
    providerError.includes('logout') || providerError.includes('loggedout');

  if (status === 400 && hasNotAcceptable) {
    return true;
  }

  return (
    hasPreKeyError ||
    hasStreamError ||
    hasInitQueriesBadRequest ||
    hasUnexpectedLogout ||
    hasNotAcceptable
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetriableStatus = (status) => [408, 429, 500, 502, 503, 504].includes(status);

const request = async ({ method, path, body = undefined, expectedStatuses = [200, 201] }) => {
  ensureConfigured();

  const { baseURL, timeoutMs, retryAttempts } = getConfig();
  const url = `${baseURL}${normalizePath(path)}`;
  const maxAttempts = retryAttempts + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.debug(
        {
          method,
          url,
          hasBody: body !== undefined,
          bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
          attempt,
          maxAttempts,
        },
        'Evolution API request'
      );

      const response = await fetch(url, {
        method,
        headers: buildHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await parseResponseBody(response);

      if (!expectedStatuses.includes(response.status)) {
        const message = extractErrorMessage(payload) || `Evolution API respondeu com status ${response.status}`;
        const apiError = new EvolutionApiError(message, {
          status: response.status,
          details: payload,
        });

        if (attempt < maxAttempts && isRetriableStatus(response.status)) {
          logger.warn(
            {
              status: response.status,
              method,
              url,
              attempt,
              maxAttempts,
            },
            'Erro transiente na Evolution API, tentando novamente'
          );
          lastError = apiError;
          await sleep(250 * attempt);
          continue;
        }

        logger.error(
          {
            status: response.status,
            payload,
            url,
            method,
            attempt,
          },
          'Erro na Evolution API'
        );

        throw apiError;
      }

      return payload;
    } catch (error) {
      const normalizedError =
        error?.name === 'AbortError'
          ? new EvolutionApiError('Timeout ao chamar Evolution API', {
              code: 'EVOLUTION_TIMEOUT',
            })
          : error instanceof EvolutionApiError
            ? error
            : new EvolutionApiError(error?.message || 'Falha de comunicacao com Evolution API', {
                code: 'EVOLUTION_NETWORK_ERROR',
              });

      const shouldRetry =
        attempt < maxAttempts &&
        (
          normalizedError.code === 'EVOLUTION_TIMEOUT' ||
          normalizedError.code === 'EVOLUTION_NETWORK_ERROR' ||
          isRetriableStatus(normalizedError.status || 0)
        );

      if (shouldRetry) {
        logger.warn(
          {
            code: normalizedError.code,
            status: normalizedError.status,
            method,
            url,
            attempt,
            maxAttempts,
          },
          'Falha transiente ao chamar Evolution API, tentando novamente'
        );
        lastError = normalizedError;
        await sleep(250 * attempt);
        continue;
      }

      throw normalizedError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new EvolutionApiError('Falha de comunicacao com Evolution API', {
    code: 'EVOLUTION_NETWORK_ERROR',
  });
};

const requestWithFallback = async (candidates, operationName, fallbackStatuses = [404, 405, 501]) => {
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await request(candidate);
    } catch (error) {
      lastError = error;

      if (error instanceof EvolutionApiError && fallbackStatuses.includes(error.status || 0)) {
        logger.debug(
          {
            operationName,
            method: candidate.method,
            path: candidate.path,
            status: error.status,
          },
          'Endpoint fallback da Evolution API'
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError || new EvolutionApiError(`${operationName} indisponivel`);
};

const requestTryingPayloads = async (
  candidates,
  operationName,
  fallbackStatuses = [400, 409, 415, 422],
  options = {}
) => {
  const includeMeta = Boolean(options?.includeMeta);
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const payloadShape = describePayloadShape(candidate?.body);

    try {
      const payload = await request(candidate);

      if (includeMeta) {
        return {
          payload,
          payloadShape,
          candidate,
          candidateIndex: index,
        };
      }

      return payload;
    } catch (error) {
      lastError = error;

      if (
        error instanceof EvolutionApiError &&
        fallbackStatuses.includes(error.status || 0)
      ) {
        logger.debug(
          {
            operationName,
            method: candidate.method,
            path: candidate.path,
            status: error.status,
            bodyKeys: candidate?.body ? Object.keys(candidate.body) : [],
            payloadShape,
          },
          'Tentando proximo payload da Evolution API'
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError || new EvolutionApiError(`${operationName} indisponivel`);
};

const describePayloadShape = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'empty';
  }

  const keys = Object.keys(body).sort();

  if (keys.includes('instanceName') && keys.includes('number') && keys.includes('textMessage')) {
    return 'instanceName+number+textMessage';
  }

  if (keys.includes('number') && keys.includes('textMessage')) {
    return 'number+textMessage';
  }

  return keys.join('+') || 'empty';
};

const filterIncompatibleSendTextCandidates = (candidates = [], context = {}) => {
  const filtered = [];

  for (const candidate of candidates) {
    const rawDestination = candidate?.body?.number;
    const normalizedDestination = normalizePhoneForSend(rawDestination);

    if (!normalizedDestination) {
      logger.warn(
        {
          endpoint: candidate?.path || null,
          payloadShape: describePayloadShape(candidate?.body),
          phone: context?.phone || null,
          remoteJidOriginal: context?.remoteJidOriginal || null,
          resolvedDestination: null,
        },
        'Payload de envio Evolution descartado: destino incompatível'
      );
      continue;
    }

    filtered.push({
      ...candidate,
      body: {
        ...(candidate.body || {}),
        number: normalizedDestination,
      },
    });
  }

  return filtered;
};

const unwrapInstancesList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.instances)) return payload.instances;
  return [];
};

export const getEvolutionConfig = () => {
  const { baseURL, instanceName, webhookUrl, timeoutMs, retryAttempts } = getConfig();

  return {
    baseURL,
    instanceName,
    webhookUrl,
    timeoutMs,
    retryAttempts,
  };
};

export const healthCheck = async () => {
  try {
    ensureConfigured();

    await requestWithFallback(
      [
        { method: 'GET', path: '/instance/fetchInstances', expectedStatuses: [200, 201] },
        { method: 'GET', path: '/instance/list', expectedStatuses: [200, 201] },
      ],
      'healthCheck'
    );

    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

export const createInstance = async () => {
  const { instanceName, webhookUrl } = getConfig();

  return requestWithFallback(
    [
      {
        method: 'POST',
        path: '/instance/create',
        body: {
          instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook: webhookUrl || undefined,
          webhook_by_events: false,
          webhook_base64: false,
          webhook_events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        },
        expectedStatuses: [200, 201, 403, 409],
      },
    ],
    'createInstance'
  );
};

export const connectInstance = async () => {
  const { instanceName } = getConfig();

  return requestWithFallback(
    [
      { method: 'POST', path: `/instance/connect/${instanceName}` },
      { method: 'GET', path: `/instance/connect/${instanceName}` },
    ],
    'connectInstance'
  );
};

export const getInstanceStatus = async () => {
  const { instanceName } = getConfig();

  try {
    return await requestWithFallback(
      [
        { method: 'GET', path: `/instance/connectionState/${instanceName}` },
        { method: 'GET', path: `/instance/status/${instanceName}` },
      ],
      'getInstanceStatus'
    );
  } catch (error) {
    if (!(error instanceof EvolutionApiError) || ![404, 405].includes(error.status || 0)) {
      throw error;
    }

    const payload = await requestWithFallback(
      [
        { method: 'GET', path: '/instance/fetchInstances' },
        { method: 'GET', path: '/instance/list' },
      ],
      'getInstanceStatusFromList'
    );

    const instances = unwrapInstancesList(payload);
    const { instanceName: name } = getConfig();

    const current = instances.find((item) => {
      const n = item?.name || item?.instanceName || item?.instance?.instanceName;
      return n === name;
    });

    return current || null;
  }
};

export const getQrCode = async () => {
  const { instanceName } = getConfig();

  return requestWithFallback(
    [
      { method: 'GET', path: `/instance/qrcode/${instanceName}` },
      { method: 'GET', path: `/instance/qr/${instanceName}` },
      { method: 'GET', path: `/instance/connect/${instanceName}` },
      { method: 'POST', path: `/instance/connect/${instanceName}` },
    ],
    'getQrCode'
  );
};

export const logoutInstance = async () => {
  const { instanceName } = getConfig();

  return requestWithFallback(
    [
      { method: 'DELETE', path: `/instance/logout/${instanceName}`, expectedStatuses: [200, 202, 204] },
      { method: 'POST', path: `/instance/logout/${instanceName}`, expectedStatuses: [200, 202, 204] },
      { method: 'DELETE', path: `/instance/disconnect/${instanceName}`, expectedStatuses: [200, 202, 204] },
      { method: 'POST', path: `/instance/disconnect/${instanceName}`, expectedStatuses: [200, 202, 204] },
    ],
    'logoutInstance'
  );
};

export const sendTextMessage = async ({ phone, text, remoteJidOriginal = null }) => {
  const { instanceName } = getConfig();
  const normalizedPhone = normalizePhoneForSend(phone);
  const normalizedText = String(text || '').trim();

  if (!normalizedPhone) {
    throw new EvolutionApiError('Numero de telefone invalido para envio', {
      code: 'EVOLUTION_INVALID_PHONE',
    });
  }

  if (!normalizedText) {
    throw new EvolutionApiError('Texto da mensagem vazio', {
      code: 'EVOLUTION_INVALID_MESSAGE',
    });
  }

  const candidates = [
    {
      method: 'POST',
      path: `/message/sendText/${instanceName}`,
      body: {
        number: normalizedPhone,
        textMessage: {
          text: normalizedText,
        },
      },
    },
    {
      method: 'POST',
      path: `/message/sendText/${instanceName}`,
      body: {
        instanceName,
        number: normalizedPhone,
        textMessage: {
          text: normalizedText,
        },
      },
    },
  ];

  const compatibleCandidates = filterIncompatibleSendTextCandidates(candidates, {
    phone,
    remoteJidOriginal,
  });

  if (!compatibleCandidates.length) {
    throw new EvolutionApiError('Numero de telefone invalido para envio', {
      code: 'EVOLUTION_INVALID_PHONE',
    });
  }

  logger.debug(
    {
      phone,
      remoteJidOriginal,
      resolvedDestination: normalizedPhone,
      endpoint: `/message/sendText/${instanceName}`,
      payloadShapes: compatibleCandidates.map((candidate) => describePayloadShape(candidate?.body)),
    },
    'Enviando mensagem de texto para Evolution API'
  );

  let requestResult = null;

  try {
    requestResult = await requestTryingPayloads(
      compatibleCandidates,
      'sendTextMessage',
      [400, 409, 415, 422],
      { includeMeta: true }
    );
  } catch (error) {
    const sessionStateError = isSessionStateError(error);
    const providerError = getProviderErrorMessage(error);

    if (error && typeof error === 'object') {
      error.sessionStateError = sessionStateError;
      error.providerError = providerError;
      error.instanceName = instanceName;

      if (sessionStateError && error instanceof EvolutionApiError) {
        error.code = 'EVOLUTION_SESSION_STATE_ERROR';
      }
    }

    throw error;
  }

  return {
    payload: requestResult?.payload ?? null,
    meta: {
      endpoint: requestResult?.candidate?.path || `/message/sendText/${instanceName}`,
      payloadShape: requestResult?.payloadShape || null,
      candidateIndex: typeof requestResult?.candidateIndex === 'number'
        ? requestResult.candidateIndex
        : null,
    },
  };
};

export { EvolutionApiError };
