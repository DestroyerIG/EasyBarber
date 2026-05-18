/**
 * botOrchestrator.ts — Bridge between the webhook pipeline and the conversational flow.
 *
 * Receives a message already validated by messagesUpsertHandler (tenant resolved,
 * fromMe rejected, dedup applied, text non-empty) and delegates to
 * whatsappFlowService.handleIncomingMessage which runs the booking state machine
 * and sends responses via the Evolution API.
 *
 * initBotOrchestrator() is kept as a no-op for backward compatibility with
 * server.ts startup wiring; the underlying client is created on demand by
 * whatsappMessageService.
 */

import logger from '../utils/logger.js';
import { handleIncomingMessage } from '../services/whatsapp/whatsappFlowService.js';

type EvolutionClient = unknown;

export const initBotOrchestrator = (_evolutionClient?: EvolutionClient): void => {
  // no-op — flow service uses whatsappMessageService -> whatsappClient internally
};

interface BotProcessContext {
  barbershopId: string;
  authorPhone: string;
  text: string;
  messageId: string | null;
  instanceName: string;
  rawPayload?: unknown;
  connectedNumber?: string | null;
}

interface BotProcessResult {
  ok: boolean;
  responseSent: boolean;
  reason?: string | null;
}

export const process = async ({
  barbershopId,
  authorPhone,
  text,
  messageId,
  instanceName,
  rawPayload,
  connectedNumber,
}: BotProcessContext): Promise<BotProcessResult> => {
  const phoneOrPayload = rawPayload && typeof rawPayload === 'object' ? rawPayload : authorPhone;

  logger.info(
    {
      barbershopId,
      authorLast4: authorPhone?.slice(-4),
      textPreview: text?.slice(0, 50),
      messageId,
      instanceName,
      hasRawPayload: Boolean(rawPayload),
    },
    'botOrchestrator: dispatching to flow',
  );

  try {
    const result = await handleIncomingMessage(phoneOrPayload, text, {
      barbershopId,
      preExtractedPhone: authorPhone,
      preExtractedText: text,
      preExtractedInstanceName: instanceName,
      ...(messageId ? { messageId, dedupeKey: messageId } : {}),
      eventName: 'messages-upsert',
      ...(connectedNumber ? { connectedNumber } : {}),
      instanceName,
    });

    if (!result?.ok) {
      logger.info(
        { barbershopId, instanceName, reason: result?.reason ?? null, ignored: result?.ignored ?? false },
        'botOrchestrator: flow returned not-ok',
      );
      return { ok: true, responseSent: false, reason: result?.reason ?? null };
    }

    return { ok: true, responseSent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, barbershopId, instanceName }, 'botOrchestrator: flow threw');
    return { ok: false, responseSent: false, reason: 'flow_error' };
  }
};
