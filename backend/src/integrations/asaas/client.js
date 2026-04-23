import { AppError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

const DEFAULT_BASE_URL = 'https://api.asaas.com/v3';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getConfig = () => {
  const apiKey = process.env.ASAAS_API_KEY;

  if (!apiKey) {
    throw new AppError(
      'Billing Asaas não configurado no servidor',
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  const baseUrl = (process.env.ASAAS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const timeoutMs = Number(process.env.ASAAS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return {
    apiKey,
    baseUrl,
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

const buildAsaasError = ({ statusCode, payload, method, path }) => {
  const apiMessage = payload?.errors?.[0]?.description || payload?.message || null;
  const message = apiMessage || `Erro Asaas (${method} ${path})`;
  const error = new AppError(message, statusCode || 502, 'ASAAS_API_ERROR');
  error.response = {
    status: statusCode || 502,
    data: payload || null,
  };

  error.details = {
    provider: 'asaas',
    method,
    path,
    statusCode,
    payload,
  };

  return error;
};

const request = async (method, path, options = {}) => {
  const { apiKey, baseUrl, timeoutMs } = getConfig();
  const {
    body = null,
    query = null,
    idempotencyKey = null,
    timeout = timeoutMs,
  } = options;

  const url = buildUrl(baseUrl, path, query);
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    access_token: apiKey,
  };

  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
    headers['Idempotency-Key'] = idempotencyKey;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
        body: body ? JSON.stringify(body) : undefined,
      });

      clearTimeout(timer);

      const responseText = await response.text();
      const payload = parseJsonSafely(responseText);

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
          method,
          path,
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
