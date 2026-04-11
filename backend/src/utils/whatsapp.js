const MIN_WHATSAPP_DIGITS = 10;
const MAX_WHATSAPP_DIGITS = 15;
const DIRECT_WHATSAPP_JID_SUFFIXES = ['@s.whatsapp.net', '@c.us'];
const BLOCKED_WHATSAPP_JID_SUFFIXES = ['@g.us', '@lid', '@broadcast', '@newsletter'];
const BLOCKED_SEND_JID_SUFFIXES = ['@lid', '@g.us', '@broadcast', '@newsletter'];
const HARD_BLOCKED_CONVERSATION_JID_SUFFIXES = ['@g.us', '@broadcast', '@newsletter'];
const MAX_EXTRACTION_REJECTIONS = 20;
const INCOMING_AUTHOR_MIN_SCORE = 60;
const INCOMING_AUTHOR_HIGH_CONFIDENCE_MIN = 90;
const INCOMING_AUTHOR_MEDIUM_CONFIDENCE_MIN = 75;
const INCOMING_AUTHOR_SENDER_FALLBACK_SOURCE_PATHS = new Set([
  'sender',
  'data.sender',
  'message.sender',
  'data.messages[0].sender',
  'messages[0].sender',
]);

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

const WEBHOOK_SENDER_CANDIDATES = [
  (payload) => payload?.sender,
  (payload) => payload?.data?.sender,
  (payload) => payload?.message?.sender,
  (payload) => payload?.data?.messages?.[0]?.sender,
  (payload) => payload?.messages?.[0]?.sender,
  (payload) => payload?.from,
  (payload) => payload?.data?.from,
  (payload) => payload?.message?.from,
  (payload) => payload?.data?.messages?.[0]?.from,
  (payload) => payload?.messages?.[0]?.from,
];

const WEBHOOK_PARTICIPANT_CANDIDATES = [
  (payload) => payload?.key?.participant,
  (payload) => payload?.data?.key?.participant,
  (payload) => payload?.message?.key?.participant,
  (payload) => payload?.participant,
  (payload) => payload?.data?.participant,
  (payload) => payload?.message?.participant,
  (payload) => payload?.data?.messages?.[0]?.key?.participant,
  (payload) => payload?.messages?.[0]?.key?.participant,
];

const WEBHOOK_PUSH_NAME_CANDIDATES = [
  (payload) => payload?.pushName,
  (payload) => payload?.data?.pushName,
  (payload) => payload?.message?.pushName,
  (payload) => payload?.data?.messages?.[0]?.pushName,
  (payload) => payload?.messages?.[0]?.pushName,
  (payload) => payload?.key?.pushName,
  (payload) => payload?.data?.key?.pushName,
  (payload) => payload?.message?.key?.pushName,
  (payload) => payload?.data?.messages?.[0]?.key?.pushName,
  (payload) => payload?.messages?.[0]?.key?.pushName,
];

const WEBHOOK_TEXT_CANDIDATES = [
  (payload) => payload?.text,
  (payload) => payload?.body,
  (payload) => payload?.message,
  (payload) => payload?.content,
  (payload) => payload?.data?.text,
  (payload) => payload?.data?.body,
  (payload) => payload?.data?.message,
  (payload) => payload?.data?.content,
  (payload) => payload?.message?.text,
  (payload) => payload?.message?.body,
  (payload) => payload?.message?.conversation,
  (payload) => payload?.message?.extendedTextMessage?.text,
  (payload) => payload?.data?.message?.conversation,
  (payload) => payload?.data?.message?.extendedTextMessage?.text,
  (payload) => payload?.data?.messages?.[0]?.message?.conversation,
  (payload) => payload?.data?.messages?.[0]?.message?.extendedTextMessage?.text,
  (payload) => payload?.messages?.[0]?.message?.conversation,
  (payload) => payload?.messages?.[0]?.message?.extendedTextMessage?.text,
];

