const MIN_WHATSAPP_DIGITS = 10;
const MAX_WHATSAPP_DIGITS = 15;

const extractWebhookRemoteJidCandidate = (payload = {}) => {
  const candidates = [
    payload?.key?.remoteJid,
    payload?.message?.key?.remoteJid,
    payload?.data?.key?.remoteJid,
    payload?.sender,
    payload?.from,
  ];

  return (
    candidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || null
  );
};

export const normalizeWhatsAppNumber = (value) => {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const lowered = raw.toLowerCase();
  if (lowered === 'status@broadcast' || lowered.endsWith('@g.us')) {
    return null;
  }

  const withoutJid = raw.includes('@') ? raw.split('@')[0] : raw;
  const digits = withoutJid.replace(/\D/g, '');

  if (!digits || digits.length < MIN_WHATSAPP_DIGITS || digits.length > MAX_WHATSAPP_DIGITS) {
    return null;
  }

  return digits;
};

export const extractWhatsAppRemoteJidFromWebhook = (payload = {}) => {
  const remoteJid = extractWebhookRemoteJidCandidate(payload);

  if (!remoteJid) {
    return null;
  }

  return remoteJid.trim();
};

export const extractWhatsAppPhoneFromWebhook = (payload = {}) => {
  const remoteJid = extractWhatsAppRemoteJidFromWebhook(payload);

  if (!remoteJid || typeof remoteJid !== 'string') {
    return null;
  }

  const normalizedJid = remoteJid.toLowerCase();
  if (normalizedJid.includes('@g.us') || normalizedJid === 'status@broadcast') {
    return null;
  }

  const phone = remoteJid.split('@')[0].replace(/\D/g, '');

  if (phone.length < MIN_WHATSAPP_DIGITS || phone.length > MAX_WHATSAPP_DIGITS) {
    return null;
  }

  return phone;
};

export const isValidWhatsAppNumber = (value) => normalizeWhatsAppNumber(value) !== null;
