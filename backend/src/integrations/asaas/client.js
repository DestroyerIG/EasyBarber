import { AppError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

const DEFAULT_BASE_URL = 'https://api.asaas.com/v3';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const DEFAULT_USER_AGENT = 'EasyBarber/1.0';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const maskApiKey = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  if (normalized.length <= 10) {
    return '***';
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
};

const inferEnvironmentFromApiKey = (apiKey) => {
  if (typeof apiKey !== 'string') {
    return 'unknown';
  }

  if (apiKey.startsWith('$aact_prod_')) {
    return 'production';
  }

  if (apiKey.startsWith('$aact_hmlg_')) {
    return 'sandbox';
  }

  return 'unknown';
};

const inferEnvironmentFromBaseUrl = (baseUrl) => {
  if (typeof baseUrl !== 'string') {
    return 'unknown';
  }

  if (baseUrl.includes('api-sandbox.asaas.com')) {
    return 'sandbox';
  }

  if (baseUrl.includes('api.asaas.com')) {
    return 'production';
  }

  return 'unknown';
};

const serializeHeaders = (headers) => {
  if (!headers) {
    return {};
  }

  if (typeof headers.entries === 'function') {
    return Object.fromEntries(headers.entries());
  }

  return Object.fromEntries(Object.entries(headers));
};

const getConfig = () => {
  const apiKey = String(process.env.ASAAS_API_KEY || '').trim();

  if (!apiKey) {
    throw new AppError(
      'Billing Asaas não configurado no servidor',
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  const baseUrl = String(process.env.ASAAS_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  const timeoutMs = Number(process.env.ASAAS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const userAgent = String(process.env.ASAAS_USER_AGENT || DEFAULT_USER_AGENT).trim() || DEFAULT_USER_AGENT;
  const keyEnvironment = inferEnvironmentFromApiKey(apiKey);
  const urlEnvironment = inferEnvironmentFromBaseUrl(baseUrl);

  if (
    keyEnvironment !== 'unknown' &&
    urlEnvironment !== 'unknown' &&
    keyEnvironment !== urlEnvironment
  ) {
    logger.warn(
      {
        code: 'ASAAS_ENVIRONMENT_MISMATCH',
        keyEnvironment,
        urlEnvironment,
        baseUrl,
        maskedApiKey: maskApiKey(apiKey),
      },
      'Ambiente da chave Asaas difere da URL configurada'
    );
  }

  return {
    apiKey,
    baseUrl,
    userAgent,
    keyEnvironment,
    urlEnvironment,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
};

const shouldRetry = ({ method, idempotencyKey, statusCode, error }) => {
  const normalizedMethod = (method || '').toUpperCase();
  const idempotentMethod = normalizedMethod === 'GET' || normalizedMethod === 'HEAD';
  const safeWithIdempotency = normalizedMethod === 'POST' && Boolean(idempotencyKey);

  if (!idempotentMethod && !safeWithIdempotency) {
    return false;
  }

  if (typeof statusCode === 'number') {
    return RETRYABLE_STATUS_CODES.has(statusCode);
  }

  if (!error) {
    return false;
  }

  const message = String(error?.message || '').toLowerCase();
  return (
    error?.name === 'AbortError' ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('timeout')
  );
};

const buildUrl = (baseUrl, path, query = null) => {
  const url = new URL(`${baseUrl}${path}`);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url;
};

const parseJsonSafely = (text) => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const buildAsaasError = ({
  statusCode,
  payload,
  responseHeaders,
  responseText,
  method,
  path,
  url,
  requestBody,
}) => {
  const apiMessage = payload?.errors?.[0]?.description || payload?.message || null;
  const message = apiMessage || responseText || `Erro Asaas (${method} ${path})`;
  const error = new AppError(message, statusCode || 502, 'ASAAS_API_ERROR');
  error.response = {
    status: statusCode || 502,
    data: payload || (responseText ? { rawBody: responseText } : null),
    headers: responseHeaders || {},
  };

  error.details = {
    provider: 'asaas',
    method,
    path,
    url,
    statusCode,
    payload,
    responseHeaders: responseHeaders || {},
    responseText: responseText || null,
    requestBody: requestBody || null,
  };

  return error;
};

const request = async (method, path, options = {}) => {
  const { apiKey, baseUrl, timeoutMs, userAgent, keyEnvironment, urlEnvironment } = getConfig();
  const {
    body = null,
    query = null,
    idempotencyKey = null,
    timeout = timeoutMs,
  } = options;

  const url = buildUrl(baseUrl, path, query);
  const serializedBody = body ? JSON.stringify(body) : null;
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    access_token: apiKey,
    'user-agent': userAgent,
  };

  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
    headers['Idempotency-Key'] = idempotencyKey;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      logger.debug(
        {
          code: 'ASAAS_HTTP_REQUEST',
          method,
          path,
          url: url.toString(),
          baseUrl,
          keyEnvironment,
          urlEnvironment,
          maskedApiKey: maskApiKey(apiKey),
          headers: {
            accept: headers.accept,
            'content-type': headers['content-type'],
            'user-agent': headers['user-agent'],
            'has-access-token': Boolean(headers.access_token),
            'has-idempotency-key': Boolean(idempotencyKey),
          },
          requestBody: serializedBody,
        },
        'ASAAS HTTP REQUEST'
      );

      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
        body: serializedBody || undefined,
      });

      clearTimeout(timer);

      const responseText = await response.text();
      const payload = parseJsonSafely(responseText);
      const responseHeaders = serializeHeaders(response.headers);

      logger.debug(
        {
          code: 'ASAAS_HTTP_RESPONSE',
          method,
          path,
          url: url.toString(),
          statusCode: response.status,
          responseHeaders,
          responseBody: payload || responseText || null,
        },
        'ASAAS HTTP RESPONSE'
      );

      if (!response.ok) {
        if (
          attempt < MAX_RETRIES &&
          shouldRetry({ method, idempotencyKey, statusCode: response.status })
        ) {
          await sleep((attempt + 1) * 300);
          continue;
        }

        throw buildAsaasError({
          statusCode: response.status,
          payload,
          responseHeaders,
          responseText,
          method,
          path,
          url: url.toString(),
          requestBody: serializedBody,
        });
      }

      return payload;
    } catch (error) {
      clearTimeout(timer);

      if (
        attempt < MAX_RETRIES &&
        shouldRetry({ method, idempotencyKey, error })
      ) {
        await sleep((attempt + 1) * 300);
        continue;
      }

      if (error instanceof AppError) {
        throw error;
      }

      logger.error(
        {
          err: error,
          method,
          path,
          url: url.toString(),
          requestBody: serializedBody,
        },
        'Falha ao comunicar com Asaas'
      );

      throw new AppError(
        'Não foi possível comunicar com o Asaas no momento',
        502,
        'ASAAS_CONNECTION_ERROR'
      );
    }
  }

  throw new AppError(
    'Falha inesperada ao comunicar com o Asaas',
    502,
    'ASAAS_CONNECTION_ERROR'
  );
};

export const asaasClient = {
  get(path, options = {}) {
    return request('GET', path, options);
  },

  post(path, body, options = {}) {
    return request('POST', path, { ...options, body });
  },

  put(path, body, options = {}) {
    return request('PUT', path, { ...options, body });
  },

  delete(path, options = {}) {
    return request('DELETE', path, options);
  },
};
