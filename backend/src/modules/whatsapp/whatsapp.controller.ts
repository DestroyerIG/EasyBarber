import type { Request, Response, NextFunction } from 'express';
import { whatsappService } from './whatsapp.service.js';
import { evolutionApi } from './evolution-api.service.js';
import { getQrCacheSize } from '../../services/whatsapp/handlers/qrcodeUpdatedHandler.js';

export const getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await whatsappService.getStatus(req.user.barbershopId!);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const initialize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await whatsappService.connectWhatsApp(req.user.barbershopId!);
    res.json({ success: true, data });
  } catch (err) {
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
