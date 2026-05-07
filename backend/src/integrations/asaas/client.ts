import { AppError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.asaas.com/v3';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const DEFAULT_USER_AGENT = 'EasyBarber/1.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsaasClientConfig {
  apiKey: string;
  baseUrl: string;
  userAgent: string;
  keyEnvironment: AsaasEnvironment;
  urlEnvironment: AsaasEnvironment;
  timeoutMs: number;
}

export type AsaasEnvironment = 'production' | 'sandbox' | 'unknown';

export interface AsaasRequestOptions {
  body?: Record<string, unknown> | null;
  query?: Record<string, string | number | boolean | null | undefined> | null;
  idempotencyKey?: string | null;
  timeout?: number;
}

export interface AsaasRawResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  bodyRaw: string;
  bodyJson: unknown;
  url: string;
  requestBody: string | null;
}

export interface AsaasResponseContext {
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  responseText: string;
  responseBodyRaw: string;
  responseJson: unknown;
  payload: unknown;
}

export interface AsaasErrorDetails {
  provider: 'asaas';
  method: string;
  path: string;
  url: string;
  statusCode: number | null;
  payload: unknown;
  responseHeaders: Record<string, string>;
  responseText: string;
  responseBodyRaw: string;
  responseJson: unknown;
  requestBody: string | null;
}

export interface AsaasApiErrorShape {
  errors?: Array<{ code?: string; description?: string }>;
  message?: string;
  rawBody?: string;
}

export interface AsaasApiKeyDiagnostics {
  startsWithAact: boolean;
  startsWithDollar: boolean;
  hasWhitespace: boolean;
  length: number;
  maskedPrefix: string | null;
}

interface ShouldRetryOptions {
  method: string;
  idempotencyKey?: string | null;
  statusCode?: number;
  error?: unknown;
}

interface BuildAsaasErrorOptions {
  statusCode: number | null | undefined;
  payload: unknown;
  responseHeaders: Record<string, string> | null | undefined;
  responseText: string | null | undefined;
  method: string;
  path: string;
  url: string;
  requestBody: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const maskApiKey = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  if (normalized.length <= 10) {
    return '***';
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
};

const stripWrappingQuotes = (value: unknown): string => {
  const normalized = String(value || '').trim();
  if (normalized.length < 2) {
    return normalized;
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
};

export const normalizeAsaasApiKey = (value: unknown): string => {
  let normalized = stripWrappingQuotes(value);
  normalized = normalized.replace(/^Bearer\s+/i, '').trim();
  normalized = stripWrappingQuotes(normalized);

  return normalized;
};

export const getAsaasApiKeyDiagnostics = (
  value: unknown = process.env.ASAAS_API_KEY
): AsaasApiKeyDiagnostics => {
  const rawValue = value === undefined || value === null ? '' : String(value);
  const trimmedValue = rawValue.trim();
  const comparableValue = stripWrappingQuotes(trimmedValue)
    .replace(/^Bearer\s+/i, '')
    .trim();
  const normalizedApiKey = normalizeAsaasApiKey(rawValue);
  const apiKeyWithoutDollarPrefix = normalizedApiKey.replace(/^\$+/, '');

  return {
    startsWithAact: apiKeyWithoutDollarPrefix.startsWith('aact_'),
    startsWithDollar: comparableValue.startsWith('$'),
    hasWhitespace: rawValue !== trimmedValue || /\s/.test(trimmedValue),
    length: normalizedApiKey.length,
    maskedPrefix: normalizedApiKey ? maskApiKey(normalizedApiKey) : null,
  };
};

const inferEnvironmentFromApiKey = (apiKey: string): AsaasEnvironment => {
  if (typeof apiKey !== 'string') {
    return 'unknown';
  }

  if (apiKey.startsWith('$aact_prod_') || apiKey.startsWith('aact_prod_')) {
    return 'production';
  }

  if (apiKey.startsWith('$aact_hmlg_') || apiKey.startsWith('aact_hmlg_')) {
    return 'sandbox';
  }

  return 'unknown';
};

const inferEnvironmentFromBaseUrl = (baseUrl: string): AsaasEnvironment => {
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

const serializeHeaders = (
  headers: Headers | Record<string, string> | null | undefined
): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (typeof (headers as Headers).entries === 'function') {
    return Object.fromEntries((headers as Headers).entries());
  }

  return Object.fromEntries(Object.entries(headers as Record<string, string>));
};

export function removeEmptyFields(
  payload: Record<string, unknown> | null | undefined | unknown[]
): Record<string, unknown> | unknown[] | null | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload as unknown[] | null | undefined;
  }

  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).filter(([, value]) => {
      return value !== undefined && value !== null && value !== '';
    })
  );
}

