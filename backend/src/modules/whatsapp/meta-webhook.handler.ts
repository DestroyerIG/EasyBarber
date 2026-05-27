/**
 * meta-webhook.handler.ts — Inbound webhook for the Meta WhatsApp Cloud API.
 *
 * A single app-level webhook receives messages for ALL barbershops. Each event
 * carries metadata.phone_number_id, which we map back to the owning barbershop
 * and then dispatch into the existing conversational flow (botOrchestrator).
 *
 * GET  → Meta verification handshake (hub.challenge).
 * POST → message delivery. We always respond 200 quickly and process
 *        fire-and-forget; returning non-200 makes Meta retry in a loop.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import logger from '../../utils/logger.js';
import { resolveBarbershopByPhoneNumberId } from '../../services/whatsapp/metaWhatsappService.js';
import { deduplicator } from '../../services/whatsapp/utils/deduplication.js';
import * as botOrchestrator from '../../bot/botOrchestrator.js';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** GET handshake: Meta calls this once when you save the webhook URL. */
export const handleMetaVerification = (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected) {
    logger.info('meta-webhook: verificação OK');
    res.status(200).send(String(challenge ?? ''));
    return;
  }

  logger.warn(
    { mode, tokenMatch: token === expected, hasExpected: Boolean(expected) },
    'meta-webhook: verificação falhou',
  );
  res.sendStatus(403);
};

/**
 * Validates the X-Hub-Signature-256 header against the raw request body.
 * Returns true when valid OR when no app secret is configured (skip).
 */
const verifySignature = (req: Request): boolean => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // signature check disabled

  const header = req.headers['x-hub-signature-256'];
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (typeof header !== 'string' || !raw) return false;

  const expected = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

interface ParsedMetaMessage {
  phoneNumberId: string;
  from: string;
  text: string;
  messageId: string;
}

/** Best-effort text extraction across text / interactive / button message types. */
const extractText = (msg: Record<string, unknown>): string | null => {
  const type = msg['type'];
  if (type === 'text') {
    return (msg['text'] as { body?: string } | undefined)?.body ?? null;
  }
  if (type === 'interactive') {
    const interactive = msg['interactive'] as Record<string, unknown> | undefined;
    const btn = interactive?.['button_reply'] as { title?: string; id?: string } | undefined;
    const list = interactive?.['list_reply'] as { title?: string; id?: string } | undefined;
    return btn?.title ?? btn?.id ?? list?.title ?? list?.id ?? null;
  }
  if (type === 'button') {
    return (msg['button'] as { text?: string } | undefined)?.text ?? null;
  }
  return null;
};

const parseMetaMessages = (body: unknown): ParsedMetaMessage[] => {
  const out: ParsedMetaMessage[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] } | null)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> } | null)?.value;
      if (!value) continue;
      const metadata = value['metadata'] as { phone_number_id?: string } | undefined;
      const phoneNumberId = metadata?.phone_number_id;
      const messages = value['messages'];
      if (!phoneNumberId || !Array.isArray(messages)) continue; // statuses/other → skip

      for (const raw of messages) {
        const msg = raw as Record<string, unknown>;
        const from = typeof msg['from'] === 'string' ? (msg['from'] as string) : null;
        const messageId = typeof msg['id'] === 'string' ? (msg['id'] as string) : null;
        const text = extractText(msg);
        if (from && messageId && text && text.trim()) {
          out.push({ phoneNumberId, from, text: text.trim(), messageId });
        }
      }
    }
  }
  return out;
};

const dispatch = async (msg: ParsedMetaMessage): Promise<void> => {
  if (deduplicator.isDuplicate(msg.messageId)) {
    logger.info({ messageId: msg.messageId }, 'meta-webhook: duplicate');
    return;
  }
  deduplicator.markSeen(msg.messageId);

  const tenant = await resolveBarbershopByPhoneNumberId(msg.phoneNumberId);
  if (!tenant) {
    logger.warn({ phoneNumberId: msg.phoneNumberId }, 'meta-webhook: tenant não encontrado para phone_number_id');
    return;
  }

  if (!ACTIVE_STATUSES.has(tenant.subscriptionStatus ?? '')) {
    logger.info(
      { barbershopId: tenant.id, subscriptionStatus: tenant.subscriptionStatus },
      'meta-webhook: assinatura inativa',
    );
    return;
  }

  logger.info(
    { barbershopId: tenant.id, phoneNumberId: msg.phoneNumberId, fromLast4: msg.from.slice(-4), textPreview: msg.text.slice(0, 50) },
    'meta-webhook: dispatching to flow',
  );

  await botOrchestrator.process({
    barbershopId: tenant.id,
    authorPhone: msg.from,
    text: msg.text,
    messageId: msg.messageId,
    instanceName: '',
    connectedNumber: tenant.displayNumber,
  });
};

export const handleMetaInbound = async (req: Request, res: Response): Promise<void> => {
  if (!verifySignature(req)) {
    logger.warn('meta-webhook: assinatura inválida');
    res.sendStatus(403);
    return;
  }

  // Ack immediately — processing is fire-and-forget so Meta never retries.
  res.status(200).json({ received: true });

  try {
    const messages = parseMetaMessages(req.body);
    for (const msg of messages) {
      await dispatch(msg);
    }
  } catch (err) {
    logger.error({ err }, 'meta-webhook: erro inesperado ao processar');
  }
};
