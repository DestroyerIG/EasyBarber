import logger from '../../utils/logger.js';
import { handleMessagesUpsert } from '../../services/whatsapp/handlers/messagesUpsertHandler.js';
import { handleConnectionUpdate } from '../../services/whatsapp/handlers/connectionUpdateHandler.js';
import { handleQrcodeUpdated } from '../../services/whatsapp/handlers/qrcodeUpdatedHandler.js';

const DEBOUNCE_MS = 500;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounce por instanceName: cancela o timer anterior e agenda novo.
 * Evita loop de dezenas de connection-update simultâneos processarem o banco.
 */
function debounceByInstance(key: string, fn: () => void): void {
  const existing = debounceTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    logger.debug({ key }, 'webhook: connection-update debounced');
  }
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn();
    }, DEBOUNCE_MS),
  );
}

function extractInstanceName(body: Record<string, unknown>): string | null {
  const v =
    body.instance ??
    body.instanceName ??
    (body.data as Record<string, unknown> | undefined)?.instanceName;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function handleWebhookEvent(
  event: string,
  body: Record<string, unknown>,
): Promise<void> {
  const instanceName = extractInstanceName(body);

  switch (event) {
    case 'messages-upsert':
      await handleMessagesUpsert(body, { instanceName });
      break;

    case 'connection-update':
      if (!instanceName) {
        logger.warn({ event }, 'webhook: connection-update sem instanceName, ignorado');
        break;
      }
      debounceByInstance(instanceName, () => {
        void handleConnectionUpdate(body).catch((err) =>
          logger.error({ err, instanceName }, 'webhook: connection-update processamento falhou'),
        );
      });
      break;

    case 'qrcode-updated':
      handleQrcodeUpdated(body);
      break;

    default:
      logger.debug({ event, instanceName }, 'webhook: evento não tratado, ignorado');
  }
}
