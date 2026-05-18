import logger from '../../utils/logger.js';
import { EvolutionApiError, InstanceNotFoundError } from './whatsapp.types.js';

const TIMEOUT_MS = 15_000;

// Canonical list of Evolution v2 webhook events we subscribe to.
// CASE MATTERS: Evolution v2 expects SCREAMING_SNAKE_CASE on the wire.
// Exported so the admin diagnostics endpoint can echo it back.
export const WEBHOOK_EVENTS = [
  'APPLICATION_STARTUP',
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
  'CALL',
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function cfg() {
  const baseUrl = (process.env.EVOLUTION_API_URL ?? '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY ?? '';
  if (!baseUrl || !apiKey) {
    throw new EvolutionApiError('EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados', 0);
  }
  return { baseUrl, apiKey };
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  attempt = 1,
): Promise<T> {
  const { baseUrl, apiKey } = cfg();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (networkErr) {
    clearTimeout(timer);
    if (attempt < 3) {
      const delay = Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      logger.warn({ path, attempt, delay }, 'evolution-api: erro de rede, retentando');
      await sleep(delay);
      return request<T>(method, path, body, attempt + 1);
    }
    throw networkErr;
  }
  clearTimeout(timer);

  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }

  // 404 = instância não existe — NÃO é erro transiente, NÃO deve ser retentado
  if (res.status === 404) {
    throw new InstanceNotFoundError(path);
  }

  // Retry apenas em 5xx (erros da Evolution API, não do cliente)
  if (!res.ok) {
    if (res.status >= 500 && attempt < 3) {
      const delay = Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      logger.warn({ path, status: res.status, attempt, delay }, 'evolution-api: 5xx, retentando');
      await sleep(delay);
      return request<T>(method, path, body, attempt + 1);
    }
    // Log the full response body for 4xx so we can read Evolution's own
    // error message (e.g. "validation failed: webhookByEvents must be boolean").
    logger.warn(
      {
        method,
        path,
        status: res.status,
        responseBody,
        requestBodyPreview:
          body !== undefined
            ? JSON.stringify(body).slice(0, 500)
            : null,
      },
      'evolution-api: 4xx, body completo da resposta',
    );
    throw new EvolutionApiError(
      `Evolution API ${method} ${path} → ${res.status}`,
      res.status,
      responseBody,
    );
  }

  return responseBody as T;
}

export interface ConnectionStateResponse {
  instance?: { instanceName?: string; state?: string };
  state?: string;
}

export const evolutionApi = {
  async createInstance(instanceName: string, webhookUrl: string): Promise<unknown> {
    // Evolution v2 uses camelCase (webhookByEvents / webhookBase64).
    // Snake_case keys are also included for transient backward compatibility
    // with older v2.x builds (Evolution ignores unknown keys).
    const payload = {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: true,
        webhookBase64: false,
        webhook_by_events: true,
        webhook_base64: false,
        events: WEBHOOK_EVENTS,
      },
    };
    logger.info(
      {
        instanceName,
        webhookUrl,
        webhookByEvents: true,
        events: WEBHOOK_EVENTS,
        eventCount: WEBHOOK_EVENTS.length,
        payload,
      },
      'evolution-api: createInstance — payload completo',
    );
    return request('POST', '/instance/create', payload);
  },

  async deleteInstance(instanceName: string): Promise<void> {
    logger.info({ instanceName }, 'evolution-api: deleteInstance');
    try {
      await request('DELETE', `/instance/${instanceName}/deleteInstance`);
    } catch (err) {
      if (err instanceof InstanceNotFoundError) {
        logger.debug({ instanceName }, 'evolution-api: deleteInstance → instância já removida');
        return;
      }
      throw err;
    }
  },

  async logoutInstance(instanceName: string): Promise<void> {
    logger.info({ instanceName }, 'evolution-api: logoutInstance — clearing WhatsApp session');
    try {
      await request('DELETE', `/instance/logout/${instanceName}`);
    } catch (err) {
      if (err instanceof InstanceNotFoundError) {
        logger.debug({ instanceName }, 'evolution-api: logoutInstance → instância não encontrada');
        return;
      }
      // Non-fatal: log and continue. A subsequent connectInstance will still
      // attempt the connection; worst case it retries the old session.
      logger.warn({ err, instanceName }, 'evolution-api: logoutInstance falhou (não fatal)');
    }
  },

  async getConnectionState(instanceName: string): Promise<ConnectionStateResponse> {
    return request<ConnectionStateResponse>('GET', `/instance/connectionState/${instanceName}`);
  },

  async restartInstance(instanceName: string): Promise<unknown> {
    return request('POST', `/instance/${instanceName}/restart`);
  },

  async fetchInstances(): Promise<unknown[]> {
    return request<unknown[]>('GET', '/instance/fetchInstances');
  },

  /**
   * Returns true when Evolution already has an instance with the given name.
   * Tolerates the multiple shapes the v1/v2 fetchInstances response can take:
   *   - [{ instance: { instanceName: 'x' } }, ...]
   *   - [{ name: 'x' }, ...]
   *   - [{ instanceName: 'x' }, ...]
   */
  async instanceExists(instanceName: string): Promise<boolean> {
    const target = instanceName.trim().toLowerCase();
    if (!target) return false;
    try {
      const list = await this.fetchInstances();
      if (!Array.isArray(list)) return false;
      return list.some((raw) => {
        const item = raw as Record<string, unknown> | null;
        if (!item || typeof item !== 'object') return false;
        const inner = (item['instance'] as Record<string, unknown> | undefined) ?? null;
        const candidate =
          (typeof item['instanceName'] === 'string' && (item['instanceName'] as string)) ||
          (typeof item['name'] === 'string' && (item['name'] as string)) ||
          (inner && typeof inner['instanceName'] === 'string' && (inner['instanceName'] as string)) ||
          (inner && typeof inner['name'] === 'string' && (inner['name'] as string)) ||
          '';
        return String(candidate).trim().toLowerCase() === target;
      });
    } catch (err) {
      logger.warn({ err, instanceName }, 'evolution-api: instanceExists check failed, assuming false');
      return false;
    }
  },

  /**
   * GET /instance/connect/{instanceName} — requests a fresh QR code for an
   * existing instance without destroying its session (idempotent).
   */
  async connectInstance(instanceName: string): Promise<unknown> {
    logger.info({ instanceName }, 'evolution-api: connectInstance');
    return request('GET', `/instance/connect/${instanceName}`);
  },

  async sendText(instanceName: string, number: string, text: string): Promise<unknown> {
    return request('POST', `/message/sendText/${instanceName}`, { number, text });
  },

  async setWebhook(instanceName: string, webhookUrl: string): Promise<unknown> {
    // Evolution v2 setWebhook expects the camelCase keys inside `webhook`.
    // We send both camel and snake variants so the call also works on
    // intermediate v2.x builds that haven't fully renamed the schema.
    const payload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: WEBHOOK_EVENTS,
        webhookByEvents: true,
        webhookBase64: false,
        webhook_by_events: true,
        webhook_base64: false,
      },
    };
    logger.info(
      {
        instanceName,
        path: `/webhook/set/${instanceName}`,
        webhookUrl,
        webhookByEvents: true,
        webhookBase64: false,
        events: WEBHOOK_EVENTS,
        eventCount: WEBHOOK_EVENTS.length,
        payload,
      },
      'evolution-api: setWebhook — payload completo',
    );
    try {
      return await request('POST', `/webhook/set/${instanceName}`, payload);
    } catch (err) {
      // Some Evolution v2.x builds reject the dual-key payload with 400
      // (strict schema). Retry once with only the camelCase keys.
      if (err instanceof EvolutionApiError && err.status === 400) {
        const v2OnlyPayload = {
          webhook: {
            enabled: true,
            url: webhookUrl,
            events: WEBHOOK_EVENTS,
            webhookByEvents: true,
            webhookBase64: false,
          },
        };
        logger.warn(
          { instanceName, retryPayload: v2OnlyPayload },
          'evolution-api: setWebhook 400, retentando com payload v2 estrito (camelCase only)',
        );
        try {
          return await request('POST', `/webhook/set/${instanceName}`, v2OnlyPayload);
        } catch (err2) {
          // Last-ditch retry with the v1 snake_case flat schema.
          if (err2 instanceof EvolutionApiError && err2.status === 400) {
            const v1FlatPayload = {
              url: webhookUrl,
              enabled: true,
              webhook_by_events: true,
              webhook_base64: false,
              events: WEBHOOK_EVENTS,
            };
            logger.warn(
              { instanceName, retryPayload: v1FlatPayload },
              'evolution-api: setWebhook 400 v2-only, retentando com payload v1 flat (snake_case)',
            );
            return await request('POST', `/webhook/set/${instanceName}`, v1FlatPayload);
          }
          throw err2;
        }
      }
      throw err;
    }
  },

  async getWebhook(instanceName: string): Promise<unknown> {
    return request('GET', `/webhook/find/${instanceName}`);
  },

  /**
   * Evolution exposes its build info at `GET /` (no auth).
   * Useful for confirming v2 vs v1 schema expectations from diagnostics.
   */
  async getInfo(): Promise<unknown> {
    const { baseUrl } = cfg();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`${baseUrl}/`, { signal: controller.signal });
      clearTimeout(timer);
      try {
        return await res.json();
      } catch {
        return { status: res.status, body: null };
      }
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  },
};
