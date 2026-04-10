const MIN_WHATSAPP_DIGITS = 10;
const MAX_WHATSAPP_DIGITS = 15;

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

export const isValidWhatsAppNumber = (value) => normalizeWhatsAppNumber(value) !== null;
