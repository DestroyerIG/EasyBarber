import logger from '../utils/logger.js';
import { normalizePhoneForSend } from '../utils/whatsapp.js';
import { evolutionCircuitBreaker } from '../utils/circuitBreaker.js';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_ATTEMPTS = 1;
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_EVOLUTION_WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];
const ALLOWED_EVOLUTION_WEBHOOK_EVENTS = new Set(DEFAULT_EVOLUTION_WEBHOOK_EVENTS);
const BLOCKED_HEAVY_WEBHOOK_EVENTS = new Set([
  'MESSAGES_SET',
  'MESSAGESSET',
]);

interface EvolutionConfig {
  baseURL: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  timeoutMs: number;
  retryAttempts: number;
}

interface WebhookConfig {
  enabled: boolean;
  url: string;
  events: string[];
  webhook_by_events: boolean;
  webhook_base64: boolean;
}

interface DesiredWebhookConfig extends WebhookConfig {
  instanceName: string;
}

interface WebhookConfigSnapshot {
  enabled: boolean;
  url: string;
  events: string[];
  webhook_by_events: boolean | null;
  webhook_base64: boolean | null;
}

interface RequestCandidate {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  expectedStatuses?: number[];
  instanceName?: string | null;
}

interface RequestWithPayloadResult {
  payload: unknown;
  payloadShape: string;
  candidate: RequestCandidate;
  candidateIndex: number;
}

interface SendTextContext {
  phone?: string | null;
  remoteJidOriginal?: string | null;
  allowLidPhone?: boolean;
}

const normalizeWebhookEventToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[.\-\s]+/g, '_')
    .replace(/_+/g, '_');

const normalizeWebhookEvents = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((eventName) => normalizeWebhookEventToken(eventName))
        .filter(Boolean)
    )
  );
};

const sanitizeWebhookEvents = (value: unknown): string[] => {
  const normalized = normalizeWebhookEvents(value);
  const allowed: string[] = [];
  const blocked: string[] = [];
  const unsupported: string[] = [];

  for (const eventName of normalized) {
    if (BLOCKED_HEAVY_WEBHOOK_EVENTS.has(eventName)) {
      blocked.push(eventName);
      continue;
    }

    if (ALLOWED_EVOLUTION_WEBHOOK_EVENTS.has(eventName)) {
      allowed.push(eventName);
      continue;
    }

    unsupported.push(eventName);
  }

  if (blocked.length || unsupported.length) {
    logger.warn(
      {
        blockedEvents: blocked,
        unsupportedEvents: unsupported,
        allowedEvents: allowed,
      },
      'Eventos de webhook da Evolution filtrados para configuracao minima segura'
    );
  }

  return allowed.length ? allowed : DEFAULT_EVOLUTION_WEBHOOK_EVENTS;
};

const parseWebhookEventsFromEnv = (): string[] => {
  const raw = String(process.env.EVOLUTION_WEBHOOK_EVENTS || '').trim();
  if (!raw) return DEFAULT_EVOLUTION_WEBHOOK_EVENTS;

  return sanitizeWebhookEvents(raw.split(','));
};

const buildDesiredWebhookConfig = ({ instanceName = null, webhookUrl = null }: { instanceName?: string | null; webhookUrl?: string | null } = {}): DesiredWebhookConfig => {
  const config = getConfig({ instanceName, webhookUrl });

  return {
    instanceName: config.instanceName,
    url: config.webhookUrl || '',
    events: parseWebhookEventsFromEnv(),
    webhook_by_events: true,
    webhook_base64: false,
    enabled: Boolean(config.webhookUrl),
  };
};

const normalizeWebhookConfigSnapshot = (payload: unknown = {}): WebhookConfigSnapshot => {
  const payloadObj = payload as Record<string, unknown>;
  const webhookNode: Record<string, unknown> =
    payloadObj?.webhook && typeof payloadObj.webhook === 'object'
      ? payloadObj.webhook as Record<string, unknown>
      : (payloadObj?.webhook as Record<string, unknown>)?.webhook && typeof (payloadObj?.webhook as Record<string, unknown>)?.webhook === 'object'
        ? ((payloadObj?.webhook as Record<string, unknown>)?.webhook as Record<string, unknown>)
        : payloadObj;

  return {
    enabled:
      typeof webhookNode?.enabled === 'boolean'
        ? webhookNode.enabled
        : Boolean(webhookNode?.url),
    url: typeof webhookNode?.url === 'string' ? webhookNode.url.trim() : '',
    events: normalizeWebhookEvents(webhookNode?.events),
    webhook_by_events:
      typeof webhookNode?.webhook_by_events === 'boolean'
        ? webhookNode.webhook_by_events
        : null,
    webhook_base64:
      typeof webhookNode?.webhook_base64 === 'boolean'
        ? webhookNode.webhook_base64
        : null,
  };
};

