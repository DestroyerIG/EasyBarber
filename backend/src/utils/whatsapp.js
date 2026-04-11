const MIN_WHATSAPP_DIGITS = 10;
const MAX_WHATSAPP_DIGITS = 15;
const DIRECT_WHATSAPP_JID_SUFFIXES = ['@s.whatsapp.net', '@c.us'];
const BLOCKED_WHATSAPP_JID_SUFFIXES = ['@g.us', '@lid', '@broadcast', '@newsletter'];
const HARD_BLOCKED_CONVERSATION_JID_SUFFIXES = ['@g.us', '@broadcast', '@newsletter'];
const MAX_EXTRACTION_REJECTIONS = 20;

const WEBHOOK_REMOTE_JID_CANDIDATES = [
  { sourcePath: 'key.remoteJid', getValue: (payload) => payload?.key?.remoteJid },
  { sourcePath: 'message.key.remoteJid', getValue: (payload) => payload?.message?.key?.remoteJid },
  { sourcePath: 'data.key.remoteJid', getValue: (payload) => payload?.data?.key?.remoteJid },
  {
    sourcePath: 'data.messages[0].key.remoteJid',
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.remoteJid,
  },
  {
    sourcePath: 'messages[0].key.remoteJid',
    getValue: (payload) => payload?.messages?.[0]?.key?.remoteJid,
  },
];

const WEBHOOK_INSTANCE_NUMBER_CANDIDATES = [
  (payload) => payload?.instance?.number,
  (payload) => payload?.instance?.phone,
  (payload) => payload?.instance?.wid,
  (payload) => payload?.instance?.ownerJid,
  (payload) => payload?.data?.instance?.number,
  (payload) => payload?.data?.instance?.phone,
  (payload) => payload?.data?.instance?.wid,
  (payload) => payload?.data?.instance?.ownerJid,
  (payload) => payload?.instanceData?.number,
  (payload) => payload?.instanceData?.phone,
  (payload) => payload?.instanceData?.wid,
  (payload) => payload?.instanceData?.ownerJid,
];

const WEBHOOK_PHONE_EXTRACTION_CANDIDATES = [
  {
    sourcePath: 'sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.sender,
  },
  {
    sourcePath: 'data.sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.sender,
  },
  {
    sourcePath: 'message.sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.sender,
  },
  {
    sourcePath: 'data.messages[0].sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.sender,
  },
  {
    sourcePath: 'messages[0].sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.sender,
  },
  {
    sourcePath: 'from',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.from,
  },
  {
    sourcePath: 'data.from',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.from,
  },
  {
    sourcePath: 'message.from',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.from,
  },
  {
    sourcePath: 'data.messages[0].from',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.from,
  },
  {
    sourcePath: 'messages[0].from',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.from,
  },
  {
    sourcePath: 'senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.senderPn,
  },
  {
    sourcePath: 'data.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.senderPn,
  },
  {
    sourcePath: 'message.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.senderPn,
  },
  {
    sourcePath: 'data.messages[0].senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.senderPn,
  },
  {
    sourcePath: 'messages[0].senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.senderPn,
  },
  {
    sourcePath: 'key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.key?.participantPn,
  },
  {
    sourcePath: 'data.key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.key?.participantPn,
  },
  {
    sourcePath: 'message.key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.key?.participantPn,
  },
  {
    sourcePath: 'data.messages[0].key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.participantPn,
  },
  {
    sourcePath: 'messages[0].key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.key?.participantPn,
  },
  {
    sourcePath: 'key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.key?.participant,
  },
  {
    sourcePath: 'data.key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.key?.participant,
  },
  {
    sourcePath: 'message.key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.key?.participant,
  },
  {
    sourcePath: 'participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.participant,
  },
  {
    sourcePath: 'data.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.participant,
  },
  {
    sourcePath: 'message.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.participant,
  },
  {
    sourcePath: 'data.messages[0].key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.participant,
  },
  {
    sourcePath: 'messages[0].key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.key?.participant,
  },
  {
    sourcePath: 'key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.key?.remoteJid,
  },
  {
    sourcePath: 'data.key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.key?.remoteJid,
  },
  {
    sourcePath: 'message.key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.key?.remoteJid,
  },
  {
    sourcePath: 'data.messages[0].key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.remoteJid,
  },
  {
    sourcePath: 'messages[0].key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.key?.remoteJid,
  },
];

