import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { evolutionApi, type ConnectionStateResponse } from './evolution-api.service.js';
import { EvolutionApiError, InstanceNotFoundError } from './whatsapp.types.js';
import type { NormalizedStatus } from './whatsapp.types.js';
import {
  ensureBarbershopWhatsAppInstanceName,
  getBarbershopWhatsAppInstanceContext,
} from '../../services/whatsapp/whatsappInstanceService.js';
import { getCachedQrCode } from '../../services/whatsapp/handlers/qrcodeUpdatedHandler.js';

/**
 * True when Evolution returns 403 with a body indicating the instance name is
 * already taken. The exact shape is `{ status: 403, error: 'Forbidden',
 * response: { message: ['This name "..." is already in use.'] } }`.
 */
function isAlreadyInUseError(err: unknown): boolean {
  if (!(err instanceof EvolutionApiError) || err.status !== 403) return false;
  const body = err.body as { response?: { message?: unknown } } | null;
  const messages = Array.isArray(body?.response?.message)
    ? (body?.response?.message as unknown[])
    : [];
  return messages.some(
    (m) => typeof m === 'string' && m.toLowerCase().includes('already in use'),
  );
}

/**
 * Event suffixes Evolution v2 may have appended already. If the env value
 * accidentally includes one (or a chain of them), we strip back to the bare
 * base — otherwise Evolution appends the event again and we end up with
 * `.../connection-update/connection-update` 404s.
 */
const KNOWN_EVENT_SUFFIXES = [
  '/connection-update',
  '/qrcode-updated',
  '/messages-upsert',
  '/messages-update',
  '/messages-set',
  '/send-message',
  '/contacts-update',
  '/chats-update',
  '/presence-update',
];

/**
 * Hostnames we know belong to the frontend. The webhook MUST hit the backend
 * Render service, never the Vercel frontend (which has no /api/v1/whatsapp/
 * routes and returns 404). We fail loud on misconfiguration instead of
 * silently registering an unreachable URL on the Evolution server.
 */
const FRONTEND_HOST_BLOCKLIST = [/\.vercel\.app$/i, /barberpro-saas/i];

/**
 * Returns the canonical webhook BASE url to register on Evolution v2.
 *
 * Resolution order:
 *   1. BACKEND_WEBHOOK_BASE_URL (preferred, explicit)
 *   2. EVOLUTION_WEBHOOK_URL    (legacy name)
 *
 * Then:
 *   - Trims trailing slashes
 *   - Strips any accidental event suffix(es) (handles single + chained)
 *   - Refuses Vercel/frontend hosts (would 404 on every event)
 *   - Returns '' if nothing is configured (callers throw with a clear msg)
 */
export const normalizeWebhookBaseUrl = (raw: string | null | undefined): string => {
  let url = String(raw ?? '').trim();
  if (!url) return '';

  url = url.replace(/\/+$/, '');

  // Strip any number of accidentally-chained event suffixes.
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of KNOWN_EVENT_SUFFIXES) {
      if (url.toLowerCase().endsWith(suffix)) {
        url = url.slice(0, -suffix.length);
        stripped = true;
      }
    }
  }

  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`Webhook base URL inválida: "${raw}"`);
  }

  if (FRONTEND_HOST_BLOCKLIST.some((pattern) => pattern.test(host))) {
    throw new Error(
      `Webhook base URL aponta para o frontend (${host}). ` +
        'Use a URL do backend (ex.: https://easybarber-backend.onrender.com/api/v1/whatsapp/webhook). ' +
        'Configure BACKEND_WEBHOOK_BASE_URL no serviço backend (Render), não no Vercel.',
    );
  }

  return url;
};

/**
 * Builds the full per-event URL Evolution v2 would call (used in logs and to
 * sanity-check the round trip). Evolution itself does the appending when
 * webhook_by_events=true, so we never POST this URL to Evolution — we only
 * register the base. Exposed for logs/tests.
 */