const areWebhookEventSetsEqual = (left: string[] = [], right: string[] = []): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((eventName) => rightSet.has(eventName));
};

export class EvolutionApiError extends Error {
  status: number | null;
  details: unknown;
  code: string;
  sessionStateError?: boolean;
  providerError?: string;
  instanceName?: string;

  constructor(message: string, { status = null, details = null, code = 'EVOLUTION_API_ERROR' }: { status?: number | null; details?: unknown; code?: string } = {}) {
    super(message);
    this.name = 'EvolutionApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

const normalizeInstanceName = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
};

const getConfig = (overrides: { instanceName?: string | null; webhookUrl?: string | null } = {}): EvolutionConfig => {
  const baseURL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY || '';
  const fallbackInstanceName = process.env.EVOLUTION_INSTANCE_NAME || 'easybarber';
  const instanceName = normalizeInstanceName(overrides.instanceName) || normalizeInstanceName(fallbackInstanceName);
  const webhookUrl = typeof overrides.webhookUrl === 'string'
    ? overrides.webhookUrl.trim()
    : (process.env.EVOLUTION_WEBHOOK_URL || '');
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

const ensureConfigured = (overrides: { instanceName?: string | null; webhookUrl?: string | null } = {}): void => {
  const { baseURL, apiKey } = getConfig(overrides);

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

const normalizePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

const buildHeaders = (overrides: { instanceName?: string | null; webhookUrl?: string | null } = {}): Record<string, string> => {
  const { apiKey } = getConfig(overrides);

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    apikey: apiKey,
  };
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
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

const flattenMessages = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.flat(Infinity).filter(Boolean).map(String);
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  const payloadObj = payload as Record<string, unknown>;
  if (typeof payloadObj?.message === 'string') return payloadObj.message;

  const messageList = flattenMessages(payloadObj?.message);
  if (messageList.length) return messageList.join(' | ');

  if (typeof payloadObj?.error === 'string') return payloadObj.error;
  const errorObj = payloadObj?.error as Record<string, unknown> | undefined;
  if (typeof errorObj?.message === 'string') return errorObj.message;

  const responseObj = payloadObj?.response as Record<string, unknown> | undefined;
  const responseMessageList = flattenMessages(responseObj?.message);
  if (responseMessageList.length) return responseMessageList.join(' | ');

  return null;
};

const safeStringify = (value: unknown): string => {
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

const normalizeProviderMessage = (value: unknown): string =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const hasInstanceNotFoundMessage = (value: unknown, instanceName = ''): boolean => {
  const normalized = normalizeProviderMessage(value);

  if (!normalized) {
    return false;
  }

  const hasGenericPattern =
    (
      normalized.includes('instance') &&
      (
        normalized.includes('does not exist') ||
        normalized.includes('doesn\'t exist') ||
        normalized.includes('not found')
      )
    ) ||
    normalized.includes('instancia inexistente') ||
    normalized.includes('instancia nao existe');

  if (!hasGenericPattern) {
    return false;
  }

  if (!instanceName) {
    return true;
  }

  return normalized.includes(instanceName.toLowerCase()) || normalized.includes('instance');
};

export const getProviderErrorMessage = (error: unknown = null): string => {
  if (!error) return '';

  const chunks: string[] = [];
  const errorObj = error as Record<string, unknown>;

  if (typeof errorObj?.message === 'string' && (errorObj.message as string).trim()) {
    chunks.push((errorObj.message as string).trim());
  }

  const detailMessage = extractErrorMessage(errorObj?.details);
  if (detailMessage) {
    chunks.push(detailMessage);
  } else if (errorObj?.details) {
    const serializedDetails = safeStringify(errorObj.details).trim();
    if (serializedDetails) {
      chunks.push(serializedDetails);
    }
  }

  if (!chunks.length) {
    return '';
  }

  return Array.from(new Set(chunks)).join(' | ');
};

export const isInstanceNotFoundError = (error: unknown = null, options: { instanceName?: string | null } = {}): boolean => {
  if (!error) {
    return false;
  }

  const errorObj = error as Record<string, unknown>;
  if (errorObj?.code === 'EVOLUTION_INSTANCE_NOT_FOUND') {
    return true;
  }

  const status = Number(errorObj?.status || 0);
  if (status === 404) {
    return true;
  }

  const { instanceName } = getConfig(options);
  const providerError = getProviderErrorMessage(error);
  const detailMessage = extractErrorMessage(errorObj?.details);

  return (
    hasInstanceNotFoundMessage(providerError, instanceName) ||
    hasInstanceNotFoundMessage(detailMessage, instanceName) ||
    hasInstanceNotFoundMessage(safeStringify(errorObj?.details), instanceName)
  );
};

export const isSessionStateError = (error: unknown = null): boolean => {
  if (!error) return false;
  const errorObj = error as Record<string, unknown>;
  if (errorObj?.sessionStateError === true) return true;
  if (errorObj?.code === 'EVOLUTION_SESSION_STATE_ERROR') return true;

  const status = Number(errorObj?.status || 0);
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isRetriableStatus = (status: number): boolean => [408, 429, 500, 502, 503, 504].includes(status);

const request = async ({ method, path, body = undefined, expectedStatuses = [200, 201], instanceName = null }: RequestCandidate): Promise<unknown> => {
  const requestConfig = getConfig({ instanceName });
  ensureConfigured(requestConfig);

  const {
    baseURL,
    timeoutMs,
    retryAttempts,
    instanceName: resolvedInstanceName,
  } = requestConfig;
  const url = `${baseURL}${normalizePath(path)}`;
  const maxAttempts = retryAttempts + 1;
  let lastError: EvolutionApiError | null = null;

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
          instanceName: resolvedInstanceName,
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

      logger.debug(
        {
          method,
          url,
          instanceName: resolvedInstanceName,
          status: response.status,
          attempt,
          maxAttempts,
        },
        'Evolution API response'
      );

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
              instanceName: resolvedInstanceName,
              attempt,
              maxAttempts,
            },
            'Erro transiente na Evolution API, tentando novamente'
          );
          lastError = apiError;
          await sleep(Math.min(1_000 * Math.pow(2, attempt - 1), 8_000));
          continue;
        }

        logger.error(
          {
            status: response.status,
            payload,
            url,
            method,
            instanceName: resolvedInstanceName,
            attempt,
          },
          'Erro na Evolution API'
        );

        throw apiError;
      }

