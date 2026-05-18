import logger from '../../utils/logger.js';
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

const webhookUrl = (): string => process.env.EVOLUTION_WEBHOOK_URL ?? '';

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
};
