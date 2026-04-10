const MIN_WHATSAPP_DIGITS = 10;
const MAX_WHATSAPP_DIGITS = 15;
const DIRECT_WHATSAPP_JID_SUFFIXES = ['@s.whatsapp.net', '@c.us'];
const BLOCKED_WHATSAPP_JID_SUFFIXES = ['@g.us', '@lid', '@broadcast', '@newsletter'];

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
  if (
    lowered === 'status@broadcast' ||
    lowered.endsWith('@g.us') ||
    lowered.endsWith('@lid') ||
    lowered.endsWith('@newsletter')
  ) {
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

const hasBlockedWebhookJidSuffix = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();

  if (!normalized) return false;
  if (normalized === 'status@broadcast') return true;

  return BLOCKED_WHATSAPP_JID_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const hasDirectWhatsAppJidSuffix = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return DIRECT_WHATSAPP_JID_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const normalizeWebhookPhoneCandidate = (value, { allowNumericOnly = false } = {}) => {
  if (typeof value !== 'string') {
    return null;
  }

  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  if (hasBlockedWebhookJidSuffix(candidate)) {
    return null;
  }

  const isJid = candidate.includes('@');
  if (isJid && !hasDirectWhatsAppJidSuffix(candidate)) {
    return null;
  }

  if (!isJid && !allowNumericOnly) {
    return null;
  }

  const phone = candidate.split('@')[0].replace(/\D/g, '');

  if (phone.length < MIN_WHATSAPP_DIGITS || phone.length > MAX_WHATSAPP_DIGITS) {
    return null;
  }

  return phone;
};

export const extractWhatsAppPhoneFromWebhook = (payload = {}) => {
  const primaryCandidates = [
    { value: payload?.key?.remoteJid, allowNumericOnly: false },
    { value: payload?.message?.key?.remoteJid, allowNumericOnly: false },
    { value: payload?.data?.key?.remoteJid, allowNumericOnly: false },
    { value: payload?.sender, allowNumericOnly: true },
    { value: payload?.from, allowNumericOnly: true },
  ];

  const hasLidOnPrimaryJid = [
    payload?.key?.remoteJid,
    payload?.message?.key?.remoteJid,
    payload?.data?.key?.remoteJid,
  ].some((candidate) => typeof candidate === 'string' && candidate.trim().toLowerCase().endsWith('@lid'));

  for (const candidate of primaryCandidates) {
    const isSenderOrFrom = candidate?.value === payload?.sender || candidate?.value === payload?.from;
    const allowNumericOnly = isSenderOrFrom
      ? candidate.allowNumericOnly && !hasLidOnPrimaryJid
      : candidate.allowNumericOnly;

    const phone = normalizeWebhookPhoneCandidate(candidate.value, {
      allowNumericOnly,
    });

    if (phone) {
      return phone;
    }
  }

  const fallbackCandidates = [
    { value: payload?.key?.participant, allowNumericOnly: false },
    { value: payload?.message?.key?.participant, allowNumericOnly: false },
    { value: payload?.data?.key?.participant, allowNumericOnly: false },
    { value: payload?.participant, allowNumericOnly: false },
    { value: payload?.data?.participant, allowNumericOnly: false },
    { value: payload?.senderPn, allowNumericOnly: true },
    { value: payload?.message?.senderPn, allowNumericOnly: true },
    { value: payload?.data?.senderPn, allowNumericOnly: true },
    { value: payload?.key?.participantPn, allowNumericOnly: true },
    { value: payload?.message?.key?.participantPn, allowNumericOnly: true },
    { value: payload?.data?.key?.participantPn, allowNumericOnly: true },
    { value: payload?.data?.messages?.[0]?.key?.participant, allowNumericOnly: false },
    { value: payload?.messages?.[0]?.key?.participant, allowNumericOnly: false },
    { value: payload?.data?.messages?.[0]?.senderPn, allowNumericOnly: true },
    { value: payload?.messages?.[0]?.senderPn, allowNumericOnly: true },
    { value: payload?.data?.messages?.[0]?.key?.remoteJid, allowNumericOnly: false },
    { value: payload?.messages?.[0]?.key?.remoteJid, allowNumericOnly: false },
  ];

  for (const candidate of fallbackCandidates) {
    const phone = normalizeWebhookPhoneCandidate(candidate.value, {
      allowNumericOnly: candidate.allowNumericOnly,
    });

    if (phone) {
      return phone;
    }
  }

  return null;
};

export const isValidWhatsAppNumber = (value) => normalizeWhatsAppNumber(value) !== null;