      return payload;
    } catch (error) {
      const errorObj = error as Record<string, unknown>;
      const normalizedError =
        errorObj?.name === 'AbortError'
          ? new EvolutionApiError('Timeout ao chamar Evolution API', {
              code: 'EVOLUTION_TIMEOUT',
            })
          : error instanceof EvolutionApiError
            ? error
            : new EvolutionApiError((errorObj?.message as string) || 'Falha de comunicacao com Evolution API', {
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
            instanceName: resolvedInstanceName,
            attempt,
            maxAttempts,
          },
          'Falha transiente ao chamar Evolution API, tentando novamente'
        );
        lastError = normalizedError;
        await sleep(Math.min(1_000 * Math.pow(2, attempt - 1), 8_000));
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

const requestWithFallback = async (candidates: RequestCandidate[], operationName: string, fallbackStatuses: number[] = [404, 405, 501]): Promise<unknown> => {
  return evolutionCircuitBreaker.execute(async () => {
    let lastError: unknown = null;

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
  });
};

const requestTryingPayloads = async (
  candidates: RequestCandidate[],
  operationName: string,
  fallbackStatuses: number[] = [400, 409, 415, 422],
  options: { includeMeta?: boolean } = {}
): Promise<unknown> => {
  const includeMeta = Boolean(options?.includeMeta);

  return evolutionCircuitBreaker.execute(async () => {
    let lastError: unknown = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const payloadShape = describePayloadShape(candidate?.body);

      try {
        const payload = await request(candidate);

        if (includeMeta) {
          return {
            payload,
            payloadShape,
            candidate,
            candidateIndex: index,
          } as RequestWithPayloadResult;
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
  });
};

const describePayloadShape = (body: unknown): string => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'empty';
  }

  const keys = Object.keys(body as Record<string, unknown>).sort();

  if (keys.includes('instanceName') && keys.includes('number') && keys.includes('textMessage')) {
    return 'instanceName+number+textMessage';
  }

  if (keys.includes('number') && keys.includes('textMessage')) {
    return 'number+textMessage';
  }

  return keys.join('+') || 'empty';
};

// FIX Evolution API v1 @lid: verifica se um valor é um JID @lid válido para envio
const isLidJidDestination = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase().endsWith('@lid');
};

