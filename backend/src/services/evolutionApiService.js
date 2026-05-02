import logger from '../utils/logger.js';
import { normalizePhoneForSend } from '../utils/whatsapp.js';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_ATTEMPTS = 1;
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_EVOLUTION_WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'];
const ALLOWED_EVOLUTION_WEBHOOK_EVENTS = new Set(DEFAULT_EVOLUTION_WEBHOOK_EVENTS);
const BLOCKED_HEAVY_WEBHOOK_EVENTS = new Set([
  'MESSAGES_SET',
  'MESSAGESSET',
]);

const normalizeWebhookEventToken = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[.\-\s]+/g, '_')
    .replace(/_+/g, '_');

const normalizeWebhookEvents = (value) => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((eventName) => normalizeWebhookEventToken(eventName))
        .filter(Boolean)
    )
  );
};

const sanitizeWebhookEvents = (value) => {
  const normalized = normalizeWebhookEvents(value);
  const allowed = [];
  const blocked = [];
  const unsupported = [];

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

const parseWebhookEventsFromEnv = () => {
  const raw = String(process.env.EVOLUTION_WEBHOOK_EVENTS || '').trim();
  if (!raw) return DEFAULT_EVOLUTION_WEBHOOK_EVENTS;

  return sanitizeWebhookEvents(raw.split(','));
};

const buildDesiredWebhookConfig = ({ instanceName = null, webhookUrl = null } = {}) => {
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

const normalizeWebhookConfigSnapshot = (payload = {}) => {
  const webhookNode =
    payload?.webhook && typeof payload.webhook === 'object'
      ? payload.webhook
      : payload?.webhook?.webhook && typeof payload.webhook.webhook === 'object'
        ? payload.webhook.webhook
        : payload;

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

const areWebhookEventSetsEqual = (left = [], right = []) => {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((eventName) => rightSet.has(eventName));
};

class EvolutionApiError extends Error {
  constructor(message, { status = null, details = null, code = 'EVOLUTION_API_ERROR' } = {}) {
    super(message);
    this.name = 'EvolutionApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

const normalizeInstanceName = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
};

const getConfig = (overrides = {}) => {
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

const ensureConfigured = (overrides = {}) => {
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

const normalizePath = (path) => (path.startsWith('/') ? path : `/${path}`);

const buildHeaders = (overrides = {}) => {
  const { apiKey } = getConfig(overrides);

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

const normalizeProviderMessage = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const hasInstanceNotFoundMessage = (value, instanceName = '') => {
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

export const isInstanceNotFoundError = (error = null, options = {}) => {
  if (!error) {
    return false;
  }

  if (error?.code === 'EVOLUTION_INSTANCE_NOT_FOUND') {
    return true;
  }

  const status = Number(error?.status || 0);
  if (status === 404) {
    return true;
  }

  const { instanceName } = getConfig(options);
  const providerError = getProviderErrorMessage(error);
  const detailMessage = extractErrorMessage(error?.details);

  return (
    hasInstanceNotFoundMessage(providerError, instanceName) ||
    hasInstanceNotFoundMessage(detailMessage, instanceName) ||
    hasInstanceNotFoundMessage(safeStringify(error?.details), instanceName)
  );
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

const request = async ({ method, path, body = undefined, expectedStatuses = [200, 201], instanceName = null }) => {
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
          await sleep(250 * attempt);
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
            instanceName: resolvedInstanceName,
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

const extractInstanceConnectionState = (payload) => {
  const candidates = [
    payload?.status,
    payload?.state,
    payload?.connectionStatus,
    payload?.instance?.status,
    payload?.instance?.state,
    payload?.instance?.connectionStatus,
    payload?.data?.status,
    payload?.data?.state,
    payload?.data?.connectionStatus,
  ];

  const match = candidates.find((value) => typeof value === 'string' && value.trim());
  return match ? match.trim().toLowerCase() : null;
};

export const getEvolutionConfig = (options = {}) => {
  const { baseURL, instanceName, webhookUrl, timeoutMs, retryAttempts } = getConfig(options);

  return {
    baseURL,
    instanceName,
    webhookUrl,
    timeoutMs,
    retryAttempts,
  };
};

export const getInstanceWebhook = async ({ instanceName = null } = {}) => {
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

export const setInstanceWebhook = async ({ instanceName = null, webhookUrl = null } = {}) => {
  const desiredConfig = buildDesiredWebhookConfig({ instanceName, webhookUrl });

  const payload = await requestWithFallback(
    [
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

export const ensureInstanceWebhookConfig = async ({ instanceName = null, webhookUrl = null } = {}) => {
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

  let currentConfig = null;

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

export const createInstance = async ({ instanceName = null, webhookUrl = null } = {}) => {
  const config = getConfig({ instanceName, webhookUrl });
  const desiredWebhookConfig = buildDesiredWebhookConfig({ instanceName, webhookUrl });

  const payload = await requestWithFallback(
    [
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

  await ensureInstanceWebhookConfig({
    instanceName: config.instanceName,
    webhookUrl: desiredWebhookConfig.url,
  });

  return payload;
};

export const connectInstance = async ({ instanceName = null } = {}) => {
  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });

  return requestWithFallback(
    [
      { method: 'POST', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
      { method: 'GET', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
    ],
    'connectInstance'
  );
};

export const getInstanceStatus = async ({ instanceName = null } = {}) => {
  const { instanceName: resolvedInstanceName, baseURL } = getConfig({ instanceName });
  const statusUrls = [
    `${baseURL}/instance/connectionState/${resolvedInstanceName}`,
    `${baseURL}/instance/status/${resolvedInstanceName}`,
  ];

  try {
    const payload = await requestWithFallback(
      [
        { method: 'GET', path: `/instance/connectionState/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
        { method: 'GET', path: `/instance/status/${resolvedInstanceName}` },
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
        evolutionStatus: error?.status || null,
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
      const n = item?.name || item?.instanceName || item?.instance?.instanceName;
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

export const getQrCode = async ({ instanceName = null } = {}) => {
  const { instanceName: resolvedInstanceName } = getConfig({ instanceName });

  return requestWithFallback(
    [
      { method: 'GET', path: `/instance/qrcode/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
      { method: 'GET', path: `/instance/qr/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
      { method: 'GET', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
      { method: 'POST', path: `/instance/connect/${resolvedInstanceName}`, instanceName: resolvedInstanceName },
    ],
    'getQrCode'
  );
};

export const logoutInstance = async ({ instanceName = null } = {}) => {
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

export const sendTextMessage = async ({ phone, text, remoteJidOriginal = null, instanceName = null }) => {
  const config = getConfig({ instanceName });
  const resolvedInstanceName = typeof instanceName === 'string' && instanceName.trim()
    ? instanceName.trim().toLowerCase()
    : config.instanceName;
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
      endpoint: `/message/sendText/${resolvedInstanceName}`,
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
      error.instanceName = resolvedInstanceName;

      if (sessionStateError && error instanceof EvolutionApiError) {
        error.code = 'EVOLUTION_SESSION_STATE_ERROR';
      }
    }

    throw error;
  }

  return {
    payload: requestResult?.payload ?? null,
    meta: {
      endpoint: requestResult?.candidate?.path || `/message/sendText/${resolvedInstanceName}`,
      payloadShape: requestResult?.payloadShape || null,
      candidateIndex: typeof requestResult?.candidateIndex === 'number'
        ? requestResult.candidateIndex
        : null,
    },
  };
};

export { EvolutionApiError };
