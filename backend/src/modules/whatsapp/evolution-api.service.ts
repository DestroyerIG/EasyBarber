import logger from '../../utils/logger.js';
import { EvolutionApiError, InstanceNotFoundError } from './whatsapp.types.js';

const TIMEOUT_MS = 15_000;
const WEBHOOK_EVENTS = [
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'QRCODE_UPDATED',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
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
    logger.info({ instanceName }, 'evolution-api: createInstance');
    return request('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: webhookUrl,
        webhook_by_events: true,
        webhook_base64: false,
        events: WEBHOOK_EVENTS,
      },
    });
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
    logger.info({ instanceName }, 'evolution-api: setWebhook');
    return request('POST', `/webhook/set/${instanceName}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: WEBHOOK_EVENTS,
        webhook_by_events: true,
        webhook_base64: false,
      },
    });
  },

  async getWebhook(instanceName: string): Promise<unknown> {
    return request('GET', `/webhook/find/${instanceName}`);
  },
};