const getConfig = (): AsaasClientConfig => {
  const apiKey = normalizeAsaasApiKey(process.env.ASAAS_API_KEY);

  if (!apiKey) {
    throw new AppError(
      'Billing Asaas não configurado no servidor',
      503,
      'BILLING_NOT_CONFIGURED'
    );
  }

  const baseUrl = String(process.env.ASAAS_BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/$/, '');
  const timeoutMs = Number(process.env.ASAAS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const userAgent = DEFAULT_USER_AGENT;
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

const shouldRetry = ({ method, idempotencyKey, statusCode, error }: ShouldRetryOptions): boolean => {
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

  const err = error as { name?: string; message?: string };
  const message = String(err?.message || '').toLowerCase();
  return (
    err?.name === 'AbortError' ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('timeout')
  );
};

const buildUrl = (
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | null | undefined> | null = null
): URL => {
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

const parseJsonSafely = (text: string | null | undefined): unknown => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const safeJSONStringify = (value: unknown): string | null => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const buildHeaders = ({
  apiKey,
  userAgent,
}: {
  apiKey: string;
  userAgent: string;
}): Record<string, string> => {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': userAgent,
    access_token: apiKey,
  };
};

const maskDigitsTail = (value: unknown, visibleDigits = 4): string | null => {
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

const maskEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return (value as string | null) || null;
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

const maskSensitiveByKey = (key: string, value: unknown): unknown => {
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

const maskSensitiveData = (value: unknown, key = ''): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        maskSensitiveData(entryValue, entryKey),
      ])
    );
  }

  return maskSensitiveByKey(key, value);
};

const sanitizeBodyForLog = (serializedBody: string | null | undefined): unknown => {
  if (!serializedBody) {
    return null;
  }

  const parsed = parseJsonSafely(serializedBody);
  if (parsed && typeof parsed === 'object') {
    return maskSensitiveData(parsed);
  }

  return serializedBody;
};

const maskSensitiveText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return (value as string | null) || null;
  }

  const parsed = parseJsonSafely(value);
  if (parsed && typeof parsed === 'object') {
    return safeJSONStringify(maskSensitiveData(parsed));
  }

  const maskedEmails = value.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    (email) => maskEmail(email) ?? email
  );

  return maskedEmails.replace(/\d{10,14}/g, (digits) => maskDigitsTail(digits) ?? digits);
};

const isResponseLikeError = (error: unknown): boolean => {
  const err = error as { response?: { status?: unknown; text?: unknown; data?: unknown } } | null;
  const response = err?.response;

  if (!response) {
    return false;
  }

  return (
    typeof response?.status === 'number' ||
    typeof response?.text === 'function' ||
    response?.data !== undefined
  );
};

