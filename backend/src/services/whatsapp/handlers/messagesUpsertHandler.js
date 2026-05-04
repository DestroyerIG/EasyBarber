/**
 * messagesUpsertHandler.js
 *
 * Handler para o evento messages-upsert da Evolution API.
 *
 * Fluxo:
 *   1. fromMe=true  → ignorar
 *   2. Extrair authorPhone (remoteJid / sender / participant)
 *   3. Verificar self-message via isSelfMessage
 *   4. Extrair texto
 *   5. Deduplicar por messageId
 *   6. Retornar { ok, authorPhone, text, messageId } para o caller processar
 *
 * O handler NÃO chama o bot diretamente — retorna os dados processados
 * para o controller decidir o que fazer. Isso mantém a separação de responsabilidades
 * e preserva a assinatura do webhook controller existente.
 */

import logger from '../../../utils/logger.js';
import { resolveAuthorPhone, isSelfMessage } from '../utils/phoneUtils.js';

// TODO: substituir por Redis para deduplicação entre múltiplas instâncias/pods
const _dedupeCache = new Map();
const DEDUPE_TTL_MS = 60_000;

const pruneDedupeCache = () => {
  const now = Date.now();
  for (const [key, expiresAt] of _dedupeCache.entries()) {
    if (expiresAt <= now) _dedupeCache.delete(key);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const extractMessageId = (payload) => {
  const data = payload?.data || payload;
  return (
    data?.key?.id ||
    data?.messages?.[0]?.key?.id ||
    payload?.key?.id ||
    null
  );
};

const extractMessageText = (payload) => {
  const data = payload?.data || payload;
  const msg =
    data?.message ||
    data?.messages?.[0]?.message ||
    payload?.message ||
    null;
  if (!msg) return null;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    null
  ) || null;
};

// ── Handler principal ─────────────────────────────────────────────────────────

/**
 * Processa um payload messages-upsert da Evolution API.
 *
 * @param {object} payload - Payload bruto do webhook
 * @param {object} context
 * @param {string|null} context.connectedNumber - Número conectado da instância (sem formatação)
 * @param {string|null} [context.instanceName]  - Nome da instância (para logs)
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   ignored: boolean,
 *   reason: string|null,
 *   authorPhone?: string,
 *   text?: string,
 *   messageId?: string|null,
 * }>}
 */
export const handleMessagesUpsert = async (payload, context = {}) => {
  const { connectedNumber = null, instanceName = null } = context;

  // ── 1. Resolver autor ────────────────────────────────────────────────────
  const { phone: authorPhone, source: authorSource, isFromMe } = resolveAuthorPhone(payload);

  if (isFromMe) {
    logger.info({ instanceName, authorSource }, 'author_resolved: fromMe=true — ignorado');
    return { ok: false, ignored: true, reason: 'from_me' };
  }

  logger.info(
    { instanceName, authorPhone, authorSource, connectedNumber },
    'author_resolved',
  );

  if (!authorPhone) {
    logger.warn({ instanceName, authorSource }, 'message_skipped: telefone do autor nao identificado');
    return { ok: false, ignored: true, reason: 'unresolved_author' };
  }

  // ── 2. Verificar auto-resposta ────────────────────────────────────────────
  const selfCheck = connectedNumber ? isSelfMessage(authorPhone, connectedNumber) : false;

  logger.info(
    {
      instanceName,
      authorPhone,
      connectedNumber: connectedNumber || null,
      isSelf: selfCheck,
    },
    'self_check',
  );

  if (selfCheck) {
    logger.info(
      { instanceName, authorPhone, connectedNumber },
      'message_skipped: self_message_skipped',
    );
    return { ok: false, ignored: true, reason: 'self_message_skipped' };
  }

  // ── 3. Extrair texto ──────────────────────────────────────────────────────
  const text = extractMessageText(payload);

  if (!text?.trim()) {
    logger.debug({ instanceName, authorPhone }, 'message_skipped: sem texto');
    return { ok: false, ignored: true, reason: 'no_text' };
  }

  // ── 4. Deduplicação por messageId ─────────────────────────────────────────
  const messageId = extractMessageId(payload);

  if (messageId) {
    pruneDedupeCache();
    if (_dedupeCache.has(messageId)) {
      logger.info({ instanceName, messageId }, 'message_skipped: duplicata');
      return { ok: false, ignored: true, reason: 'duplicate' };
    }
    _dedupeCache.set(messageId, Date.now() + DEDUPE_TTL_MS);
  }

  // ── 5. Aceito ─────────────────────────────────────────────────────────────
  logger.info(
    { instanceName, authorPhone, textPreview: text.slice(0, 60) },
    'message_accepted',
  );

  return {
    ok: true,
    ignored: false,
    reason: null,
    authorPhone,
    text,
    messageId: messageId || null,
  };
};