const filterIncompatibleSendTextCandidates = (candidates: RequestCandidate[] = [], context: SendTextContext = {}): RequestCandidate[] => {
  const filtered: RequestCandidate[] = [];

  for (const candidate of candidates) {
    const rawDestination = (candidate?.body as Record<string, unknown> | undefined)?.number;

    // FIX Evolution API v1: @lid JIDs são destinos válidos quando explicitamente autorizados
    // A Evolution API/Baileys roteia mensagens para @lid corretamente
    if (isLidJidDestination(rawDestination)) {
      if (context?.allowLidPhone === true) {
        filtered.push(candidate);
        continue;
      }
      logger.warn(
        {
          endpoint: candidate?.path || null,
          payloadShape: describePayloadShape(candidate?.body),
          phone: context?.phone || null,
          destination: rawDestination,
          reason: '@lid_destination_not_authorized',
        },
        'Payload de envio Evolution descartado: @lid sem allowLidPhone'
      );
      continue;
    }

    const normalizedDestination = normalizePhoneForSend(rawDestination as string);

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

const unwrapInstancesList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const payloadObj = payload as Record<string, unknown>;
  if (Array.isArray(payloadObj?.data)) return payloadObj.data as unknown[];
  if (Array.isArray(payloadObj?.instances)) return payloadObj.instances as unknown[];
  return [];
};

const extractInstanceConnectionState = (payload: unknown): string | null => {
  const payloadObj = payload as Record<string, unknown>;
  const instanceObj = payloadObj?.instance as Record<string, unknown> | undefined;
  const dataObj = payloadObj?.data as Record<string, unknown> | undefined;

  const candidates = [
    payloadObj?.status,
    payloadObj?.state,
    payloadObj?.connectionStatus,
    instanceObj?.status,
    instanceObj?.state,
    instanceObj?.connectionStatus,
    dataObj?.status,
    dataObj?.state,
    dataObj?.connectionStatus,
  ];

  const match = candidates.find((value) => typeof value === 'string' && (value as string).trim());
  return match ? (match as string).trim().toLowerCase() : null;
};

export const getEvolutionConfig = (options: { instanceName?: string | null; webhookUrl?: string | null } = {}): Omit<EvolutionConfig, 'apiKey'> => {
  const { baseURL, instanceName, webhookUrl, timeoutMs, retryAttempts } = getConfig(options);

  return {
    baseURL,
    instanceName,
    webhookUrl,
    timeoutMs,
    retryAttempts,
  };
};

export const getInstanceWebhook = async ({ instanceName = null }: { instanceName?: string | null } = {}): Promise<WebhookConfigSnapshot> => {
  const desiredConfig = buildDesiredWebhookConfig({ instanceName });

  const payload = await requestWithFallback(
    [
      {
        method: 'GET',
        path: `/webhook/find/${desiredConfig.instanceName}`,
        instanceName: desiredConfig.instanceName,
      },
    ],
    'getInstanceWebhook'
  );

  return normalizeWebhookConfigSnapshot(payload);
};

export const setInstanceWebhook = async ({ instanceName = null, webhookUrl = null }: { instanceName?: string | null; webhookUrl?: string | null } = {}): Promise<WebhookConfigSnapshot> => {
  const desiredConfig = buildDesiredWebhookConfig({ instanceName, webhookUrl });

  const payload = await requestTryingPayloads(
    [
      // Evolution API v2 nested format (FIRST)
      {
        method: 'POST',
        path: `/webhook/set/${desiredConfig.instanceName}`,
        body: {
          webhook: {
            enabled: true,
            url: desiredConfig.url,
            events: desiredConfig.events,
            webhook_by_events: desiredConfig.webhook_by_events,
            webhook_base64: desiredConfig.webhook_base64,
          },
        },
        expectedStatuses: [200, 201],
        instanceName: desiredConfig.instanceName,
      },
      // Evolution API v1 flat format (FALLBACK)
      {
        method: 'POST',
        path: `/webhook/set/${desiredConfig.instanceName}`,
        body: {
          url: desiredConfig.url,
          events: desiredConfig.events,
          webhook_by_events: desiredConfig.webhook_by_events,
          webhook_base64: desiredConfig.webhook_base64,
        },
        expectedStatuses: [200, 201],
        instanceName: desiredConfig.instanceName,
      },
    ],
    'setInstanceWebhook'
  );

  return normalizeWebhookConfigSnapshot(payload);
};

export const ensureInstanceWebhookConfig = async ({ instanceName = null, webhookUrl = null }: { instanceName?: string | null; webhookUrl?: string | null } = {}): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  current: WebhookConfigSnapshot | null;
  desired: DesiredWebhookConfig;
  reapplied?: boolean;
}> => {
  const desiredConfig = buildDesiredWebhookConfig({ instanceName, webhookUrl });

  if (!desiredConfig.url) {
    logger.warn(
      {
        instanceName: desiredConfig.instanceName,
      },
      'Reaplicacao de webhook da Evolution ignorada: EVOLUTION_WEBHOOK_URL ausente'
    );

    return {
      ok: false,
      skipped: true,
      reason: 'missing_webhook_url',
      current: null,
      desired: desiredConfig,
    };
  }

  let currentConfig: WebhookConfigSnapshot | null = null;

  try {
    currentConfig = await getInstanceWebhook({ instanceName: desiredConfig.instanceName });
  } catch (error) {
    logger.warn(
      {
        err: error,
        instanceName: desiredConfig.instanceName,
      },
      'Falha ao consultar webhook atual da instancia na Evolution'
    );
  }

  const needsReapply =
    !currentConfig ||
    currentConfig.enabled !== desiredConfig.enabled ||
    currentConfig.url !== desiredConfig.url ||
    currentConfig.webhook_by_events !== desiredConfig.webhook_by_events ||
    currentConfig.webhook_base64 !== desiredConfig.webhook_base64 ||
    !areWebhookEventSetsEqual(currentConfig.events, desiredConfig.events);

  if (!needsReapply) {
    logger.info(
      {
        instanceName: desiredConfig.instanceName,
        webhookUrl: desiredConfig.url,
        webhookEvents: desiredConfig.events,
      },
      'Webhook da instancia Evolution ja corresponde a configuracao minima segura'
    );

    return {
      ok: true,
      reapplied: false,
      current: currentConfig,
      desired: desiredConfig,
    };
  }

  logger.warn(
    {
      instanceName: desiredConfig.instanceName,
      currentWebhookConfig: currentConfig,
      desiredWebhookConfig: desiredConfig,
    },
    'Webhook da instancia Evolution diverge da configuracao minima segura; reaplicando'
  );

  const updatedConfig = await setInstanceWebhook({
    instanceName: desiredConfig.instanceName,
    webhookUrl: desiredConfig.url,
  });

  return {
    ok: true,
    reapplied: true,
    current: updatedConfig,
    desired: desiredConfig,
  };
};