const normalizeErrorResponseContext = async (error: unknown): Promise<AsaasResponseContext | null> => {
  const err = error as {
    response?: {
      status?: number;
      text?: () => Promise<string>;
      data?: unknown;
      headers?: Record<string, string>;
    };
    statusCode?: number;
    status?: number;
    headers?: Record<string, string>;
  } | null;

  const response = err?.response;

  if (!response) {
    return null;
  }

  const statusCode =
    (typeof response?.status === 'number' ? response.status : null) ||
    (typeof err?.statusCode === 'number' ? err.statusCode : null) ||
    (typeof err?.status === 'number' ? err.status : null) ||
    null;

  let responseText = '';
  if (typeof response?.text === 'function') {
    try {
      responseText = await response.text();
    } catch {
      responseText = '';
    }
  }

  const responseData = response?.data;
  const responseHeaders = serializeHeaders(
    (response?.headers ?? err?.headers ?? {}) as Record<string, string>
  );

  if (responseText === '' && typeof responseData === 'string') {
    responseText = responseData;
  }

  const responseJsonFromText = parseJsonSafely(responseText);
  const responseJson =
    (responseData && typeof responseData === 'object' ? responseData : null) ||
    responseJsonFromText ||
    null;

  let payload: unknown = null;
  if (responseData !== undefined && responseData !== null) {
    if (typeof responseData === 'object') {
      payload = responseData;
    } else if (typeof responseData === 'string') {
      payload = responseJsonFromText || { rawBody: responseData };
    } else {
      payload = { rawBody: String(responseData) };
    }
  }

  if (!payload && responseJson) {
    payload = responseJson;
  }

  if (!payload && responseText) {
    payload = { rawBody: responseText };
  }

  if (responseText === '' && responseJson) {
    responseText = safeJSONStringify(responseJson) ?? '';
  }

  return {
    statusCode,
    responseHeaders,
    responseText,
    responseBodyRaw: responseText,
    responseJson,
    payload,
  };
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
}: BuildAsaasErrorOptions): AppError => {
  const normalizedResponseText =
    typeof responseText === 'string' ? responseText : '';
  const responseBody: AsaasApiErrorShape | null =
    payload !== undefined && payload !== null
      ? (payload as AsaasApiErrorShape)
      : normalizedResponseText
        ? { rawBody: normalizedResponseText }
        : null;
  const apiMessage =
    (responseBody as AsaasApiErrorShape)?.errors?.[0]?.description ||
    (responseBody as AsaasApiErrorShape)?.message ||
    null;
  const errorCodes = Array.isArray((responseBody as AsaasApiErrorShape)?.errors)
    ? (responseBody as AsaasApiErrorShape).errors!.map((item) =>
        String(item?.code || '').toLowerCase()
      )
    : [];
  const invalidAccessToken = errorCodes.includes('invalid_access_token');
  const message = invalidAccessToken
    ? 'Configuração Asaas inválida. Verifique ASAAS_API_KEY no Render.'
    : apiMessage || normalizedResponseText || `Erro Asaas (${method} ${path})`;

  const error = new AppError(
    message,
    invalidAccessToken ? 503 : statusCode || 502,
    invalidAccessToken ? 'ASAAS_INVALID_ACCESS_TOKEN' : 'ASAAS_API_ERROR'
  ) as AppError & {
    response: { status: number; data: unknown; headers: Record<string, string> };
    details: AsaasErrorDetails;
  };

  error.response = {
    status: statusCode || 502,
    data: responseBody,
    headers: responseHeaders || {},
  };

  error.details = {
    provider: 'asaas',
    method,
    path,
    url,
    statusCode: statusCode ?? null,
    payload: responseBody,
    responseHeaders: responseHeaders || {},
    responseText: normalizedResponseText,
    responseBodyRaw: normalizedResponseText,
    responseJson: payload && typeof payload === 'object' ? payload : null,
    requestBody: requestBody || null,
  };

  return error;
};

const readAsaasResponse = async (
  response: Response
): Promise<{ responseText: string; responseJson: unknown; responseHeaders: Record<string, string> }> => {
  const responseText = await response.text();
  const responseJson = parseJsonSafely(responseText);

  return {
    responseText,
    responseJson,
    responseHeaders: serializeHeaders(response.headers),
  };
};

