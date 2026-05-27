import type { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { whatsappService } from './whatsapp.service.js';
import { evolutionApi } from './evolution-api.service.js';
import { EvolutionApiError } from './whatsapp.types.js';
import { getQrCacheSize } from '../../services/whatsapp/handlers/qrcodeUpdatedHandler.js';

/**
 * Detects the Evolution-API 403 emitted when the instance name is taken.
 * The connect flow should treat this as a soft success, not a 500.
 */
function isInstanceAlreadyInUse(err: unknown): boolean {
  if (!(err instanceof EvolutionApiError) || err.status !== 403) return false;
  const body = err.body as { response?: { message?: unknown } } | null;
  const messages = Array.isArray(body?.response?.message)
    ? (body?.response?.message as unknown[])
    : [];
  return messages.some(
    (m) => typeof m === 'string' && m.toLowerCase().includes('already in use'),
  );
}

export const getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await whatsappService.getStatus(req.user.barbershopId!);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const initialize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const barbershopId = req.user.barbershopId!;
  try {
    const data = await whatsappService.connectWhatsApp(barbershopId);
    res.json({ success: true, data });
  } catch (err) {
    // Defense-in-depth: the service already handles the "already in use" race
    // internally, but if it ever escapes (different Evolution version, edge
    // wording, etc.) we don't want the client to see a 500. Respond as if the
    // instance is connecting and let the status/QR polling take over.
    if (isInstanceAlreadyInUse(err)) {
      logger.warn(
        { barbershopId, status: 403 },
        'whatsapp-controller: Evolution reported already-in-use, returning soft success',
      );
      res.json({
        success: true,
        data: {
          status: 'connecting',
          qrCode: null,
          connectedNumber: null,
          instanceName: null,
          reused: true,
        },
      });
      return;
    }

    if (err instanceof EvolutionApiError) {
      logger.error(
        { err, status: err.status, body: err.body, barbershopId },
        'whatsapp-controller: Evolution API error on initialize',
      );
    }
    next(err);
  }
};

export const getQrCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const qrCode = await whatsappService.getQRCode(req.user.barbershopId!);
    res.json({ success: true, data: { qrCode } });
  } catch (err) {
    next(err);
  }
};

export const disconnect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await whatsappService.disconnect(req.user.barbershopId!);
    res.json({ success: true, data: { disconnected: true } });
  } catch (err) {
    next(err);
  }
};

export const sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { number, text } = req.body as { number?: string; text?: string };
    if (!number || !text) {
      res.status(400).json({ success: false, error: 'Campos number e text são obrigatórios' });
      return;
    }
    const data = await whatsappService.sendText(req.user.barbershopId!, number, text);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const syncWebhooks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await whatsappService.syncAllWebhooks();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const cleanupCorrupted = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dryRun = req.query['dryRun'] === 'true' || req.query['dry_run'] === 'true';
    const result = await whatsappService.cleanupCorruptedInstances({ dryRun });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const testWebhookConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await whatsappService.getWebhookConfig();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const internalHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let evolution: 'ok' | 'down' = 'ok';
    try {
      await evolutionApi.fetchInstances();
    } catch {
      evolution = 'down';
    }

    res.json({
      success: true,
      data: {
        evolution,
        qrCacheEntries: getQrCacheSize(),
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
};
