import { Request, Response } from 'express';
import logger from '../../utils/logger.js';
import { handleMessagesUpsert } from '../../services/whatsapp/handlers/messagesUpsertHandler.js';
import { handleConnectionUpdate } from '../../services/whatsapp/handlers/connectionUpdateHandler.js';

/**
 * POST /api/v1/whatsapp/webhook/:event
 * Always returns 200 — Evolution API must not retry on business-logic failures.
 */
export const webhookController = async (req: Request, res: Response): Promise<void> => {
  const event = req.params.event;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const instanceName = (body?.instance ?? body?.instanceName ?? (body?.data as Record<string, unknown>)?.instanceName ?? null) as string | null;

  try {
    switch (event) {
      case 'messages-upsert':
        await handleMessagesUpsert(body, { instanceName });
        break;

      case 'connection-update':
        await handleConnectionUpdate(body);
        break;

      default:
        logger.debug({ event, instanceName }, 'webhookController: evento ignorado');
    }
  } catch (err) {
    logger.error({ err, event, instanceName }, 'webhookController: unexpected error');
  }

  res.status(200).json({ received: true });
};
