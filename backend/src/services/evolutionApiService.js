import logger from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.EVOLUTION_API_TIMEOUT_MS || '10000', 10);

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

  return {
    baseURL,
    apiKey,
    instanceName,
    webhookUrl,
    timeoutMs: DEFAULT_TIMEOUT_MS,
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
  const headers = {
    'Content-Type': 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };

  return headers;
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

const extractErrorMessage = (payload) => {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return null;
};

const request = async ({ method, path, body = undefined, expectedStatuses = [200, 201] }) => {
  ensureConfigured();

  const { baseURL, timeoutMs } = getConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseURL}${normalizePath(path)}`, {
      method,
      headers: buildHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await parseResponseBody(response);

    if (!expectedStatuses.includes(response.status)) {
      const message = extractErrorMessage(payload) || `Evolution API respondeu com status ${response.status}`;
      throw new EvolutionApiError(message, {
        status: response.status,
        details: payload,
      });
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new EvolutionApiError('Timeout ao chamar Evolution API', {
        code: 'EVOLUTION_TIMEOUT',
      });
    }

    if (error instanceof EvolutionApiError) {
      throw error;
    }

    throw new EvolutionApiError(error.message || 'Falha de comunicacao com Evolution API', {
      code: 'EVOLUTION_NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const requestWithFallback = async (candidates, operationName) => {
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await request(candidate);
    } catch (error) {
      lastError = error;

      if (error instanceof EvolutionApiError && [404, 405, 501].includes(error.status || 0)) {
        logger.debug({ operationName, method: candidate.method, path: candidate.path }, 'Endpoint fallback da Evolution API');
        continue;
      }

      throw error;
    }
  }

  throw lastError || new EvolutionApiError(`${operationName} indisponivel`);
};

const unwrapInstancesList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.instances)) return payload.instances;
  return [];
};

export const getEvolutionConfig = () => {
  const { baseURL, instanceName, webhookUrl, timeoutMs } = getConfig();

  return {
    baseURL,
    instanceName,
    webhookUrl,
    timeoutMs,
  };
};

export const healthCheck = async () => {
  try {
    ensureConfigured();

    await requestWithFallback(
      [
        { method: 'GET', path: '/health', expectedStatuses: [200] },
        { method: 'GET', path: '/manager/health', expectedStatuses: [200] },
      ],
      'healthCheck'
    );

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error,
    };
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
          webhook_base64: true,
          webhook_events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        },
        expectedStatuses: [200, 201, 409],
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
    const current = instances.find((item) => {
      const name = item?.name || item?.instanceName || item?.instance?.instanceName;
      return name === instanceName;
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

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

export const sendTextMessage = async ({ phone, text }) => {
  const { instanceName } = getConfig();
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    throw new EvolutionApiError('Numero de telefone invalido para envio', {
      code: 'EVOLUTION_INVALID_PHONE',
    });
  }

  if (!text || !String(text).trim()) {
    throw new EvolutionApiError('Texto da mensagem vazio', {
      code: 'EVOLUTION_INVALID_MESSAGE',
    });
  }

  const payloads = [
    {
      number: normalizedPhone,
      text: String(text),
    },
    {
      number: normalizedPhone,
      textMessage: { text: String(text) },
    },
    {
      instanceName,
      number: normalizedPhone,
      text: String(text),
    },
    {
      instanceName,
      number: normalizedPhone,
      textMessage: { text: String(text) },
    },
  ];

  const candidates = [];
  for (const body of payloads) {
    candidates.push({ method: 'POST', path: `/message/sendText/${instanceName}`, body });
    candidates.push({ method: 'POST', path: '/message/sendText', body });
  }

  return requestWithFallback(candidates, 'sendTextMessage');
};

export { EvolutionApiError };