const extractWebhookRemoteJidCandidate = (payload = {}) => {
  for (const candidate of WEBHOOK_REMOTE_JID_CANDIDATES) {
    const value = candidate.getValue(payload);
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
};

export const normalizePhone = (value) => {
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

export const normalizeWhatsAppNumber = (value) => normalizePhone(value);

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

const hasHardBlockedConversationJidSuffix = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();

  if (!normalized) return false;
  if (normalized === 'status@broadcast') return true;

  return HARD_BLOCKED_CONVERSATION_JID_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const hasDirectWhatsAppJidSuffix = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return DIRECT_WHATSAPP_JID_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const parseWebhookPhoneCandidate = (value, { allowNumericOnly = false } = {}) => {
  if (typeof value !== 'string') {
    return { phone: null, reason: 'non_string' };
  }

  const candidate = value.trim();
  if (!candidate) {
    return { phone: null, reason: 'empty' };
  }

  if (hasBlockedWebhookJidSuffix(candidate)) {
    return { phone: null, reason: 'blocked_jid_suffix' };
  }

  const isJid = candidate.includes('@');
  if (isJid && !hasDirectWhatsAppJidSuffix(candidate)) {
    return { phone: null, reason: 'unsupported_jid_suffix' };
  }

  if (!isJid && !allowNumericOnly) {
    return { phone: null, reason: 'numeric_not_allowed' };
  }

  const phone = candidate.split('@')[0].replace(/\D/g, '');
  if (phone.length < MIN_WHATSAPP_DIGITS || phone.length > MAX_WHATSAPP_DIGITS) {
    return { phone: null, reason: 'invalid_digits_length' };
  }

  return { phone, reason: null };
};

const appendRejection = (rejections, sourcePath, reason) => {
  if (
    !reason ||
    reason === 'non_string' ||
    reason === 'empty' ||
    rejections.length >= MAX_EXTRACTION_REJECTIONS
  ) {
    return;
  }

  rejections.push({ sourcePath, reason });
};

const findBlockedConversationCandidate = (payload = {}) => {
  for (const candidate of WEBHOOK_REMOTE_JID_CANDIDATES) {
    const value = candidate.getValue(payload);
    if (hasHardBlockedConversationJidSuffix(value)) {
      return {
        sourcePath: candidate.sourcePath,
        value,
      };
    }
  }

  return null;
};

const normalizeKnownConnectedNumbers = (options = {}) => {
  const values = [
    options?.connectedNumber,
    ...(Array.isArray(options?.connectedNumbers) ? options.connectedNumbers : []),
  ];

  const normalized = new Set();
  for (const value of values) {
    const phone = normalizeWhatsAppNumber(value);
    if (phone) {
      normalized.add(phone);
    }
  }

  return normalized;
};

export const extractWhatsAppInstanceNumbersFromWebhook = (payload = {}, options = {}) => {
  const numbers = normalizeKnownConnectedNumbers(options);

  for (const resolver of WEBHOOK_INSTANCE_NUMBER_CANDIDATES) {
    const value = resolver(payload);
    const normalized = normalizeWhatsAppNumber(value);
    if (normalized) {
      numbers.add(normalized);
    }
  }

  return Array.from(numbers);
};

const resolveWebhookPhoneExtractionCandidates = (payload = {}) => {
  return WEBHOOK_PHONE_EXTRACTION_CANDIDATES;
};

const normalizeWebhookPhoneCandidate = (value, { allowNumericOnly = false } = {}) => {
  const parsed = parseWebhookPhoneCandidate(value, { allowNumericOnly });
  return parsed.phone;
};

export const extractWhatsAppPhoneFromWebhookDetailed = (payload = {}, options = {}) => {
  const instanceNumbers = extractWhatsAppInstanceNumbersFromWebhook(payload, options);
  const instanceNumbersSet = new Set(instanceNumbers);
  const rejections = [];
  const blockedConversation = findBlockedConversationCandidate(payload);
  const candidates = resolveWebhookPhoneExtractionCandidates(payload);

  if (blockedConversation) {
    appendRejection(rejections, blockedConversation.sourcePath, 'blocked_conversation_jid');

    return {
      phone: null,
      sourcePath: null,
      candidateType: null,
      instanceNumbers,
      rejections,
    };
  }

  for (const candidate of candidates) {
    const value = candidate.getValue(payload);
    const parsed = parseWebhookPhoneCandidate(value, {
      allowNumericOnly: candidate.allowNumericOnly,
    });

    if (!parsed.phone) {
      appendRejection(rejections, candidate.sourcePath, parsed.reason);
      continue;
    }

    if (instanceNumbersSet.has(parsed.phone)) {
      appendRejection(rejections, candidate.sourcePath, 'instance_number');
      continue;
    }

    return {
      phone: parsed.phone,
      sourcePath: candidate.sourcePath,
      candidateType: candidate.candidateType,
      instanceNumbers,
      rejections,
    };
  }

  return {
    phone: null,
    sourcePath: null,
    candidateType: null,
    instanceNumbers,
    rejections,
  };
};

export const extractWhatsAppPhoneFromWebhook = (payload = {}, options = {}) =>
  extractWhatsAppPhoneFromWebhookDetailed(payload, options).phone;

export const extractPhoneFromPayload = (payload = {}, options = {}) =>
  extractWhatsAppPhoneFromWebhookDetailed(payload, options).phone;

/**
 * Extrai o telefone do REMETENTE (quem enviou a mensagem).
 *
 * Na Evolution API, para mensagens recebidas em chat 1:1:
 *   - key.remoteJid = JID do remetente ✅
 *   - sender        = JID do remetente (pode estar presente ou não)
 *
 * O problema: em alguns formatos de payload, o `remoteJid` pode conter
 * o número da instância/bot ao invés do cliente que enviou.
 * Por isso priorizamos `sender` e `from` quando disponíveis.
 */
export const extractSenderPhoneFromWebhook = (payload = {}) => {
  return extractWhatsAppPhoneFromWebhook(payload);
};

export const isValidWhatsAppNumber = (value) => normalizeWhatsAppNumber(value) !== null;
