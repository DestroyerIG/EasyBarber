/**
 * payloadParser.ts — Parse e normalização do payload da Evolution API.
 *
 * Suporta dois formatos de envelope:
 *   - Flat: { event, instance, data: { key, message, ... }, sender, destination }
 *   - Nested legacy: { event, instanceName, key, message, sender, ... }
 *
 * Nunca lança exceção — retorna null se o payload for inválido/irreconhecível.
 */

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ParsedEvolutionWebhook {
  event: string;
  instanceName: string;
  messageId: string | null;
  remoteJid: string | null;
  fromMe: boolean;
  sender: string | null;
  destination: string | null;
  text: string | null;
  messageType: string | null;
  timestamp: number | null;
  raw: unknown;
}

// ── Extração de texto ─────────────────────────────────────────────────────────

const extractText = (message: unknown): string | null => {
  if (!message || typeof message !== 'object') return null;
  const msg = message as Record<string, unknown>;
  return (
    (msg.conversation as string | undefined)
    ?? ((msg.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined)
    ?? ((msg.imageMessage as Record<string, unknown> | undefined)?.caption as string | undefined)
    ?? ((msg.videoMessage as Record<string, unknown> | undefined)?.caption as string | undefined)
    ?? ((msg.documentMessage as Record<string, unknown> | undefined)?.caption as string | undefined)
    ?? null
  ) || null;
};

// ── Extração do messageId ─────────────────────────────────────────────────────

const extractMessageId = (key: Record<string, unknown>, data: Record<string, unknown>): string | null => {
  const messages = data?.messages as Array<Record<string, unknown>> | undefined;
  return (
    (key?.id as string | undefined)
    ?? (messages?.[0]?.key as Record<string, unknown> | undefined)?.id as string | undefined
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

const normalizeEventName = (raw: unknown): string | null => {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  return KNOWN_EVENTS.has(lower) ? lower : lower || null;
};

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Parses a raw Evolution API webhook body into a normalized object.
 */
export const parseEvolutionWebhook = (rawBody: unknown): ParsedEvolutionWebhook | null => {
  try {
    if (!rawBody || typeof rawBody !== 'object') return null;

    const rb = rawBody as Record<string, unknown>;

    // Resolve data layer (flat vs nested)
    const data = (rb.data ?? rb) as Record<string, unknown>;

    const event = normalizeEventName(rb.event ?? rb.type ?? data.event ?? data.type);
    if (!event) return null;

    const instanceName = (
      rb.instance
      ?? rb.instanceName
      ?? data.instance
      ?? data.instanceName
      ?? null
    ) as string | null;
    if (!instanceName) return null;

    // Key block
    const messages = data.messages as Array<Record<string, unknown>> | undefined;
    const key = (data.key ?? rb.key ?? messages?.[0]?.key ?? {}) as Record<string, unknown>;
    const remoteJid = (key.remoteJid ?? null) as string | null;
    const fromMe = key.fromMe === true;
    const messageId = extractMessageId(key, data);

    // Message content
    const msgBlock = data.message ?? messages?.[0]?.message ?? rb.message ?? null;
    const text = extractText(msgBlock);
    const messageType = (data.messageType ?? messages?.[0]?.messageType ?? null) as string | null;

    // Timestamp
    const ts = data.messageTimestamp ?? key.messageTimestamp ?? data.timestamp ?? null;
    const timestamp = ts != null ? Number(ts) : null;

    // Sender / destination (Evolution API top-level fields)
    const sender = (rb.sender ?? data.sender ?? null) as string | null;
    const destination = (rb.destination ?? data.destination ?? null) as string | null;

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
