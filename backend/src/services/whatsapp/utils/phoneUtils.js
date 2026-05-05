/**
 * phoneUtils.js — Normalização e comparação de telefones para WhatsApp / Evolution API.
 *
 * Canonical form logic:
 *   1. Remove non-digits
 *   2. Strip country code 55 from 13-digit E.164 numbers (55 + DDD + 9 + 8-local)
 *   3. Strip mandatory Brazilian mobile 9-prefix from 11-digit numbers (DDD + 9 + 8-local)
 *   Result: 10-digit canonical (DDD + 8-local) for all Brazilian mobiles
 *
 * Why 13+ only for step 2:
 *   558396311811 (12d) is a valid E.164 old-format number and must NOT be stripped —
 *   it represents a different canonical than 5583996311811 (13d, new-format).
 *   This is intentional: prevents false-positive isSelf between a client whose
 *   sender arrives in 12-digit format and a bot connected as 13-digit.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

/**
 * Remove everything that is not a digit.
 * @param {string} raw
 * @returns {string}
 */
export const stripToDigits = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '');
};

/**
 * Returns the canonical form of a Brazilian phone number.
 * Always returns a string (empty string on invalid input — never throws).
 * @param {string} raw
 * @returns {string}
 */
export const canonicalizePhone = (raw) => {
  let digits = stripToDigits(String(raw ?? ''));
  if (!digits) return '';

  // Step 2: strip 55 country code from full E.164 new-format (13 digits)
  if (digits.length >= 13 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  // Step 3: strip mandatory 9-prefix from 11-digit Brazilian mobile
  // Pattern: DDD(2) + 9(1) + 8-digit local = 11 digits
  // e.g. 83996311811 → 8396311811
  const m = digits.match(/^(\d{2})9(\d{8})$/);
  if (m) {
    digits = m[1] + m[2];
  }

  return digits;
};

// ── Self-message detection ────────────────────────────────────────────────────

/**
 * Returns true only if author and connected resolve to the same canonical phone.
 * Never throws. Returns false on null/empty input.
 * @param {string} authorRaw
 * @param {string} connectedRaw
 * @returns {boolean}
 */
export const isSelfMessage = (authorRaw, connectedRaw) => {
  if (!authorRaw || !connectedRaw) return false;
  const ca = canonicalizePhone(String(authorRaw));
  const cc = canonicalizePhone(String(connectedRaw));
  if (!ca || !cc) return false;
  return ca === cc;
};

// ── JID extraction ────────────────────────────────────────────────────────────

/**
 * Extracts the phone number from a WhatsApp JID.
 * Returns null for @lid JIDs (no phone — use sender field instead).
 * Returns null for @g.us JIDs (group chats — not a phone number).
 * @param {string} jid  e.g. "5583996311811@s.whatsapp.net"
 * @returns {string|null}
 */
export const extractPhoneFromJid = (jid) => {
  if (!jid || typeof jid !== 'string') return null;
  const at = jid.indexOf('@');
  if (at === -1) return null;
  const suffix = jid.slice(at + 1);
  if (suffix === 'lid' || suffix === 'g.us') return null;
  const local = jid.slice(0, at).replace(/\D/g, '');
  return local || null;
};

// ── Author resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the message author phone from a raw Evolution API webhook payload.
 *
 * Priority:
 *   1. fromMe=true  → skip (bot sent this)
 *   2. remoteJid @g.us → skip (group — not supported)
 *   3. remoteJid @s.whatsapp.net → phone from remoteJid
 *   4. remoteJid @lid → try key.participant, then payload.sender
 *   5. Fallback: payload.sender
 *   6. Unresolved → skip
 *
 * Never throws. Always returns a valid object.
 * @param {object} payload  Raw Evolution API payload (data layer or full payload)
 * @returns {{ phone: string|null, source: string, skip: boolean }}
 */
export const resolveAuthorPhone = (payload) => {
  const data = payload?.data ?? payload;
  const key = data?.key ?? payload?.key ?? {};
  const fromMe = key?.fromMe === true;

  if (fromMe) {
    return { phone: null, source: 'from_me', skip: true };
  }

  const remoteJid = key?.remoteJid ?? null;
  const participant = key?.participant ?? null;
  const sender = payload?.sender ?? data?.sender ?? null;

  // Group messages — skip for now
  if (remoteJid?.endsWith('@g.us')) {
    return { phone: null, source: 'group', skip: true };
  }

  // Direct chat: extract from remoteJid
  if (remoteJid?.endsWith('@s.whatsapp.net')) {
    const phone = extractPhoneFromJid(remoteJid);
    if (phone) return { phone, source: 'remoteJid', skip: false };
  }

  // LID format: try participant first, then sender
  if (remoteJid?.endsWith('@lid')) {
    if (participant && !participant.endsWith('@lid')) {
      const phone = extractPhoneFromJid(participant);
      if (phone) return { phone, source: 'participant_lid', skip: false };
    }
    if (sender) {
      const phone = extractPhoneFromJid(sender);
      if (phone) return { phone, source: 'sender_lid', skip: false };
    }
  }

  // Fallback: sender field
  if (sender) {
    const phone = extractPhoneFromJid(sender);
    if (phone) return { phone, source: 'sender', skip: false };
  }

  return { phone: null, source: 'unresolved', skip: true };
};
