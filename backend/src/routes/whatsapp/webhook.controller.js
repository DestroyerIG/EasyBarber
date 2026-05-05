import logger from '../../utils/logger.js';
import { handleMessagesUpsert } from '../../services/whatsapp/handlers/messagesUpsertHandler.js';
import { handleConnectionUpdate } from '../../services/whatsapp/handlers/connectionUpdateHandler.js';

/**
 * POST /api/v1/whatsapp/webhook/:event
 * Always returns 200 — Evolution API must not retry on business-logic failures.
 */
export const webhookController = async (req, res) => {
  const event = req.params.event;
  const body = req.body ?? {};
  const instanceName = body?.instance ?? body?.instanceName ?? body?.data?.instanceName ?? null;

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

  return res.status(200).json({ received: true });
};