export const rawAsaasRequest = async (
  method: string,
  path: string,
  options: AsaasRequestOptions = {}
): Promise<AsaasRawResponse> => {
  const { apiKey, baseUrl, timeoutMs, userAgent, keyEnvironment, urlEnvironment } = getConfig();
  const {
    body = null,
    query = null,
    idempotencyKey = null,
    timeout = timeoutMs,
  } = options;
  const url = buildUrl(baseUrl, path, query);
  const payload = removeEmptyFields(body ?? undefined) as Record<string, unknown> | null;
  const serializedBody =
    payload !== null && payload !== undefined ? JSON.stringify(payload) : undefined;
  const headers = buildHeaders({ apiKey, userAgent });
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
          accept: headers['accept'],
          'content-type': headers['content-type'],
          'user-agent': headers['user-agent'],
          'has-access-token': Boolean(headers['access_token']),
        },
        requestBody: sanitizeBodyForLog(serializedBody),
      },
      'ASAAS HTTP REQUEST'
    );

    const response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      body: serializedBody,
    });

    const { responseText, responseJson, responseHeaders } = await readAsaasResponse(response);

    logger.debug(
      {
        code: 'ASAAS_HTTP_RESPONSE',
        method,
        path,
        url: url.toString(),
        statusCode: response.status,
        responseHeaders,
        responseBodyRaw: maskSensitiveText(responseText),
        responseJson: maskSensitiveData(responseJson),
      },
      'ASAAS HTTP RESPONSE'
    );

    return {
      ok: response.ok,
      status: response.status,
      headers: responseHeaders,
      bodyRaw: responseText,
      bodyJson: responseJson,
      url: url.toString(),
      requestBody: serializedBody || null,
    };
  } finally {
    clearTimeout(timer);
  }
};

const request = async (
  method: string,
  path: string,
  options: AsaasRequestOptions = {}
): Promise<unknown> => {
  const { apiKey, baseUrl, timeoutMs, userAgent, keyEnvironment, urlEnvironment } = getConfig();
  const {
    body = null,
    query = null,
    idempotencyKey = null,
    timeout = timeoutMs,
  } = options;

  const url = buildUrl(baseUrl, path, query);
  const payload = removeEmptyFields(body ?? undefined) as Record<string, unknown> | null;
  const serializedBody =
    payload !== null && payload !== undefined ? JSON.stringify(payload) : null;
  const headers = buildHeaders({ apiKey, userAgent });

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
            accept: headers['accept'],
            'content-type': headers['content-type'],
            'user-agent': headers['user-agent'],
            'has-access-token': Boolean(headers['access_token']),
          },
          requestBody: sanitizeBodyForLog(serializedBody),
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

      const { responseText, responseJson, responseHeaders } = await readAsaasResponse(response);

      logger.debug(
        {
          code: 'ASAAS_HTTP_RESPONSE',
          method,
          path,
          url: url.toString(),
          statusCode: response.status,
          responseHeaders,
          responseBodyRaw: maskSensitiveText(responseText),
          responseJson: maskSensitiveData(responseJson),
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
          payload: responseJson,
          responseHeaders,
          responseText,
          method,
          path,
          url: url.toString(),
          requestBody: serializedBody,
        });
      }

      return responseJson;
    } catch (error) {
      clearTimeout(timer);

      if (attempt < MAX_RETRIES && shouldRetry({ method, idempotencyKey, error })) {
        await sleep((attempt + 1) * 300);
        continue;
      }

      if (error instanceof AppError) {
        throw error;
      }

      if (isResponseLikeError(error)) {
        const normalizedErrorContext = await normalizeErrorResponseContext(error);

        throw buildAsaasError({
          statusCode: normalizedErrorContext?.statusCode,
          payload: normalizedErrorContext?.payload,
          responseHeaders: normalizedErrorContext?.responseHeaders,
          responseText: normalizedErrorContext?.responseText,
          method,
          path,
          url: url.toString(),
          requestBody: serializedBody,
        });
      }

      logger.error(
        {
          err: error,
          method,
          path,
          url: url.toString(),
          requestBody: sanitizeBodyForLog(serializedBody),
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
  get(path: string, options: AsaasRequestOptions = {}): Promise<unknown> {
    return request('GET', path, options);
  },

  post(path: string, body: Record<string, unknown>, options: AsaasRequestOptions = {}): Promise<unknown> {
    return request('POST', path, { ...options, body });
  },

  put(path: string, body: Record<string, unknown>, options: AsaasRequestOptions = {}): Promise<unknown> {
    return request('PUT', path, { ...options, body });
  },

  delete(path: string, options: AsaasRequestOptions = {}): Promise<unknown> {
    return request('DELETE', path, options);
  },
};