export const healthCheck = async (): Promise<{ ok: boolean; error?: unknown }> => {
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

export const createInstance = async ({ instanceName = null, webhookUrl = null }: { instanceName?: string | null; webhookUrl?: string | null } = {}): Promise<unknown> => {
  const config = getConfig({ instanceName, webhookUrl });
  const desiredWebhookConfig = buildDesiredWebhookConfig({ instanceName, webhookUrl });

  const payload = await requestTryingPayloads(
    [
      // Evolution API v2 nested webhook format
      {
        method: 'POST',
        path: '/instance/create',
        body: {
          instanceName: config.instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          ...(desiredWebhookConfig.url ? {
            webhook: {
              enabled: true,
              url: desiredWebhookConfig.url,
              events: desiredWebhookConfig.events,
              webhook_by_events: desiredWebhookConfig.webhook_by_events,
              webhook_base64: desiredWebhookConfig.webhook_base64,
            },
          } : {}),
        },
        expectedStatuses: [200, 201, 403, 409],
        instanceName: config.instanceName,
      },
      // Evolution API v1 flat format
      {
        method: 'POST',
        path: '/instance/create',
        body: {
          instanceName: config.instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook: desiredWebhookConfig.url || undefined,
          webhook_by_events: desiredWebhookConfig.webhook_by_events,
          webhook_base64: desiredWebhookConfig.webhook_base64,
          webhook_events: desiredWebhookConfig.events,
        },
        expectedStatuses: [200, 201, 403, 409],
        instanceName: config.instanceName,
      },
    ],
    'createInstance'
  );

  try {
    await ensureInstanceWebhookConfig({
      instanceName: config.instanceName,
      webhookUrl: desiredWebhookConfig.url,
    });
  } catch (webhookErr) {
    logger.warn(
      { err: webhookErr, instanceName: config.instanceName },
      'createInstance: falha ao configurar webhook pos-criacao; instancia criada mas webhook pode divergir'
    );
  }

  return payload;
};

export const connectInstance = async ({ instanceName = null }: { instanceName?: string | null } = {}): Promise<unknown> => {
  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });

  return requestWithFallback(
    [
      { method: 'GET', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
      { method: 'POST', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
    ],
    'connectInstance'
  );
};

export const getInstanceStatus = async ({ instanceName = null }: { instanceName?: string | null } = {}): Promise<unknown> => {
  const { instanceName: resolvedInstanceName, baseURL } = getConfig({ instanceName });
  const statusUrls = [
    `${baseURL}/instance/connectionState/${resolvedInstanceName}`,
  ];

  try {
    const payload = await requestWithFallback(
      [
        { method: 'GET', path: `/instance/connectionState/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
      ],
      'getInstanceStatus'
    );

    if (isInstanceNotFoundError({ details: payload }, { instanceName: resolvedInstanceName })) {
      throw new EvolutionApiError(`Instancia '${resolvedInstanceName}' nao existe na Evolution`, {
        status: 404,
        details: payload,
        code: 'EVOLUTION_INSTANCE_NOT_FOUND',
      });
    }

    logger.info(
      {
        urlCalled: statusUrls,
        instanceName: resolvedInstanceName,
        evolutionStatus: extractInstanceConnectionState(payload),
      },
      'Status da instancia consultado na Evolution API'
    );

    return payload;
  } catch (error) {
    if (
      !(error instanceof EvolutionApiError) ||
      (![404, 405].includes(error.status || 0) && !isInstanceNotFoundError(error, { instanceName: resolvedInstanceName }))
    ) {
      throw error;
    }

    logger.warn(
      {
        urlCalled: statusUrls,
        instanceName: resolvedInstanceName,
        evolutionStatus: (error as EvolutionApiError)?.status || null,
      },
      'Consulta direta de status da instancia falhou, tentando via lista de instancias'
    );

    const payload = await requestWithFallback(
      [
        { method: 'GET', path: '/instance/fetchInstances' },
        { method: 'GET', path: '/instance/list' },
      ],
      'getInstanceStatusFromList'
    );

    const instances = unwrapInstancesList(payload);
    const { instanceName: name } = getConfig({ instanceName: resolvedInstanceName });

    const current = instances.find((item) => {
      const itemObj = item as Record<string, unknown>;
      const itemInstance = itemObj?.instance as Record<string, unknown> | undefined;
      const n = itemObj?.name || itemObj?.instanceName || itemInstance?.instanceName;
      return n === name;
    });

    if (!current) {
      throw new EvolutionApiError(`Instancia '${name}' nao existe na Evolution`, {
        status: 404,
        details: payload,
        code: 'EVOLUTION_INSTANCE_NOT_FOUND',
      });
    }

    logger.info(
      {
        urlCalled: [`${baseURL}/instance/fetchInstances`, `${baseURL}/instance/list`],
        instanceName: name,
        evolutionStatus: extractInstanceConnectionState(current),
      },
      'Status da instancia resolvido via lista de instancias da Evolution'
    );

    return current;
  }
};

export const getInstanceMe = async ({ instanceName = null }: { instanceName?: string | null } = {}): Promise<unknown> => {
  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });
  const encodedInstanceName = encodeURIComponent(resolvedInstanceName);

  return requestWithFallback(
    [
      {
        method: 'GET',
        path: `/instance/me/${encodedInstanceName}`,
        expectedStatuses: [200, 204, 404],
        instanceName: resolvedInstanceName,
      },
      {
        method: 'GET',
        path: `/instance/me?instanceName=${encodedInstanceName}`,
        expectedStatuses: [200, 204, 404],
        instanceName: resolvedInstanceName,
      },
      {
        method: 'GET',
        path: `/instance/me?instance=${encodedInstanceName}`,
        expectedStatuses: [200, 204, 404],
        instanceName: resolvedInstanceName,
      },
    ],
    'getInstanceMe'
  );
};

export const getQrCode = async ({ instanceName = null }: { instanceName?: string | null } = {}): Promise<unknown> => {
  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });

  return requestWithFallback(
    [
      { method: 'GET', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
      { method: 'POST', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
    ],
    'getQrCode'
  );
};

export const logoutInstance = async ({ instanceName = null }: { instanceName?: string | null } = {}): Promise<unknown> => {
  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });

  return requestWithFallback(
    [
      { method: 'DELETE', path: `/instance/logout/${resolvedInstanceName}`, expectedStatuses: [200, 202, 204], instanceName: resolvedInstanceName },
      { method: 'POST', path: `/instance/logout/${resolvedInstanceName}`, expectedStatuses: [200, 202, 204], instanceName: resolvedInstanceName },
      { method: 'DELETE', path: `/instance/disconnect/${resolvedInstanceName}`, expectedStatuses: [200, 202, 204], instanceName: resolvedInstanceName },
      { method: 'POST', path: `/instance/disconnect/${resolvedInstanceName}`, expectedStatuses: [200, 202, 204], instanceName: resolvedInstanceName },
    ],
    'logoutInstance'
  );
};

export const deleteInstance = async ({ instanceName = null }: { instanceName?: string | null } = {}): Promise<unknown> => {
  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });

  return requestWithFallback(
    [
      { method: 'DELETE', path: `/instance/delete/${resolvedInstanceName}`, expectedStatuses: [200, 202, 204], instanceName: resolvedInstanceName },
      { method: 'DELETE', path: `/instance/${resolvedInstanceName}`, expectedStatuses: [200, 202, 204], instanceName: resolvedInstanceName },
    ],
    'deleteInstance'
  );
};

export const sendTextMessage = async ({
  phone,
  text,
  remoteJidOriginal = null,
  instanceName = null,
  // FIX Evolution API v1 @lid: quando true, o `phone` é um @lid JID completo
  // e deve ser passado diretamente para a Evolution API sem normalização E.164
  allowLidPhone = false,
}: {
  phone: string;
  text: string;
  remoteJidOriginal?: string | null;
  instanceName?: string | null;
  allowLidPhone?: boolean;
}): Promise<{
  payload: unknown;
  meta: {
    endpoint: string;
    payloadShape: string | null;
    candidateIndex: number | null;
  };
}> => {
  const config = getConfig({ instanceName });
  const resolvedInstanceName = typeof instanceName === 'string' && instanceName.trim()
    ? instanceName.trim().toLowerCase()
    : config.instanceName;

  // FIX: detectar se o phone é um @lid JID (ex: '247269873942566@lid')
  // A Evolution API v1 aceita @lid como destino e roteia via Baileys corretamente
  const isLidDestination = allowLidPhone === true &&
    typeof phone === 'string' &&
    phone.trim().toLowerCase().endsWith('@lid');

  // Normalizar conforme o tipo de destino
  const normalizedPhone = isLidDestination ? phone.trim() : normalizePhoneForSend(phone);
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

  logger.debug(
    {
      phone,
      isLidDestination,
      normalizedPhone,
      remoteJidOriginal,
      endpoint: `/message/sendText/${resolvedInstanceName}`,
    },
    'Preparando envio de mensagem para Evolution API'
  );

  const candidates: RequestCandidate[] = [
    // Evolution API v2 format
    {
      method: 'POST',
      path: `/message/sendText/${resolvedInstanceName}`,
      body: {
        number: normalizedPhone,
        text: normalizedText,
        delay: 1200,
      },
    },
    {
      method: 'POST',
      path: `/message/sendText/${resolvedInstanceName}`,
      body: {
        number: normalizedPhone,
        options: {
          delay: 1200,
          linkPreview: false,
          presence: 'composing',
          checkNumber: false,
        },
        textMessage: {
          text: normalizedText,
        },
      },
    },
    {
      method: 'POST',
      path: `/message/sendText/${resolvedInstanceName}`,
      body: {
        instanceName: resolvedInstanceName,
        number: normalizedPhone,
        options: {
          delay: 1200,
          linkPreview: false,
          presence: 'composing',
          checkNumber: false,
        },
        textMessage: {
          text: normalizedText,
        },
      },
    },
  ];

  // FIX: passar allowLidPhone no contexto para filterIncompatibleSendTextCandidates
  const compatibleCandidates = filterIncompatibleSendTextCandidates(candidates, {
    phone,
    remoteJidOriginal,
    allowLidPhone: isLidDestination,
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
      isLidDestination,
      endpoint: `/message/sendText/${resolvedInstanceName}`,
      payloadShapes: compatibleCandidates.map((candidate) => describePayloadShape(candidate?.body)),
    },
    'Enviando mensagem de texto para Evolution API'
  );

  let requestResult: RequestWithPayloadResult | null = null;

  try {
    requestResult = await requestTryingPayloads(
      compatibleCandidates,
      'sendTextMessage',
      [400, 409, 415, 422],
      { includeMeta: true }
    ) as RequestWithPayloadResult;
  } catch (error) {
    const sessionStateError = isSessionStateError(error);
    const providerError = getProviderErrorMessage(error);

    if (error && typeof error === 'object') {
      const errorObj = error as Record<string, unknown>;
      errorObj.sessionStateError = sessionStateError;
      errorObj.providerError = providerError;
      errorObj.instanceName = resolvedInstanceName;

      if (sessionStateError && error instanceof EvolutionApiError) {
        error.code = 'EVOLUTION_SESSION_STATE_ERROR';
      }
    }

    throw error;
  }

  return {
    payload: requestResult?.payload ?? null,
    meta: {
      endpoint: (requestResult?.candidate as RequestCandidate)?.path || `/message/sendText/${resolvedInstanceName}`,
      payloadShape: requestResult?.payloadShape || null,
      candidateIndex: typeof requestResult?.candidateIndex === 'number'
        ? requestResult.candidateIndex
        : null,
    },
  };
};

// Resolve a WhatsApp @lid JID to an actual customer phone number via Evolution API contact store.
// @lid JIDs (linked device identifiers) appear as remoteJid in Evolution API v1.7.x webhooks
// when the sender is using a linked device. The actual customer phone is NOT in the webhook payload
// for these messages — we must query the contact store to resolve it.
export const resolvePhoneFromLidJid = async ({
  lidJid,
  instanceName = null,
}: {
  lidJid: string;
  instanceName?: string | null;
}): Promise<string | null> => {
  if (!lidJid || typeof lidJid !== 'string' || !lidJid.trim().toLowerCase().endsWith('@lid')) {
    return null;
  }

  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });
  const encodedLid = encodeURIComponent(lidJid.trim());

  const tryExtractPhone = (data: unknown): string | null => {
    const items: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)['contacts'])
        ? (data as Record<string, unknown>)['contacts'] as unknown[]
        : data ? [data] : [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const c = item as Record<string, unknown>;
      for (const field of ['phoneJid', 'remoteJid', 'number', 'jid', 'phone']) {
        const val = c[field];
        if (typeof val !== 'string' || !val) continue;
        const digits = val.includes('@') ? val.split('@')[0] : val;
        if (/^\d{10,}$/.test(digits)) return digits;
      }
    }
    return null;
  };

  const endpoints: Array<{ method: 'GET' | 'POST'; path: string; body?: Record<string, unknown> }> = [
    {
      method: 'POST',
      path: `/contact/findContacts/${resolvedInstanceName}`,
      body: { where: { id: lidJid.trim() } },
    },
    {
      method: 'GET',
      path: `/contact/findContacts/${resolvedInstanceName}?id=${encodedLid}`,
    },
    {
      method: 'POST',
      path: `/chat/findChats/${resolvedInstanceName}`,
      body: { where: { id: lidJid.trim() } },
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await request({
        ...endpoint,
        expectedStatuses: [200, 404],
        instanceName: resolvedInstanceName,
      });
      const phone = tryExtractPhone(result);
      if (phone) {
        logger.info(
          { lidJid, phone, endpoint: endpoint.path },
          'Resolved @lid JID to phone via Evolution API contact store'
        );
        return phone;
      }
    } catch {
      // Try next endpoint
    }
  }

  logger.warn(
    { lidJid, instanceName: resolvedInstanceName },
    'Could not resolve @lid JID to phone via Evolution API — contact store lookup exhausted'
  );
  return null;
};