const WEBHOOK_FROM_ME_CANDIDATES = [
  (payload) => payload?.fromMe,
  (payload) => payload?.key?.fromMe,
  (payload) => payload?.data?.fromMe,
  (payload) => payload?.data?.key?.fromMe,
  (payload) => payload?.data?.messages?.[0]?.key?.fromMe,
  (payload) => payload?.messages?.[0]?.key?.fromMe,
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

const getFirstStringCandidate = (payload = {}, resolvers = []) => {
  for (const resolver of resolvers) {
    const value = resolver(payload);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const normalizeWebhookBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const extractWebhookFromMe = (payload = {}) =>
  WEBHOOK_FROM_ME_CANDIDATES.some((resolver) => normalizeWebhookBoolean(resolver(payload)));

const extractWebhookSenderCandidate = (payload = {}) =>
  getFirstStringCandidate(payload, WEBHOOK_SENDER_CANDIDATES);

const extractWebhookParticipantCandidate = (payload = {}) =>
  getFirstStringCandidate(payload, WEBHOOK_PARTICIPANT_CANDIDATES);

const extractWebhookPushNameCandidate = (payload = {}) =>
  getFirstStringCandidate(payload, WEBHOOK_PUSH_NAME_CANDIDATES);

const extractIncomingTextCandidate = (payload = {}, options = {}) => {
  const directText =
    typeof options?.messageText === 'string' && options.messageText.trim()
      ? options.messageText.trim()
      : null;

  if (directText) {
    return directText;
  }

  for (const resolver of WEBHOOK_TEXT_CANDIDATES) {
    const value = resolver(payload);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const resolveIncomingConversationKind = (remoteJidOriginal) => {
  if (typeof remoteJidOriginal !== 'string' || !remoteJidOriginal.trim()) {
    return 'unknown';
  }

  const normalized = remoteJidOriginal.trim().toLowerCase();

  if (normalized === 'status@broadcast' || normalized.endsWith('@broadcast')) {
    return 'broadcast';
  }

  if (normalized.endsWith('@newsletter')) {
    return 'newsletter';
  }

  if (normalized.endsWith('@g.us')) {
    return 'group';
  }

  if (normalized.endsWith('@lid')) {
    return 'lid';
  }

  if (normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@c.us')) {
    return 'direct';
  }

  return 'unknown';
};

const hasBlockedSendJidSuffix = (value) => {
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized === 'status@broadcast') {
    return true;
  }

  return BLOCKED_SEND_JID_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

export const isInvalidJidContext = (jid) => hasBlockedSendJidSuffix(jid);

export const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;

  const candidate = phone.trim();
  if (!candidate) return false;

  return /^\d{10,15}$/.test(candidate);
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

export const normalizePhoneForSend = (value) => {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (hasBlockedSendJidSuffix(raw)) {
    return null;
  }

  const lowered = raw.toLowerCase();
  let candidate = raw;

  if (lowered.endsWith('@s.whatsapp.net')) {
    candidate = raw.slice(0, -'@s.whatsapp.net'.length);
  } else if (lowered.endsWith('@c.us')) {
    candidate = raw.slice(0, -'@c.us'.length);
  } else if (raw.includes('@')) {
    candidate = raw.split('@')[0];
  }

  const digits = candidate.replace(/\D/g, '');
  if (!isValidPhone(digits)) {
    return null;
  }

  return digits;
};

export const resolveReplyDestination = ({ phone } = {}) => {
  const normalizedPhone = normalizePhoneForSend(phone);
  if (!normalizedPhone || !isValidPhone(normalizedPhone)) {
    return null;
  }

  return normalizedPhone;
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

const classifyAuthorCandidateRole = (candidate) => {
  if (!candidate || typeof candidate !== 'object') {
    return 'unknown';
  }

  if (candidate.candidateType === 'direct_jid') {
    return 'remote_jid';
  }

  if (candidate.candidateType === 'participant_jid') {
    return 'participant_jid';
  }

  if (candidate.candidateType === 'sender_jid') {
    return 'sender_jid';
  }

  if (candidate.candidateType === 'numeric_fallback') {
    return candidate.sourcePath.includes('participant')
      ? 'participant_numeric'
      : 'sender_numeric';
  }

  return 'unknown';
};

const getBaseAuthorScore = (conversationKind, authorRole) => {
  const byConversation = {
    direct: {
      remote_jid: 95,
      participant_jid: 86,
      participant_numeric: 78,
      sender_numeric: 72,
      sender_jid: 65,
    },
    lid: {
      participant_jid: 95,
      participant_numeric: 90,
      sender_numeric: 70,
      sender_jid: 40,
      remote_jid: 0,
    },
    group: {
      participant_jid: 95,
      participant_numeric: 86,
      sender_numeric: 60,
      sender_jid: 52,
      remote_jid: 0,
    },
    unknown: {
      participant_jid: 86,
      remote_jid: 80,
      participant_numeric: 74,
      sender_numeric: 65,
      sender_jid: 55,
    },
  };

  const normalizedKind = byConversation[conversationKind] ? conversationKind : 'unknown';
  return byConversation[normalizedKind][authorRole] ?? 0;
};

const getAuthorSourcePathBoost = (sourcePath = '') => {
  if (sourcePath.startsWith('key.') || sourcePath.startsWith('data.key.')) {
    return 6;
  }

  if (sourcePath.startsWith('message.key.')) {
    return 5;
  }

  if (sourcePath.includes('messages[0].key.')) {
    return 3;
  }

  if (sourcePath === 'sender' || sourcePath === 'data.sender') {
    return 1;
  }

  return 0;
};

const mapScoreToConfidence = (score) => {
  if (score >= INCOMING_AUTHOR_HIGH_CONFIDENCE_MIN) {
    return 'high';
  }

  if (score >= INCOMING_AUTHOR_MEDIUM_CONFIDENCE_MIN) {
    return 'medium';
  }

  if (score >= INCOMING_AUTHOR_MIN_SCORE) {
    return 'low';
  }

  return 'none';
};

const scoreIncomingAuthorCandidate = ({
  candidate,
  phone,
  remoteJidOriginal,
  conversationKind,
}) => {
  const authorRole = classifyAuthorCandidateRole(candidate);
  let score = getBaseAuthorScore(conversationKind, authorRole) + getAuthorSourcePathBoost(candidate.sourcePath);

  const normalizedRemoteJidPhone = normalizeWhatsAppNumber(remoteJidOriginal);

  if (authorRole === 'remote_jid' && normalizedRemoteJidPhone && phone === normalizedRemoteJidPhone) {
    score += 4;
  }

  if (
    (authorRole === 'sender_jid' || authorRole === 'sender_numeric') &&
    normalizedRemoteJidPhone &&
    phone === normalizedRemoteJidPhone
  ) {
    score += 3;
  }

  if (authorRole === 'participant_jid' || authorRole === 'participant_numeric') {
    score += 2;
  }

  return {
    score,
    authorRole,
    confidence: mapScoreToConfidence(score),
  };
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

export const resolveIncomingAuthor = (payload = {}, options = {}) => {
  const instanceNumbers = extractWhatsAppInstanceNumbersFromWebhook(payload, options);
  const instanceNumbersSet = new Set(instanceNumbers);
  const rejections = [];
  const blockedConversation = findBlockedConversationCandidate(payload);
  const remoteJidOriginal = extractWhatsAppRemoteJidFromWebhook(payload);
  const conversationKind = resolveIncomingConversationKind(remoteJidOriginal);
  const fromMe = extractWebhookFromMe(payload);
  const sender = extractWebhookSenderCandidate(payload);
  const participant = extractWebhookParticipantCandidate(payload);
  const pushName = extractWebhookPushNameCandidate(payload);
  const incomingText = extractIncomingTextCandidate(payload, options);
  const candidates = resolveWebhookPhoneExtractionCandidates(payload);

  const serializeCandidates = () =>
    matchedCandidates
      .slice()
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ index: _index, ...candidate }) => candidate);

  if (fromMe) {
    appendRejection(rejections, 'fromMe', 'self_message');

    return {
      authorPhone: null,
      sourcePath: null,
      candidateType: null,
      confidence: 'none',
      remoteJidOriginal,
      sender,
      participant,
      pushName,
      fromMe,
      instanceNumbers,
      rejections,
      candidates: [],
    };
  }

  if (blockedConversation) {
    appendRejection(rejections, blockedConversation.sourcePath, 'blocked_conversation_jid');

    return {
      authorPhone: null,
      sourcePath: null,
      candidateType: null,
      confidence: 'none',
      remoteJidOriginal,
      sender,
      participant,
      pushName,
      fromMe,
      instanceNumbers,
      rejections,
      candidates: [],
    };
  }

  if (conversationKind === 'broadcast' || conversationKind === 'newsletter') {
    appendRejection(rejections, 'key.remoteJid', 'blocked_conversation_jid');

    return {
      authorPhone: null,
      sourcePath: null,
      candidateType: null,
      confidence: 'none',
      remoteJidOriginal,
      sender,
      participant,
      pushName,
      fromMe,
      instanceNumbers,
      rejections,
      candidates: [],
    };
  }

  const matchedCandidates = [];

  for (const [index, candidate] of candidates.entries()) {
    const value = candidate.getValue(payload);
    const parsed = parseWebhookPhoneCandidate(value, {
      allowNumericOnly: candidate.allowNumericOnly,
    });

    if (!parsed.phone) {
      appendRejection(rejections, candidate.sourcePath, parsed.reason);

      if (typeof value === 'string' && value.trim()) {
        matchedCandidates.push({
          sourcePath: candidate.sourcePath,
          candidateType: candidate.candidateType,
          rawValue: value.trim(),
          phone: null,
          score: 0,
          confidence: 'none',
          rejectedReason: parsed.reason,
          index,
        });
      }
      continue;
    }

    if (instanceNumbersSet.has(parsed.phone)) {
      appendRejection(rejections, candidate.sourcePath, 'instance_number');

      matchedCandidates.push({
        sourcePath: candidate.sourcePath,
        candidateType: candidate.candidateType,
        rawValue: typeof value === 'string' ? value.trim() : value,
        phone: parsed.phone,
        score: 0,
        confidence: 'none',
        rejectedReason: 'instance_number',
        index,
      });

      continue;
    }

    const scoredCandidate = scoreIncomingAuthorCandidate({
      candidate,
      phone: parsed.phone,
      remoteJidOriginal,
      conversationKind,
    });

    matchedCandidates.push({
      sourcePath: candidate.sourcePath,
      candidateType: candidate.candidateType,
      rawValue: typeof value === 'string' ? value.trim() : value,
      phone: parsed.phone,
      score: scoredCandidate.score,
      confidence: scoredCandidate.confidence,
      authorRole: scoredCandidate.authorRole,
      rejectedReason: null,
      index,
    });
  }

  const rankedCandidates = matchedCandidates
    .filter((candidate) => candidate.phone && !candidate.rejectedReason)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const bestCandidate = rankedCandidates[0] || null;
  const secondCandidate = rankedCandidates[1] || null;
  const normalizedSenderPhone = normalizeWhatsAppNumber(sender);
  const senderFallbackCandidate = normalizedSenderPhone
    ? rankedCandidates.find(
        (candidate) =>
          INCOMING_AUTHOR_SENDER_FALLBACK_SOURCE_PATHS.has(candidate.sourcePath) &&
          candidate.phone === normalizedSenderPhone
      ) || null
    : null;

  if (!bestCandidate) {
    return {
      authorPhone: null,
      sourcePath: null,
      candidateType: null,
      confidence: 'none',
      remoteJidOriginal,
      sender,
      participant,
      pushName,
      fromMe,
      instanceNumbers,
      rejections,
      candidates: serializeCandidates(),
    };
  }

  if (
    secondCandidate &&
    secondCandidate.score === bestCandidate.score &&
    secondCandidate.phone !== bestCandidate.phone
  ) {
    appendRejection(rejections, bestCandidate.sourcePath, 'ambiguous_author_candidates');

    return {
      authorPhone: null,
      sourcePath: null,
      candidateType: null,
      confidence: 'none',
      remoteJidOriginal,
      sender,
      participant,
      pushName,
      fromMe,
      instanceNumbers,
      rejections,
      candidates: serializeCandidates(),
    };
  }

  if (bestCandidate.score < INCOMING_AUTHOR_MIN_SCORE) {
    const hasBetterCandidateThanSender = senderFallbackCandidate
      ? rankedCandidates.some(
          (candidate) =>
            candidate.phone !== senderFallbackCandidate.phone &&
            candidate.score > senderFallbackCandidate.score
        )
      : false;
    const shouldPromoteSenderFallback =
      !fromMe &&
      Boolean(incomingText) &&
      senderFallbackCandidate &&
      !hasBetterCandidateThanSender;

    if (shouldPromoteSenderFallback) {
      return {
        authorPhone: senderFallbackCandidate.phone,
        sourcePath: senderFallbackCandidate.sourcePath,
        candidateType: senderFallbackCandidate.candidateType,
        confidence:
          senderFallbackCandidate.confidence === 'none'
            ? 'low'
            : senderFallbackCandidate.confidence,
        remoteJidOriginal,
        sender,
        participant,
        pushName,
        fromMe,
        instanceNumbers,
        rejections,
        candidates: serializeCandidates(),
      };
    }

    appendRejection(rejections, bestCandidate.sourcePath, 'low_confidence_author');

    return {
      authorPhone: null,
      sourcePath: null,
      candidateType: null,
      confidence: 'none',
      remoteJidOriginal,
      sender,
      participant,
      pushName,
      fromMe,
      instanceNumbers,
      rejections,
      candidates: serializeCandidates(),
    };
  }

  return {
    authorPhone: bestCandidate.phone,
    sourcePath: bestCandidate.sourcePath,
    candidateType: bestCandidate.candidateType,
    confidence: bestCandidate.confidence,
    remoteJidOriginal,
    sender,
    participant,
    pushName,
    fromMe,
    instanceNumbers,
    rejections,
    candidates: serializeCandidates(),
  };
};

export const extractWhatsAppPhoneFromWebhookDetailed = (payload = {}, options = {}) => {
  const authorResolution = resolveIncomingAuthor(payload, options);

  return {
    phone: authorResolution.authorPhone,
    sourcePath: authorResolution.sourcePath,
    candidateType: authorResolution.candidateType,
    confidence: authorResolution.confidence,
    remoteJidOriginal: authorResolution.remoteJidOriginal,
    sender: authorResolution.sender,
    participant: authorResolution.participant,
    pushName: authorResolution.pushName,
    fromMe: authorResolution.fromMe,
    instanceNumbers: authorResolution.instanceNumbers,
    rejections: authorResolution.rejections,
    candidates: authorResolution.candidates,
  };
};

export const extractWhatsAppPhoneFromWebhook = (payload = {}, options = {}) =>
  extractWhatsAppPhoneFromWebhookDetailed(payload, options).phone;

export const extractPhoneFromPayload = (payload = {}, options = {}) =>
  extractWhatsAppPhoneFromWebhookDetailed(payload, options).phone;

/**
 * Extrai telefone para resposta a partir da resolução explícita do autor.
 */
export const extractSenderPhoneFromWebhook = (payload = {}) => {
  return extractWhatsAppPhoneFromWebhook(payload);
};

export const isValidWhatsAppNumber = (value) => normalizeWhatsAppNumber(value) !== null;