export const buildWebhookUrl = (baseUrl: string, event: string): string => {
  const base = normalizeWebhookBaseUrl(baseUrl);
  const slug = String(event)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}/${slug}`;
};

const webhookUrl = (): string => {
  const raw = process.env.BACKEND_WEBHOOK_BASE_URL ?? process.env.EVOLUTION_WEBHOOK_URL ?? '';
  return normalizeWebhookBaseUrl(raw);
};

function normalizeState(instanceName: string, raw: ConnectionStateResponse): NormalizedStatus {
  const state = raw?.instance?.state ?? raw?.state ?? 'unknown';
  const qrCode = getCachedQrCode(instanceName);

  if (state === 'open') {
    return { status: 'connected', qrCode: null, connectedNumber: null, instanceName };
  }
  if (state === 'connecting') {
    return { status: qrCode ? 'qr_code' : 'connecting', qrCode, connectedNumber: null, instanceName };
  }
  // close, logout, unknown
  return { status: qrCode ? 'qr_code' : 'disconnected', qrCode, connectedNumber: null, instanceName };
}

async function verifyAndFixWebhook(instanceName: string, url: string): Promise<void> {
  try {
    const res = await evolutionApi.getWebhook(instanceName);
    const wh = ((res as Record<string, unknown>)?.webhook ?? res) as Record<string, unknown>;
    if (wh?.webhook_by_events !== true || wh?.url !== url) {
      logger.warn({ instanceName }, 'whatsapp-service: webhook diverge do esperado, reaplicando');
      await evolutionApi.setWebhook(instanceName, url);
    }
  } catch {
    logger.warn({ instanceName }, 'whatsapp-service: falha ao verificar webhook, reaplicando');
    await evolutionApi.setWebhook(instanceName, url);
  }
}

export const whatsappService = {
  /**
   * Verifica se instância existe na Evolution API.
   * Se não existir (404), cria uma nova com webhook correto.
   */
  async getOrCreateInstance(barbershopId: string): Promise<NormalizedStatus> {
    const ctx = await ensureBarbershopWhatsAppInstanceName(barbershopId);
    const instanceName = ctx.whatsappInstanceName;

    if (!instanceName) {
      return { status: 'not_found', qrCode: null, connectedNumber: null, instanceName: null };
    }

    try {
      const state = await evolutionApi.getConnectionState(instanceName);
      return normalizeState(instanceName, state);
    } catch (err) {
      if (err instanceof InstanceNotFoundError) {
        const url = webhookUrl();
        if (url) {
          await evolutionApi.createInstance(instanceName, url);
          logger.info({ instanceName }, 'whatsapp-service: instância criada (getOrCreate)');
        }
        return { status: 'connecting', qrCode: null, connectedNumber: null, instanceName };
      }
      throw err;
    }
  },

  /**
   * Idempotent connect flow.
   *
   * 1. Probe Evolution via fetchInstances (or getConnectionState fallback).
   * 2. If the instance already exists, do NOT delete/recreate — that races
   *    with Evolution's internal state and returns 403 "already in use".
   *    Instead reuse it: ensure the webhook is correct and ask Evolution for
   *    a fresh QR via GET /instance/connect/{name}.
   * 3. If it does not exist, create it from scratch.
   * 4. If create still returns 403 "already in use" (race window between the
   *    probe and the create), fall back to the reuse path.
   *
   * This eliminates the previous bug where deleteInstance + createInstance
   * ran back-to-back and Evolution had not yet propagated the delete.
   */
  async connectWhatsApp(barbershopId: string): Promise<NormalizedStatus> {
    const ctx = await ensureBarbershopWhatsAppInstanceName(barbershopId);
    const instanceName = ctx.whatsappInstanceName;

    if (!instanceName) {
      return { status: 'not_found', qrCode: null, connectedNumber: null, instanceName: null };
    }

    const url = webhookUrl();
    if (!url) throw new Error('EVOLUTION_WEBHOOK_URL não configurado');

    const exists = await evolutionApi.instanceExists(instanceName);

    if (exists) {
      logger.info({ instanceName }, 'whatsapp-service: instância já existe, reutilizando');
      await verifyAndFixWebhook(instanceName, url);
      try {
        await evolutionApi.connectInstance(instanceName);
      } catch (err) {
        // connect on an already-connected instance is harmless; only surface
        // unexpected failures.
        if (!(err instanceof InstanceNotFoundError)) {
          logger.warn({ err, instanceName }, 'whatsapp-service: connectInstance falhou, seguindo mesmo assim');
        }
      }
      return { status: 'connecting', qrCode: null, connectedNumber: null, instanceName };
    }

    try {
      await evolutionApi.createInstance(instanceName, url);
      await verifyAndFixWebhook(instanceName, url);
      logger.info({ instanceName }, 'whatsapp-service: instância criada, aguardando QRCODE_UPDATED');
      return { status: 'connecting', qrCode: null, connectedNumber: null, instanceName };
    } catch (err) {
      // Race fallback: another caller (or a stale Evolution cache) created
      // the instance between our probe and our create. Treat as success.
      if (isAlreadyInUseError(err)) {
        logger.warn(
          { instanceName },
          'whatsapp-service: createInstance retornou 403 already-in-use, tratando como existente',
        );
        await verifyAndFixWebhook(instanceName, url);
        try {
          await evolutionApi.connectInstance(instanceName);
        } catch (connectErr) {
          logger.warn({ err: connectErr, instanceName }, 'whatsapp-service: connectInstance fallback falhou');
        }
        return { status: 'connecting', qrCode: null, connectedNumber: null, instanceName };
      }
      throw err;
    }
  },

  /**
   * Retorna status atual consultando a Evolution API diretamente.
   */
  async getStatus(barbershopId: string): Promise<NormalizedStatus> {
    const ctx = await getBarbershopWhatsAppInstanceContext(barbershopId);
    const instanceName = ctx.whatsappInstanceName;

    if (!instanceName) {
      return { status: 'not_found', qrCode: null, connectedNumber: null, instanceName: null };
    }

    try {
      const state = await evolutionApi.getConnectionState(instanceName);
      return normalizeState(instanceName, state);
    } catch (err) {
      if (err instanceof InstanceNotFoundError) {
        return { status: 'not_found', qrCode: null, connectedNumber: null, instanceName };
      }
      throw err;
    }
  },

  /**
   * Retorna QR Code do cache (populado por QRCODE_UPDATED webhook).
   */
  async getQRCode(barbershopId: string): Promise<string | null> {
    const ctx = await getBarbershopWhatsAppInstanceContext(barbershopId);
    const instanceName = ctx.whatsappInstanceName;
    if (!instanceName) return null;
    return getCachedQrCode(instanceName);
  },

  /**
   * Remove a instância da Evolution API, encerrando a sessão.
   */
  async disconnect(barbershopId: string): Promise<void> {
    const ctx = await getBarbershopWhatsAppInstanceContext(barbershopId);
    const instanceName = ctx.whatsappInstanceName;
    if (!instanceName) return;
    await evolutionApi.deleteInstance(instanceName);
    logger.info({ instanceName }, 'whatsapp-service: instância removida (disconnect)');
  },

  async sendText(barbershopId: string, number: string, text: string): Promise<unknown> {
    const ctx = await getBarbershopWhatsAppInstanceContext(barbershopId);
    const instanceName = ctx.whatsappInstanceName;
    if (!instanceName) throw new Error('Instância WhatsApp não configurada para esta barbearia');
    return evolutionApi.sendText(instanceName, number, text);
  },

  /**
   * Deletes Evolution instances whose names are NOT registered in our DB.
   *
   * Use case: legacy code paths or aborted onboardings can leave Evolution
   * holding "zombie" instances whose names differ from the canonical
   * deterministic name (e.g. `itallobarbereacb8a07` without the underscore
   * versus the real `itallobarber_eacb8a07`). These zombies keep firing
   * connection-update events, race with the real instance, and prevent the
   * real one from ever reaching the `qrcode` state.
   *
   * The DB (barbershops.whatsapp_instance_name, UNIQUE per tenant) is the
   * source of truth. Anything Evolution knows about that isn't in the DB
   * is fair game to delete.
   *
   * Returns a structured result so callers can audit what was removed.
   */
  async cleanupCorruptedInstances(options: { dryRun?: boolean } = {}): Promise<{
    canonical: string[];
    evolutionInstances: string[];
    orphans: string[];
    deleted: string[];
    failed: Array<{ name: string; error: string }>;
    dryRun: boolean;
  }> {
    const dryRun = options.dryRun === true;

    const rows = await prisma.$queryRaw<Array<{ whatsapp_instance_name: string | null }>>`
      SELECT whatsapp_instance_name
        FROM barbershops
       WHERE active = true
         AND NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
    `;
    const canonical = rows
      .map((r) => (r.whatsapp_instance_name ?? '').trim().toLowerCase())
      .filter(Boolean);
    const canonicalSet = new Set(canonical);

    const list = await evolutionApi.fetchInstances();
    const evolutionInstances: string[] = [];

    for (const raw of Array.isArray(list) ? list : []) {
      const item = raw as Record<string, unknown> | null;
      if (!item || typeof item !== 'object') continue;
      const inner = (item['instance'] as Record<string, unknown> | undefined) ?? null;
      const candidate =
        (typeof item['instanceName'] === 'string' && (item['instanceName'] as string)) ||
        (typeof item['name'] === 'string' && (item['name'] as string)) ||
        (inner && typeof inner['instanceName'] === 'string' && (inner['instanceName'] as string)) ||
        (inner && typeof inner['name'] === 'string' && (inner['name'] as string)) ||
        '';
      const name = String(candidate).trim();
      if (name) evolutionInstances.push(name);
    }

    const orphans = evolutionInstances.filter(
      (name) => !canonicalSet.has(name.toLowerCase()),
    );

    const deleted: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    if (!dryRun) {
      for (const name of orphans) {
        try {
          await evolutionApi.deleteInstance(name);
          deleted.push(name);
          logger.info({ instanceName: name }, 'whatsapp-service: instância órfã removida');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ name, error: msg });
          logger.warn({ err, instanceName: name }, 'whatsapp-service: falha ao remover instância órfã');
        }
      }
    }

    logger.info(
      {
        canonicalCount: canonical.length,
        evolutionCount: evolutionInstances.length,
        orphanCount: orphans.length,
        deletedCount: deleted.length,
        failedCount: failed.length,
        dryRun,
      },
      'whatsapp-service: cleanupCorruptedInstances concluído',
    );

    return { canonical, evolutionInstances, orphans, deleted, failed, dryRun };
  },

  /**
   * Re-applies the canonical webhook config (webhook_by_events=true, all
   * expected events, our URL) to every Evolution instance that Evolution
   * itself knows about. Used to migrate instances created before the v2
   * webhook-by-events fix away from the legacy flat /webhook URL that
   * triggers the 410 warnings.
   *
   * Safe to call repeatedly. Iterates Evolution's view of instances rather
   * than the DB so it also catches orphaned ones.
   */
  async syncAllWebhooks(): Promise<{ total: number; fixed: number; failed: number; instances: Array<{ name: string; ok: boolean; error?: string }> }> {
    const url = webhookUrl();
    if (!url) throw new Error('EVOLUTION_WEBHOOK_URL não configurado');

    const list = await evolutionApi.fetchInstances();
    const instances: Array<{ name: string; ok: boolean; error?: string }> = [];
    let fixed = 0;
    let failed = 0;

    for (const raw of Array.isArray(list) ? list : []) {
      const item = raw as Record<string, unknown> | null;
      if (!item || typeof item !== 'object') continue;
      const inner = (item['instance'] as Record<string, unknown> | undefined) ?? null;
      const candidate =
        (typeof item['instanceName'] === 'string' && (item['instanceName'] as string)) ||
        (typeof item['name'] === 'string' && (item['name'] as string)) ||
        (inner && typeof inner['instanceName'] === 'string' && (inner['instanceName'] as string)) ||
        (inner && typeof inner['name'] === 'string' && (inner['name'] as string)) ||
        '';
      const name = String(candidate).trim();
      if (!name) continue;

      try {
        await verifyAndFixWebhook(name, url);
        fixed += 1;
        instances.push({ name, ok: true });
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        instances.push({ name, ok: false, error: msg });
        logger.warn({ err, instanceName: name }, 'whatsapp-service: falha ao sincronizar webhook');
      }
    }

    logger.info({ total: instances.length, fixed, failed }, 'whatsapp-service: syncAllWebhooks concluído');
    return { total: instances.length, fixed, failed, instances };
  },
};
