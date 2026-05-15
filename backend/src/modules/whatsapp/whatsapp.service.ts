import logger from '../../utils/logger.js';
import { evolutionApi, type ConnectionStateResponse } from './evolution-api.service.js';
import { InstanceNotFoundError } from './whatsapp.types.js';
import type { NormalizedStatus } from './whatsapp.types.js';
import {
  ensureBarbershopWhatsAppInstanceName,
  getBarbershopWhatsAppInstanceContext,
} from '../../services/whatsapp/whatsappInstanceService.js';
import { getCachedQrCode } from '../../services/whatsapp/handlers/qrcodeUpdatedHandler.js';

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
   * Reinicia a instância do zero: deleta sessão Baileys + recria + verifica webhook.
   * Necessário quando a sessão está corrompida ou o usuário quer novo QR.
   */
  async connectWhatsApp(barbershopId: string): Promise<NormalizedStatus> {
    const ctx = await ensureBarbershopWhatsAppInstanceName(barbershopId);
    const instanceName = ctx.whatsappInstanceName;

    if (!instanceName) {
      return { status: 'not_found', qrCode: null, connectedNumber: null, instanceName: null };
    }

    const url = webhookUrl();
    if (!url) throw new Error('EVOLUTION_WEBHOOK_URL não configurado');

    // Reset completo: remove sessão Baileys corrompida
    await evolutionApi.deleteInstance(instanceName);
    await evolutionApi.createInstance(instanceName, url);

    // Garantir que webhook_by_events persiste após criação
    await verifyAndFixWebhook(instanceName, url);

    logger.info({ instanceName }, 'whatsapp-service: instância recriada, aguardando QRCODE_UPDATED');
    return { status: 'connecting', qrCode: null, connectedNumber: null, instanceName };
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
