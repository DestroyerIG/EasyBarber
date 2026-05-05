/**
 * payloadParser.js — Parse e normalização do payload da Evolution API.
 *
 * Suporta dois formatos de envelope:
 *   - Flat: { event, instance, data: { key, message, ... }, sender, destination }
 *   - Nested legacy: { event, instanceName, key, message, sender, ... }
 *
 * Nunca lança exceção — retorna null se o payload for inválido/irreconhecível.
 */

// ── Extração de texto ─────────────────────────────────────────────────────────

const extractText = (message) => {
  if (!message || typeof message !== 'object') return null;
  return (
    message.conversation
    ?? message.extendedTextMessage?.text
    ?? message.imageMessage?.caption
    ?? message.videoMessage?.caption
    ?? message.documentMessage?.caption
    ?? null
  ) || null;
};

// ── Extração do messageId ─────────────────────────────────────────────────────

const extractMessageId = (key, data) => {
  return (
    key?.id
    ?? data?.messages?.[0]?.key?.id
    ?? null
  );
};

// ── Normalização de evento ────────────────────────────────────────────────────

const KNOWN_EVENTS = new Set([
  'messages-upsert',
  'messages-update',
  'messages-delete',
  'connection-update',
  'qrcode-updated',
  'send-message',
]);

const normalizeEventName = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  return KNOWN_EVENTS.has(lower) ? lower : lower || null;
};

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Parses a raw Evolution API webhook body into a normalized object.
 *
 * @param {object} rawBody  Raw webhook body (req.body)
 * @returns {{
 *   event: string,
 *   instanceName: string,
 *   messageId: string|null,
 *   remoteJid: string|null,
 *   fromMe: boolean,
 *   sender: string|null,
 *   destination: string|null,
 *   text: string|null,
 *   messageType: string|null,
 *   timestamp: number|null,
 *   raw: object,
 * } | null}
 */
export const parseEvolutionWebhook = (rawBody) => {
  try {
    if (!rawBody || typeof rawBody !== 'object') return null;

    // Resolve data layer (flat vs nested)
    const data = rawBody.data ?? rawBody;

    const event = normalizeEventName(rawBody.event ?? rawBody.type ?? data.event ?? data.type);
    if (!event) return null;

    const instanceName = (
      rawBody.instance
      ?? rawBody.instanceName
      ?? data.instance
      ?? data.instanceName
      ?? null
    );
    if (!instanceName) return null;

    // Key block
    const key = data.key ?? rawBody.key ?? data.messages?.[0]?.key ?? {};
    const remoteJid = key.remoteJid ?? null;
    const fromMe = key.fromMe === true;
    const messageId = extractMessageId(key, data);

    // Message content
    const msgBlock = data.message ?? data.messages?.[0]?.message ?? rawBody.message ?? null;
    const text = extractText(msgBlock);
    const messageType = data.messageType ?? data.messages?.[0]?.messageType ?? null;

    // Timestamp
    const ts = data.messageTimestamp ?? key.messageTimestamp ?? data.timestamp ?? null;
    const timestamp = ts != null ? Number(ts) : null;

    // Sender / destination (Evolution API top-level fields)
    const sender = rawBody.sender ?? data.sender ?? null;
    const destination = rawBody.destination ?? data.destination ?? null;

    return {
      event,
      instanceName,
      messageId,
      remoteJid,
      fromMe,
      sender,
      destination,
      text,
      messageType,
      timestamp,
      raw: rawBody,
    };
  } catch {
    return null;
  }
};
