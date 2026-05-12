// @ts-nocheck — large legacy file, typed facade migration planned for a future pass
const MIN_WHATSAPP_DIGITS = 10;
const MAX_WHATSAPP_DIGITS = 15;
const DIRECT_WHATSAPP_JID_SUFFIXES = ['@s.whatsapp.net', '@c.us'];
const BLOCKED_WHATSAPP_JID_SUFFIXES = ['@g.us', '@lid', '@broadcast', '@newsletter'];
const BLOCKED_SEND_JID_SUFFIXES = ['@g.us', '@broadcast', '@newsletter'];
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
  'key.sender',
  'data.key.sender',
  'message.key.sender',
  'data.messages[0].key.sender',
  'messages[0].key.sender',
]);
const INCOMING_AUTHOR_LID_FROM_FALLBACK_SOURCE_PATHS = new Set([
  'from',
  'data.from',
  'message.from',
  'data.messages[0].from',
  'messages[0].from',
]);
const INCOMING_AUTHOR_LID_METADATA_SOURCE_PATHS = new Set([
  'contextInfo.participant',
  'data.contextInfo.participant',
  'message.contextInfo.participant',
  'messageContextInfo.participant',
  'data.messageContextInfo.participant',
  'message.messageContextInfo.participant',
  'data.messages[0].messageContextInfo.participant',
  'messages[0].messageContextInfo.participant',
  'message.extendedTextMessage.contextInfo.participant',
  'data.message.extendedTextMessage.contextInfo.participant',
  'data.messages[0].message.extendedTextMessage.contextInfo.participant',
  'messages[0].message.extendedTextMessage.contextInfo.participant',
  'data.message.messageContextInfo.participant',
  'data.messages[0].message.messageContextInfo.participant',
  'messages[0].message.messageContextInfo.participant',
  'contextInfo.participantPn',
  'data.contextInfo.participantPn',
  'message.contextInfo.participantPn',
  'messageContextInfo.participantPn',
  'data.messageContextInfo.participantPn',
  'message.messageContextInfo.participantPn',
  'data.messages[0].messageContextInfo.participantPn',
  'messages[0].messageContextInfo.participantPn',
  'message.extendedTextMessage.contextInfo.participantPn',
  'data.message.extendedTextMessage.contextInfo.participantPn',
  'data.messages[0].message.extendedTextMessage.contextInfo.participantPn',
  'messages[0].message.extendedTextMessage.contextInfo.participantPn',
  'data.message.messageContextInfo.participantPn',
  'data.messages[0].message.messageContextInfo.participantPn',
  'messages[0].message.messageContextInfo.participantPn',
  'contextInfo.senderPn',
  'data.contextInfo.senderPn',
  'message.contextInfo.senderPn',
  'messageContextInfo.senderPn',
  'data.messageContextInfo.senderPn',
  'message.messageContextInfo.senderPn',
  'data.messages[0].messageContextInfo.senderPn',
  'messages[0].messageContextInfo.senderPn',
  'message.extendedTextMessage.contextInfo.senderPn',
  'data.message.extendedTextMessage.contextInfo.senderPn',
  'data.messages[0].message.extendedTextMessage.contextInfo.senderPn',
  'messages[0].message.extendedTextMessage.contextInfo.senderPn',
  'data.message.messageContextInfo.senderPn',
  'data.messages[0].message.messageContextInfo.senderPn',
  'messages[0].message.messageContextInfo.senderPn',
]);
const LID_SENDER_FALLBACK_EVENTS = new Set([
  'messages-upsert',
  'messagesupsert',
  'message-upsert',
  'messageupsert',
]);

/**
 * Cache em memória para mapear @lid -> telefone real quando observado.
 * Ex.: "268796367515747@lid" -> "5583991347023"
 */
const LID_TO_PHONE_CACHE = new Map();
const LID_CACHE_MAX_ENTRIES = 5000;

const WEBHOOK_REMOTE_JID_CANDIDATES = [
  { sourcePath: 'key.remoteJid', getValue: (payload) => payload?.key?.remoteJid },
  { sourcePath: 'message.key.remoteJid', getValue: (payload) => payload?.message?.key?.remoteJid },
  { sourcePath: 'data.key.remoteJid', getValue: (payload) => payload?.data?.key?.remoteJid },
  {
    sourcePath: 'data.messages[0].message.key.remoteJid',
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.key?.remoteJid,
  },
  {
    sourcePath: 'data.messages[0].key.remoteJid',
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.remoteJid,
  },
  {
    sourcePath: 'messages[0].message.key.remoteJid',
    getValue: (payload) => payload?.messages?.[0]?.message?.key?.remoteJid,
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
  (payload) => payload?.data?.messages?.[0]?.message?.key?.participant,
  (payload) => payload?.participant,
  (payload) => payload?.data?.participant,
  (payload) => payload?.message?.participant,
  (payload) => payload?.data?.messages?.[0]?.key?.participant,
  (payload) => payload?.messages?.[0]?.message?.key?.participant,
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
  (payload) => payload?.data?.messages?.[0]?.message?.key?.fromMe,
  (payload) => payload?.data?.messages?.[0]?.key?.fromMe,
  (payload) => payload?.messages?.[0]?.message?.key?.fromMe,
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
    sourcePath: 'key.sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.key?.sender,
  },
  {
    sourcePath: 'data.key.sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.key?.sender,
  },
  {
    sourcePath: 'message.key.sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.key?.sender,
  },
  {
    sourcePath: 'data.messages[0].key.sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.sender,
  },
  {
    sourcePath: 'messages[0].key.sender',
    candidateType: 'sender_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.key?.sender,
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
    sourcePath: 'key.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.key?.senderPn,
  },
  {
    sourcePath: 'data.key.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.key?.senderPn,
  },
  {
    sourcePath: 'message.key.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.key?.senderPn,
  },
  {
    sourcePath: 'data.messages[0].message.key.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.key?.senderPn,
  },
  {
    sourcePath: 'data.messages[0].key.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.senderPn,
  },
  {
    sourcePath: 'messages[0].message.key.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.message?.key?.senderPn,
  },
  {
    sourcePath: 'messages[0].key.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.key?.senderPn,
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
    sourcePath: 'data.messages[0].message.key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.key?.participantPn,
  },
  {
    sourcePath: 'data.messages[0].key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.participantPn,
  },
  {
    sourcePath: 'messages[0].message.key.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.message?.key?.participantPn,
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
    sourcePath: 'data.messages[0].message.key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.key?.participant,
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
    sourcePath: 'messages[0].message.key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.message?.key?.participant,
  },
  {
    sourcePath: 'messages[0].key.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.key?.participant,
  },
  {
    sourcePath: 'contextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.contextInfo?.participant,
  },
  {
    sourcePath: 'data.contextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.contextInfo?.participant,
  },
  {
    sourcePath: 'message.contextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.contextInfo?.participant,
  },
  {
    sourcePath: 'messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'data.messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'message.messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'data.messages[0].messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'messages[0].messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'message.extendedTextMessage.contextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.extendedTextMessage?.contextInfo?.participant,
  },
  {
    sourcePath: 'data.message.extendedTextMessage.contextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.message?.extendedTextMessage?.contextInfo?.participant,
  },
  {
    sourcePath: 'data.messages[0].message.extendedTextMessage.contextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.participant,
  },
  {
    sourcePath: 'messages[0].message.extendedTextMessage.contextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.participant,
  },
  {
    sourcePath: 'message.messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.message?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'data.message.messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.message?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'data.messages[0].message.messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'messages[0].message.messageContextInfo.participant',
    candidateType: 'participant_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.message?.messageContextInfo?.participant,
  },
  {
    sourcePath: 'contextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.contextInfo?.participantPn,
  },
  {
    sourcePath: 'data.contextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.contextInfo?.participantPn,
  },
  {
    sourcePath: 'message.contextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.contextInfo?.participantPn,
  },
  {
    sourcePath: 'messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'data.messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'message.messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'data.messages[0].messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'messages[0].messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'message.extendedTextMessage.contextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.extendedTextMessage?.contextInfo?.participantPn,
  },
  {
    sourcePath: 'data.message.extendedTextMessage.contextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.message?.extendedTextMessage?.contextInfo?.participantPn,
  },
  {
    sourcePath: 'data.messages[0].message.extendedTextMessage.contextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.participantPn,
  },
  {
    sourcePath: 'messages[0].message.extendedTextMessage.contextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.participantPn,
  },
  {
    sourcePath: 'message.messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'data.message.messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.message?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'data.messages[0].message.messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'messages[0].message.messageContextInfo.participantPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.message?.messageContextInfo?.participantPn,
  },
  {
    sourcePath: 'contextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.contextInfo?.senderPn,
  },
  {
    sourcePath: 'data.contextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.contextInfo?.senderPn,
  },
  {
    sourcePath: 'message.contextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.contextInfo?.senderPn,
  },
  {
    sourcePath: 'messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messageContextInfo?.senderPn,
  },
  {
    sourcePath: 'data.messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messageContextInfo?.senderPn,
  },
  {
    sourcePath: 'message.messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.messageContextInfo?.senderPn,
  },
  {
    sourcePath: 'data.messages[0].messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.messageContextInfo?.senderPn,
  },
  {
    sourcePath: 'messages[0].messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.messageContextInfo?.senderPn,
  },
  {
    sourcePath: 'message.extendedTextMessage.contextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.message?.extendedTextMessage?.contextInfo?.senderPn,
  },
  {
    sourcePath: 'data.message.extendedTextMessage.contextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.message?.extendedTextMessage?.contextInfo?.senderPn,
  },
  {
    sourcePath: 'data.messages[0].message.extendedTextMessage.contextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.senderPn,
  },
  {
    sourcePath: 'messages[0].message.extendedTextMessage.contextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.message?.extendedTextMessage?.contextInfo?.senderPn,
  },
  {
    sourcePath: 'data.message.messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.message?.messageContextInfo?.senderPn,
  },
  {
    sourcePath: 'data.messages[0].message.messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.messageContextInfo?.senderPn,
  },
  {
    sourcePath: 'messages[0].message.messageContextInfo.senderPn',
    candidateType: 'numeric_fallback',
    allowNumericOnly: true,
    getValue: (payload) => payload?.messages?.[0]?.message?.messageContextInfo?.senderPn,
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
    sourcePath: 'data.messages[0].message.key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.message?.key?.remoteJid,
  },
  {
    sourcePath: 'data.messages[0].key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.data?.messages?.[0]?.key?.remoteJid,
  },
  {
    sourcePath: 'messages[0].message.key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.message?.key?.remoteJid,
  },
  {
    sourcePath: 'messages[0].key.remoteJid',
    candidateType: 'direct_jid',
    allowNumericOnly: false,
    getValue: (payload) => payload?.messages?.[0]?.key?.remoteJid,
  },
];

/** Ordem estrita: participantPn → participant JID → author → sender → remoteJid (filtros sobre WEBHOOK_PHONE_EXTRACTION_CANDIDATES). */
const STRICT_PARTICIPANT_PN_CANDIDATES = WEBHOOK_PHONE_EXTRACTION_CANDIDATES.filter((c) =>
  String(c.sourcePath).includes('participantPn')
);

const STRICT_PARTICIPANT_JID_CANDIDATES = WEBHOOK_PHONE_EXTRACTION_CANDIDATES.filter(
  (c) => c.candidateType === 'participant_jid'
);

const STRICT_AUTHOR_CANDIDATES = [
  { sourcePath: 'author', getValue: (p) => p?.author },
  { sourcePath: 'data.author', getValue: (p) => p?.data?.author },
  { sourcePath: 'message.author', getValue: (p) => p?.message?.author },
  { sourcePath: 'data.messages[0].author', getValue: (p) => p?.data?.messages?.[0]?.author },
  { sourcePath: 'messages[0].author', getValue: (p) => p?.messages?.[0]?.author },
  { sourcePath: 'data.messages[0].message.author', getValue: (p) => p?.data?.messages?.[0]?.message?.author },
  { sourcePath: 'messages[0].message.author', getValue: (p) => p?.messages?.[0]?.message?.author },
  { sourcePath: 'key.author', getValue: (p) => p?.key?.author },
  { sourcePath: 'data.key.author', getValue: (p) => p?.data?.key?.author },
  { sourcePath: 'message.key.author', getValue: (p) => p?.message?.key?.author },
  { sourcePath: 'data.messages[0].key.author', getValue: (p) => p?.data?.messages?.[0]?.key?.author },
  { sourcePath: 'messages[0].key.author', getValue: (p) => p?.messages?.[0]?.key?.author },
];

const STRICT_SENDER_CANDIDATES = [
  ...WEBHOOK_PHONE_EXTRACTION_CANDIDATES.filter((c) => c.candidateType === 'sender_jid'),
  ...WEBHOOK_PHONE_EXTRACTION_CANDIDATES.filter(
    (c) => c.candidateType === 'numeric_fallback' && String(c.sourcePath).includes('senderPn')
  ),
];

const pruneLidCache = () => {
  if (LID_TO_PHONE_CACHE.size <= LID_CACHE_MAX_ENTRIES) return;
  const overflow = LID_TO_PHONE_CACHE.size - LID_CACHE_MAX_ENTRIES;
  let removed = 0;
  for (const key of LID_TO_PHONE_CACHE.keys()) {
    LID_TO_PHONE_CACHE.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
};

const cacheLidToPhone = (lidJid, phone) => {
  if (
    typeof lidJid !== 'string' ||
    !lidJid.trim().toLowerCase().endsWith('@lid') ||
    !isValidWhatsAppNumber(phone)
  ) return;
  LID_TO_PHONE_CACHE.set(lidJid.trim(), normalizeWhatsAppNumber(phone));
  pruneLidCache();
};

const getPhoneFromLidCache = (lidJid) => {
  if (typeof lidJid !== 'string') return null;
  return LID_TO_PHONE_CACHE.get(lidJid.trim()) || null;
};

const extractWebhookRemoteJidCandidate = (payload = {}) => {
  for (const candidate of WEBHOOK_REMOTE_JID_CANDIDATES) {
    const value = candidate.getValue(payload);
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
};

const getFirstStringCandidate = (payload = {}, resolvers = []) => {
  for (const resolver of resolvers) {
    const value = resolver(payload);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const normalizeWebhookBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const normalizeIncomingEventName = (value) =>
  String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

const extractIncomingEventName = (payload = {}, options = {}) => {
  const forcedEvent = normalizeIncomingEventName(options?.eventName || '');
  if (forcedEvent) return forcedEvent;
  return normalizeIncomingEventName(
    payload?.event || payload?.type || payload?.data?.event || payload?.data?.type ||
    payload?.message?.event || payload?.message?.type ||
    payload?.data?.messages?.[0]?.event || payload?.data?.messages?.[0]?.type ||
    payload?.messages?.[0]?.event || payload?.messages?.[0]?.type || ''
  );
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
  if (directText) return directText;
  for (const resolver of WEBHOOK_TEXT_CANDIDATES) {
    const value = resolver(payload);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const resolveIncomingConversationKind = (remoteJidOriginal) => {
  if (typeof remoteJidOriginal !== 'string' || !remoteJidOriginal.trim()) return 'unknown';
  const normalized = remoteJidOriginal.trim().toLowerCase();
  if (normalized === 'status@broadcast' || normalized.endsWith('@broadcast')) return 'broadcast';
  if (normalized.endsWith('@newsletter')) return 'newsletter';
  if (normalized.endsWith('@g.us')) return 'group';
  if (normalized.endsWith('@lid')) return 'lid';
  if (normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@c.us')) return 'direct';
  return 'unknown';
};

const hasBlockedSendJidSuffix = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'status@broadcast') return true;
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
  ) return null;
  let withoutJid = raw.includes('@') ? raw.split('@')[0] : raw;
  withoutJid = withoutJid.replace(/^\++/, '');
  let digits = withoutJid.replace(/\D/g, '');
  digits = digits.replace(/^0+/, '') || '';
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
    digits = `55${digits}`;
  }
  if (!digits || digits.length < MIN_WHATSAPP_DIGITS || digits.length > MAX_WHATSAPP_DIGITS) return null;
  return digits;
};

export const normalizeWhatsAppNumber = (value) => normalizePhone(value);

/** Variantes BR móvel (com/sem 9 após DDD) só para comparação de identidade / anti–auto-resposta. */
const expandBrazilMobileVariants = (digits) => {
  const out = new Set();
  if (!digits || typeof digits !== 'string') return [];
  out.add(digits);
  if (!digits.startsWith('55') || digits.length < 12) return [...out];
  const national = digits.slice(2);
  if (national.length === 11 && national.charAt(2) === '9') {
    out.add(`55${national.slice(0, 2)}${national.slice(3)}`);
  }
  if (national.length === 10 && national.charAt(2) !== '9') {
    out.add(`55${national.slice(0, 2)}9${national.slice(2)}`);
  }
  return [...out];
};

/**
 * Bloqueio final de auto-resposta: só true se connectedNumber existir (fail-open se null).
 * Comparação sempre em dígitos normalizados + variantes BR.
 */
export const isSelfMessage = ({ authorPhone, connectedNumber } = {}) => {
  if (connectedNumber === null || connectedNumber === undefined) return false;
  if (String(connectedNumber).trim() === '') return false;
  const normalizedConnected = normalizePhone(connectedNumber);
  if (!normalizedConnected) return false;
  const normalizedAuthor = normalizePhone(authorPhone);
  if (!normalizedAuthor) return false;
  const connectedKeys = new Set(expandBrazilMobileVariants(normalizedConnected));
  for (const a of expandBrazilMobileVariants(normalizedAuthor)) {
    if (connectedKeys.has(a)) return true;
  }
  return false;
};

export const normalizePhoneForSend = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (hasBlockedSendJidSuffix(raw)) return null;

  const lowered = raw.toLowerCase();

  // Bug 3: @lid nunca é destino de envio válido — Evolution API rejeita ou cria loop
  if (lowered.endsWith('@lid')) {
    return null;
  }

  let candidate = raw;
  if (lowered.endsWith('@s.whatsapp.net')) {
    candidate = raw.slice(0, -'@s.whatsapp.net'.length);
  } else if (lowered.endsWith('@c.us')) {
    candidate = raw.slice(0, -'@c.us'.length);
  } else if (raw.includes('@')) {
    candidate = raw.split('@')[0];
  }

  const normalized = normalizePhone(candidate);
  if (!normalized || !isValidPhone(normalized)) return null;
  return normalized;
};

export const resolveReplyDestination = ({ phone } = {}) => {
  const normalizedPhone = normalizePhoneForSend(phone);
  if (!normalizedPhone) return null;
  // REGRA ABSOLUTA: destino é SEMPRE digits-only, NUNCA JID (@lid/@s.whatsapp.net/etc)
  if (normalizedPhone.includes('@')) return null;
  if (!isValidPhone(normalizedPhone)) return null;
  return normalizedPhone;
};

const hasTrustedLidAuthorSource = (sourcePath = '') => {
  if (typeof sourcePath !== 'string') return false;
  const normalized = sourcePath.trim();
  if (!normalized) return false;
  return (
    normalized.includes('participant') ||
    INCOMING_AUTHOR_LID_FROM_FALLBACK_SOURCE_PATHS.has(normalized) ||
    INCOMING_AUTHOR_LID_METADATA_SOURCE_PATHS.has(normalized) ||
    normalized === 'lid_cache' ||
    normalized === 'lid_sender_fallback'
  );
};

export const resolveSafeReplyDestination = ({
  phone,
  fromMe = undefined,
  remoteJidOriginal = null,
  connectedNumber = null,
  knownInstanceNumbers = [] as string[],
  extraction = null,
  allowLidDestination = false,
}: {
  phone?: string | null;
  fromMe?: unknown;
  remoteJidOriginal?: string | null;
  connectedNumber?: string | null;
  knownInstanceNumbers?: string[];
  extraction?: { rejections?: unknown[]; sourcePath?: string; confidence?: string; [key: string]: unknown } | null;
  allowLidDestination?: boolean;
} = {}) => {
  if (normalizeWebhookBoolean(fromMe)) {
    return { ok: false, destination: null, reason: 'from_me', conversationKind: resolveIncomingConversationKind(remoteJidOriginal) };
  }
  // fromMe===false = Evolution API explicitly confirmed NOT from bot — skip phone-based self-target
  const fromMeExplicitlyFalse = fromMe === false;

  const conversationKind = resolveIncomingConversationKind(remoteJidOriginal);

  if (conversationKind === 'group' || conversationKind === 'broadcast' || conversationKind === 'newsletter') {
    return { ok: false, destination: null, reason: 'blocked_conversation', conversationKind };
  }

  if (Array.isArray(extraction?.rejections)) {
    const hasAmbiguousRejection = extraction.rejections.some(
      (item) => item?.reason === 'ambiguous_author_candidates'
    );
    if (hasAmbiguousRejection) {
      return { ok: false, destination: null, reason: 'ambiguous_phone', conversationKind };
    }
  }

  if (conversationKind === 'lid') {
    const sourcePath = extraction?.sourcePath || '';
    const isLidFallback =
      extraction?.confidence === 'lid_fallback' ||
      extraction?.resolutionRule === 'lid_sender_fallback_promoted' ||
      extraction?.resolutionRule === 'lid_from_fallback_promoted';
    const lidTrustedByExtraction =
      isLidFallback ||
      (extraction?.confidence !== 'none' && hasTrustedLidAuthorSource(sourcePath));
    const lidTrustedByContext = allowLidDestination === true;

    if (!lidTrustedByExtraction && !lidTrustedByContext) {
      return { ok: false, destination: null, reason: 'ambiguous_phone', conversationKind };
    }
  }

  const destination = resolveReplyDestination({ phone });

  if (!destination) {
    return { ok: false, destination: null, reason: 'invalid_destination', conversationKind };
  }

  const instanceNumbers = new Set();
  const normalizedConnectedNumber = normalizeWhatsAppNumber(connectedNumber);
  if (normalizedConnectedNumber) instanceNumbers.add(normalizedConnectedNumber);
  for (const value of knownInstanceNumbers) {
    const normalized = normalizeWhatsAppNumber(value);
    if (normalized) instanceNumbers.add(normalized);
  }

  if (!fromMeExplicitlyFalse && normalizedConnectedNumber && isSelfMessage({ authorPhone: destination, connectedNumber: normalizedConnectedNumber })) {
    return { ok: false, destination, reason: 'connected_number_match', conversationKind };
  }

  if (!fromMeExplicitlyFalse) {
    for (const inst of instanceNumbers) {
      if (isSelfMessage({ authorPhone: destination, connectedNumber: inst })) {
        return { ok: false, destination, reason: 'self_target', conversationKind };
      }
    }
  }

  return { ok: true, destination, reason: null, conversationKind };
};

export const extractWhatsAppRemoteJidFromWebhook = (payload = {}) => {
  const remoteJid = extractWebhookRemoteJidCandidate(payload);
  if (!remoteJid) return null;
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
  if (typeof value !== 'string') return { phone: null, reason: 'non_string' };
  const candidate = value.trim();
  if (!candidate) return { phone: null, reason: 'empty' };
  if (hasBlockedWebhookJidSuffix(candidate)) return { phone: null, reason: 'blocked_jid_suffix' };
  const isJid = candidate.includes('@');
  const normalized = candidate.toLowerCase();
  if (normalized.endsWith('@lid')) return { phone: null, reason: 'lid_not_safe_for_author' };
  if (isJid && !hasDirectWhatsAppJidSuffix(candidate)) return { phone: null, reason: 'unsupported_jid_suffix' };
  if (!isJid && !allowNumericOnly) return { phone: null, reason: 'numeric_not_allowed' };
  const phone = candidate.split('@')[0].replace(/\D/g, '');
  if (phone.length < MIN_WHATSAPP_DIGITS || phone.length > MAX_WHATSAPP_DIGITS) return { phone: null, reason: 'invalid_digits_length' };
  return { phone, reason: null };
};

const classifyAuthorCandidateRole = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return 'unknown';
  if (candidate.candidateType === 'direct_jid') return 'remote_jid';
  if (candidate.candidateType === 'participant_jid') return 'participant_jid';
  if (candidate.candidateType === 'sender_jid') return 'sender_jid';
  if (candidate.candidateType === 'numeric_fallback') {
    return candidate.sourcePath.includes('participant') ? 'participant_numeric' : 'sender_numeric';
  }
  return 'unknown';
};

const getBaseAuthorScore = (conversationKind, authorRole) => {
  const byConversation = {
    direct: { remote_jid: 95, participant_jid: 86, participant_numeric: 78, sender_numeric: 72, sender_jid: 65 },
    lid: { participant_jid: 95, participant_numeric: 90, sender_numeric: 70, sender_jid: 40, remote_jid: 0 },
    group: { participant_jid: 95, participant_numeric: 86, sender_numeric: 60, sender_jid: 52, remote_jid: 0 },
    unknown: { participant_jid: 86, remote_jid: 80, participant_numeric: 74, sender_numeric: 65, sender_jid: 55 },
  };
  const normalizedKind = byConversation[conversationKind] ? conversationKind : 'unknown';
  return byConversation[normalizedKind][authorRole] ?? 0;
};

const getAuthorSourcePathBoost = (sourcePath = '') => {
  if (sourcePath.startsWith('key.') || sourcePath.startsWith('data.key.')) return 6;
  if (sourcePath.startsWith('message.key.')) return 5;
  if (sourcePath.includes('messages[0].key.')) return 3;
  if (sourcePath === 'sender' || sourcePath === 'data.sender') return 1;
  return 0;
};

const mapScoreToConfidence = (score) => {
  if (score >= INCOMING_AUTHOR_HIGH_CONFIDENCE_MIN) return 'high';
  if (score >= INCOMING_AUTHOR_MEDIUM_CONFIDENCE_MIN) return 'medium';
  if (score >= INCOMING_AUTHOR_MIN_SCORE) return 'low';
  return 'none';
};

const scoreIncomingAuthorCandidate = ({ candidate, phone, remoteJidOriginal, conversationKind }) => {
  const authorRole = classifyAuthorCandidateRole(candidate);
  let score = getBaseAuthorScore(conversationKind, authorRole) + getAuthorSourcePathBoost(candidate.sourcePath);
  const normalizedRemoteJidPhone = normalizeWhatsAppNumber(remoteJidOriginal);
  if (authorRole === 'remote_jid' && normalizedRemoteJidPhone && phone === normalizedRemoteJidPhone) score += 4;
  if ((authorRole === 'sender_jid' || authorRole === 'sender_numeric') && normalizedRemoteJidPhone && phone === normalizedRemoteJidPhone) score += 3;
  if (authorRole === 'participant_jid' || authorRole === 'participant_numeric') score += 2;
  return { score, authorRole, confidence: mapScoreToConfidence(score) };
};

const appendRejection = (rejections, sourcePath, reason) => {
  if (!reason || reason === 'non_string' || reason === 'empty' || rejections.length >= MAX_EXTRACTION_REJECTIONS) return;
  rejections.push({ sourcePath, reason });
};

const findBlockedConversationCandidate = (payload = {}) => {
  for (const candidate of WEBHOOK_REMOTE_JID_CANDIDATES) {
    const value = candidate.getValue(payload);
    if (hasHardBlockedConversationJidSuffix(value)) return { sourcePath: candidate.sourcePath, value };
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
    if (phone) normalized.add(phone);
  }
  return normalized;
};

export const extractWhatsAppInstanceNumbersFromWebhook = (payload = {}, options = {}) => {
  const numbers = normalizeKnownConnectedNumbers(options);
  for (const resolver of WEBHOOK_INSTANCE_NUMBER_CANDIDATES) {
    const value = resolver(payload);
    const normalized = normalizeWhatsAppNumber(value);
    if (normalized) numbers.add(normalized);
  }
  return Array.from(numbers);
};

const resolveWebhookPhoneExtractionCandidates = (_payload = {}) => WEBHOOK_PHONE_EXTRACTION_CANDIDATES;

const maybeCacheLidFromSafeCandidate = ({ remoteJidOriginal, conversationKind, candidate }) => {
  if (conversationKind !== 'lid') return;
  if (!remoteJidOriginal || !remoteJidOriginal.toLowerCase().endsWith('@lid')) return;
  if (!candidate?.phone) return;
  if (!candidate?.authorRole) return;
  const safeRoles = new Set(['participant_jid', 'participant_numeric']);
  if (!safeRoles.has(candidate.authorRole)) return;
  cacheLidToPhone(remoteJidOriginal, candidate.phone);
};

/**
 * Prioridade fixa: participantPn → participant → author → sender → remoteJid.
 * Ignora @lid sem número; ignora candidatos que batem com números da instância ou isSelfMessage.
 */
export const resolveAuthorPhoneStrictPriority = (
  payload = {},
  { instanceNumbersSet = new Set(), connectedNumber = null, conversationKind = 'unknown' } = {},
) => {
  const set = instanceNumbersSet instanceof Set ? instanceNumbersSet : new Set(instanceNumbersSet);
  const normalizedConnectedOption = connectedNumber ? normalizePhone(connectedNumber) : null;

  const acceptCanonical = (trimmed, sourcePath, { allowNumericOnly }) => {
    if (typeof trimmed !== 'string' || !trimmed.trim()) return null;
    const t = trimmed.trim();
    if (t.toLowerCase().endsWith('@lid')) return null;
    const parsed = parseWebhookPhoneCandidate(t, { allowNumericOnly });
    if (!parsed.phone) return null;
    const canonical = normalizePhone(t) || normalizePhone(parsed.phone);
    if (!canonical) return null;
    if (normalizedConnectedOption && isSelfMessage({ authorPhone: canonical, connectedNumber: normalizedConnectedOption })) {
      return null;
    }
    if (set.has(canonical)) return null;
    for (const v of expandBrazilMobileVariants(canonical)) {
      if (set.has(v)) return null;
    }
    return { authorPhone: canonical, sourcePath };
  };

  const scanSenders = () => {
    for (const c of STRICT_SENDER_CANDIDATES) {
      const raw = c.getValue(payload);
      if (typeof raw !== 'string') continue;
      const got = acceptCanonical(raw, c.sourcePath, { allowNumericOnly: c.candidateType === 'numeric_fallback' });
      if (got) return got;
    }
    return null;
  };

  const scanRemoteJids = () => {
    for (const c of WEBHOOK_REMOTE_JID_CANDIDATES) {
      const raw = c.getValue(payload);
      if (typeof raw !== 'string') continue;
      const got = acceptCanonical(raw, c.sourcePath, { allowNumericOnly: false });
      if (got) return got;
    }
    return null;
  };

  for (const c of STRICT_PARTICIPANT_PN_CANDIDATES) {
    const raw = c.getValue(payload);
    if (typeof raw !== 'string') continue;
    const got = acceptCanonical(raw, c.sourcePath, { allowNumericOnly: true });
    if (got) return got;
  }

  for (const c of STRICT_PARTICIPANT_JID_CANDIDATES) {
    const raw = c.getValue(payload);
    if (typeof raw !== 'string') continue;
    const got = acceptCanonical(raw, c.sourcePath, { allowNumericOnly: false });
    if (got) return got;
  }

  for (const c of STRICT_AUTHOR_CANDIDATES) {
    const raw = c.getValue(payload);
    if (typeof raw !== 'string') continue;
    const got = acceptCanonical(raw, c.sourcePath, { allowNumericOnly: false });
    if (got) return got;
  }

  // @lid: nunca promover sender/remoteJid no atalho strict — ranking + lid_sender_fallback tratam metadado frágil.
  if (conversationKind === 'lid') {
    return { authorPhone: null, sourcePath: null };
  }

  // DM direto: remoteJid costuma ser o interlocutor; sender pode ser metadado incorreto.
  if (conversationKind === 'direct') {
    const fromRemote = scanRemoteJids();
    if (fromRemote) return fromRemote;
    const fromSender = scanSenders();
    if (fromSender) return fromSender;
  } else {
    const fromSender = scanSenders();
    if (fromSender) return fromSender;
    const fromRemote = scanRemoteJids();
    if (fromRemote) return fromRemote;
  }

  return { authorPhone: null, sourcePath: null };
};

const mapStrictPriorityCandidateType = (sourcePath = '') => {
  const sp = String(sourcePath);
  if (sp.includes('participantPn')) return 'numeric_fallback';
  if (sp.includes('senderPn')) return 'numeric_fallback';
  if (sp.includes('participant')) return 'participant_jid';
  if (sp.includes('remoteJid')) return 'direct_jid';
  return 'sender_jid';
};

/**
 * Identidades numéricas da instância no payload Evolution (sem HTTP).
 * NOTA: destination foi removido — Evolution API v1 messages-upsert coloca o JID do
 * cliente remoto nesse campo (não o número da instância). Usar destination causava
 * false-positive em isSelfMessage quando authorPhone e identityForSelfCheck eram ambos
 * derivados do mesmo JID do cliente. Fontes corretas: instance.wid/owner/phone/number.
 */
const PAYLOAD_INSTANCE_IDENTITY_SOURCES = [
  (p) => p?.instance?.wid,
  (p) => p?.instance?.ownerJid,
  (p) => p?.instance?.owner,
  (p) => p?.instance?.phone,
  (p) => p?.instance?.number,
  (p) => p?.instance?.id,
  (p) => p?.data?.instance?.wid,
  (p) => p?.data?.instance?.ownerJid,
  (p) => p?.data?.instance?.owner,
  (p) => p?.data?.instance?.phone,
  (p) => p?.data?.instance?.number,
  (p) => p?.data?.instance?.id,
];

const mergePayloadInstanceIdentityPhonesIntoSet = (payload, targetSet) => {
  if (!(targetSet instanceof Set)) return;
  for (const get of PAYLOAD_INSTANCE_IDENTITY_SOURCES) {
    const n = normalizePhone(get(payload));
    if (n) targetSet.add(n);
  }
};

/** Primeiro telefone de instância encontrado no payload (webhook Evolution). */
export const extractPayloadDestination = (payload = {}) => {
  for (const get of PAYLOAD_INSTANCE_IDENTITY_SOURCES) {
    const n = normalizePhone(get(payload));
    if (n) return n;
  }
  return null;
};

const rawSenderEqualsRawDestination = (payload, senderRaw) => {
  const s = typeof senderRaw === 'string' ? senderRaw.trim().toLowerCase() : '';
  if (!s) return false;
  const d1 = typeof payload?.destination === 'string' ? payload.destination.trim().toLowerCase() : '';
  const d2 =
    typeof payload?.data?.destination === 'string' ? payload.data.destination.trim().toLowerCase() : '';
  return (Boolean(d1) && d1 === s) || (Boolean(d2) && d2 === s);
};

const phoneMatchesPayloadInstanceIdentity = (payload, phoneCanon) => {
  if (!phoneCanon) return false;
  const tmp = new Set();
  mergePayloadInstanceIdentityPhonesIntoSet(payload, tmp);
  for (const inst of tmp) {
    if (isSelfMessage({ authorPhone: phoneCanon, connectedNumber: inst })) return true;
  }
  return false;
};

const senderMatchesPayloadInstanceIdentity = (payload, senderCanon, senderRaw) => {
  if (!senderCanon) return false;
  if (typeof senderRaw === 'string' && rawSenderEqualsRawDestination(payload, senderRaw)) return true;
  return phoneMatchesPayloadInstanceIdentity(payload, senderCanon);
};

export const resolveIncomingAuthor = (payload = {}, options = {}) => {
  const instanceNumbers = extractWhatsAppInstanceNumbersFromWebhook(payload, options);
  const instanceNumbersSet = new Set(instanceNumbers);

  // FIX: incluir payload.destination no conjunto de números da instância.
  // A Evolution API sempre envia o número conectado nesse campo,
  // independente do status de sincronização do connectedNumber em memória.
  mergePayloadInstanceIdentityPhonesIntoSet(payload, instanceNumbersSet);

  const rejections = [];
  const blockedConversation = findBlockedConversationCandidate(payload);
  const remoteJidOriginal = extractWhatsAppRemoteJidFromWebhook(payload);
  const conversationKind = resolveIncomingConversationKind(remoteJidOriginal);
  const eventName = extractIncomingEventName(payload, options);
  const fromMe = extractWebhookFromMe(payload);
  const sender = extractWebhookSenderCandidate(payload);
  const participant = extractWebhookParticipantCandidate(payload);
  const pushName = extractWebhookPushNameCandidate(payload);
  const incomingText = extractIncomingTextCandidate(payload, options);
  const allowLidSenderFallback =
    conversationKind === 'lid' &&
    LID_SENDER_FALLBACK_EVENTS.has(eventName) &&
    instanceNumbersSet.size > 0 &&
    !fromMe &&
    Boolean(incomingText);
  const candidates = resolveWebhookPhoneExtractionCandidates(payload);

  const serializeCandidates = () =>
    matchedCandidates
      .slice()
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ index: _index, ...candidate }) => candidate);

  if (fromMe) {
    appendRejection(rejections, 'fromMe', 'self_message');
    return {
      authorPhone: null, sourcePath: null, candidateType: null, confidence: 'none',
      resolutionRule: null, remoteJidOriginal, sender, participant, pushName, fromMe,
      instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: [],
    };
  }

  if (blockedConversation) {
    appendRejection(rejections, blockedConversation.sourcePath, 'blocked_conversation_jid');
    return {
      authorPhone: null, sourcePath: null, candidateType: null, confidence: 'none',
      resolutionRule: null, remoteJidOriginal, sender, participant, pushName, fromMe,
      instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: [],
    };
  }

  if (conversationKind === 'broadcast' || conversationKind === 'newsletter') {
    appendRejection(rejections, 'key.remoteJid', 'blocked_conversation_jid');
    return {
      authorPhone: null, sourcePath: null, candidateType: null, confidence: 'none',
      resolutionRule: null, remoteJidOriginal, sender, participant, pushName, fromMe,
      instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: [],
    };
  }

  const primaryConnected =
    (Array.isArray(options?.connectedNumbers) && options.connectedNumbers[0]) ||
    options?.connectedNumber ||
    null;
  const strictAuthor = resolveAuthorPhoneStrictPriority(payload, {
    instanceNumbersSet,
    connectedNumber: primaryConnected,
    conversationKind,
  });
  if (strictAuthor.authorPhone) {
    if (strictAuthor.sourcePath.includes('participant')) {
      maybeCacheLidFromSafeCandidate({
        remoteJidOriginal,
        conversationKind,
        candidate: { phone: strictAuthor.authorPhone, authorRole: 'participant_jid' },
      });
    }
    const inferredType = mapStrictPriorityCandidateType(strictAuthor.sourcePath);
    return {
      authorPhone: strictAuthor.authorPhone,
      sourcePath: strictAuthor.sourcePath,
      candidateType: inferredType,
      confidence: inferredType === 'sender_jid' ? 'medium' : 'high',
      resolutionRule: 'strict_priority',
      remoteJidOriginal,
      sender,
      participant,
      pushName,
      fromMe,
      instanceNumbers: Array.from(instanceNumbersSet),
      rejections,
      candidates: [
        {
          sourcePath: strictAuthor.sourcePath,
          candidateType: inferredType,
          rawValue: strictAuthor.authorPhone,
          phone: strictAuthor.authorPhone,
          score: 100,
          confidence: inferredType === 'sender_jid' ? 'medium' : 'high',
          authorRole: inferredType === 'participant_jid' || inferredType === 'numeric_fallback'
            ? 'participant_jid'
            : 'sender_jid',
          rejectedReason: null,
          index: -1,
        },
      ],
    };
  }

  const matchedCandidates = [];

  const instanceNumberMatches = (canonical) => {
    if (!canonical) return false;
    for (const key of expandBrazilMobileVariants(canonical)) {
      if (instanceNumbersSet.has(key)) return true;
    }
    return false;
  };

  for (const [index, candidate] of candidates.entries()) {
    const value = candidate.getValue(payload);
    const parsed = parseWebhookPhoneCandidate(value, { allowNumericOnly: candidate.allowNumericOnly });

    if (!parsed.phone) {
      appendRejection(rejections, candidate.sourcePath, parsed.reason);
      if (typeof value === 'string' && value.trim()) {
        matchedCandidates.push({
          sourcePath: candidate.sourcePath, candidateType: candidate.candidateType,
          rawValue: value.trim(), phone: null, score: 0, confidence: 'none',
          rejectedReason: parsed.reason, index,
        });
      }
      continue;
    }

    const trimmedValue = typeof value === 'string' ? value.trim() : '';
    const canonicalPhone = normalizePhone(trimmedValue) || normalizePhone(parsed.phone);
    if (!canonicalPhone) {
      appendRejection(rejections, candidate.sourcePath, 'invalid_digits_length');
      continue;
    }

    if (instanceNumberMatches(canonicalPhone)) {
      appendRejection(rejections, candidate.sourcePath, 'instance_number');
      matchedCandidates.push({
        sourcePath: candidate.sourcePath, candidateType: candidate.candidateType,
        rawValue: typeof value === 'string' ? value.trim() : value,
        phone: canonicalPhone, score: 0, confidence: 'none',
        rejectedReason: 'instance_number', index,
      });
      continue;
    }

    const scoredCandidate = scoreIncomingAuthorCandidate({ candidate, phone: canonicalPhone, remoteJidOriginal, conversationKind });
    let adjustedScore = scoredCandidate.score;
    let adjustedConfidence = scoredCandidate.confidence;
    let rejectedReason = null;

    const isSenderFallbackPath = INCOMING_AUTHOR_SENDER_FALLBACK_SOURCE_PATHS.has(candidate.sourcePath);
    const isLidConversation = conversationKind === 'lid';
    const isSenderLikeCandidate = scoredCandidate.authorRole === 'sender_jid' || scoredCandidate.authorRole === 'sender_numeric';

    if (isLidConversation && isSenderLikeCandidate && isSenderFallbackPath && !allowLidSenderFallback) {
      adjustedScore = 0;
      adjustedConfidence = 'none';
      rejectedReason = 'lid_sender_untrusted';
      appendRejection(rejections, candidate.sourcePath, rejectedReason);
    }

    if (!rejectedReason && isSenderFallbackPath && instanceNumberMatches(canonicalPhone)) {
      adjustedScore = 0;
      adjustedConfidence = 'none';
      rejectedReason = 'sender_matches_connected_instance';
      appendRejection(rejections, candidate.sourcePath, rejectedReason);
    }

    matchedCandidates.push({
      sourcePath: candidate.sourcePath, candidateType: candidate.candidateType,
      rawValue: typeof value === 'string' ? value.trim() : value,
      phone: canonicalPhone, score: adjustedScore, confidence: adjustedConfidence,
      authorRole: scoredCandidate.authorRole, rejectedReason, index,
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
  const lidFromFallbackCandidate =
    conversationKind === 'lid' && normalizedSenderPhone
      ? rankedCandidates.find(
          (candidate) =>
            INCOMING_AUTHOR_LID_FROM_FALLBACK_SOURCE_PATHS.has(candidate.sourcePath) &&
            candidate.phone !== normalizedSenderPhone
        ) || null
      : null;
  const cachedPhone =
    conversationKind === 'lid' && remoteJidOriginal ? getPhoneFromLidCache(remoteJidOriginal) : null;
  const hasAnyExplicitAuthorSignal = matchedCandidates.some((candidate) => Boolean(candidate.phone));
  const hasExplicitAuthorSignal = matchedCandidates.some(
    (candidate) =>
      Boolean(candidate.phone) &&
      !['instance_number', 'sender_matches_connected_instance'].includes(candidate.rejectedReason)
  );

  if (!bestCandidate) {
    if (cachedPhone && !instanceNumberMatches(cachedPhone) && !hasAnyExplicitAuthorSignal) {
      return {
        authorPhone: cachedPhone, sourcePath: 'lid_cache', candidateType: 'lid_cached_phone',
        confidence: 'medium', resolutionRule: 'lid_cache', remoteJidOriginal, sender, participant,
        pushName, fromMe, instanceNumbers: Array.from(instanceNumbersSet), rejections,
        candidates: [
          ...serializeCandidates(),
          { sourcePath: 'lid_cache', candidateType: 'lid_cached_phone', rawValue: remoteJidOriginal,
            phone: cachedPhone, score: 70, confidence: 'medium', authorRole: 'cached_lid_phone', rejectedReason: null },
        ],
      };
    }

    // ── LID sender fallback ─────────────────────────────────────────────
    // FIX BUG SELF-REPLY: antes de aceitar o sender como autor, verificar
    // se ele coincide com o número da instância via instanceNumbersSet
    // (que agora inclui payload.destination). Sem esse check, o número
    // do próprio bot era aceito como "cliente" quando connectedNumber=null.
    if (
      conversationKind === 'lid' &&
      !fromMe &&
      typeof sender === 'string' &&
      sender.trim().toLowerCase().endsWith('@s.whatsapp.net')
    ) {
      const senderDigits = sender.split('@')[0].replace(/\D/g, '');
      const senderCanon = normalizePhone(sender.trim()) || normalizePhone(senderDigits);

      if (
        senderCanon &&
        !instanceNumberMatches(senderCanon) &&
        !senderMatchesPayloadInstanceIdentity(payload, senderCanon, sender)
      ) {
        if (remoteJidOriginal) cacheLidToPhone(remoteJidOriginal, senderCanon);
        return {
          authorPhone: senderCanon, sourcePath: 'lid_sender_fallback', candidateType: 'sender_jid',
          confidence: 'lid_fallback', resolutionRule: 'lid_sender_fallback', remoteJidOriginal,
          sender, participant, pushName, fromMe, instanceNumbers: Array.from(instanceNumbersSet),
          rejections,
          candidates: [
            ...serializeCandidates(),
            { sourcePath: 'lid_sender_fallback', candidateType: 'sender_jid', rawValue: sender,
              phone: senderCanon, score: 65, confidence: 'lid_fallback',
              authorRole: 'lid_sender_fallback', rejectedReason: null },
          ],
        };
      }

      // sender coincide com instância — bloquear e retornar null
      appendRejection(rejections, 'lid_sender_fallback', 'sender_matches_instance_destination');
    }
    // ── fim LID sender fallback ─────────────────────────────────────────

    if (hasExplicitAuthorSignal) appendRejection(rejections, 'author_candidates', 'low_confidence_author');

    return {
      authorPhone: null, sourcePath: null, candidateType: null, confidence: 'none',
      resolutionRule: null, remoteJidOriginal, sender, participant, pushName, fromMe,
      instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: serializeCandidates(),
    };
  }

  if (
    secondCandidate &&
    secondCandidate.score === bestCandidate.score &&
    secondCandidate.phone !== bestCandidate.phone
  ) {
    appendRejection(rejections, bestCandidate.sourcePath, 'ambiguous_author_candidates');
    return {
      authorPhone: null, sourcePath: null, candidateType: null, confidence: 'none',
      resolutionRule: null, remoteJidOriginal, sender, participant, pushName, fromMe,
      instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: serializeCandidates(),
    };
  }

  if (
    conversationKind === 'lid' &&
    bestCandidate &&
    !allowLidSenderFallback &&
    INCOMING_AUTHOR_SENDER_FALLBACK_SOURCE_PATHS.has(bestCandidate.sourcePath)
  ) {
    if (
      !fromMe &&
      typeof sender === 'string' &&
      sender.trim().toLowerCase().endsWith('@s.whatsapp.net')
    ) {
      const lidFallbackDigits = sender.split('@')[0].replace(/\D/g, '');
      const lidFallbackCanon = normalizePhone(sender.trim()) || normalizePhone(lidFallbackDigits);
      if (
        lidFallbackCanon &&
        !instanceNumberMatches(lidFallbackCanon) &&
        !senderMatchesPayloadInstanceIdentity(payload, lidFallbackCanon, sender)
      ) {
        if (remoteJidOriginal) cacheLidToPhone(remoteJidOriginal, lidFallbackCanon);
        return {
          authorPhone: lidFallbackCanon, sourcePath: 'lid_sender_fallback', candidateType: 'sender_jid',
          confidence: 'lid_fallback', resolutionRule: 'lid_sender_fallback', remoteJidOriginal,
          sender, participant, pushName, fromMe, instanceNumbers: Array.from(instanceNumbersSet),
          rejections, candidates: serializeCandidates(),
        };
      }
    }

    appendRejection(rejections, bestCandidate.sourcePath, 'lid_sender_untrusted');
    return {
      authorPhone: null, sourcePath: null, candidateType: null, confidence: 'none',
      resolutionRule: null, remoteJidOriginal, sender, participant, pushName, fromMe,
      instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: serializeCandidates(),
    };
  }

  if (bestCandidate.score < INCOMING_AUTHOR_MIN_SCORE) {
    const hasBetterCandidateThanSender = senderFallbackCandidate
      ? rankedCandidates.some((c) => c.phone !== senderFallbackCandidate.phone && c.score > senderFallbackCandidate.score)
      : false;
    const hasBetterCandidateThanLidFrom = lidFromFallbackCandidate
      ? rankedCandidates.some((c) => c.phone !== lidFromFallbackCandidate.phone && c.score > lidFromFallbackCandidate.score)
      : false;
    const canPromoteSenderFallback = conversationKind !== 'lid' || allowLidSenderFallback;
    const shouldPromoteLidFromFallback =
      conversationKind === 'lid' && LID_SENDER_FALLBACK_EVENTS.has(eventName) && !fromMe &&
      Boolean(incomingText) && lidFromFallbackCandidate && !hasBetterCandidateThanLidFrom &&
      !instanceNumberMatches(lidFromFallbackCandidate.phone) &&
      !phoneMatchesPayloadInstanceIdentity(payload, lidFromFallbackCandidate.phone);
    const shouldPromoteSenderFallback =
      !fromMe && Boolean(incomingText) && senderFallbackCandidate && !hasBetterCandidateThanSender &&
      canPromoteSenderFallback &&
      !instanceNumberMatches(senderFallbackCandidate.phone) &&
      !phoneMatchesPayloadInstanceIdentity(payload, senderFallbackCandidate.phone);

    if (shouldPromoteLidFromFallback) {
      maybeCacheLidFromSafeCandidate({ remoteJidOriginal, conversationKind, candidate: lidFromFallbackCandidate });
      return {
        authorPhone: lidFromFallbackCandidate.phone, sourcePath: lidFromFallbackCandidate.sourcePath,
        candidateType: lidFromFallbackCandidate.candidateType,
        confidence: lidFromFallbackCandidate.confidence === 'none' ? 'low' : lidFromFallbackCandidate.confidence,
        resolutionRule: 'lid_from_fallback_promoted', remoteJidOriginal, sender, participant, pushName,
        fromMe, instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: serializeCandidates(),
      };
    }

    if (shouldPromoteSenderFallback) {
      maybeCacheLidFromSafeCandidate({ remoteJidOriginal, conversationKind, candidate: senderFallbackCandidate });
      return {
        authorPhone: senderFallbackCandidate.phone, sourcePath: senderFallbackCandidate.sourcePath,
        candidateType: senderFallbackCandidate.candidateType,
        confidence: senderFallbackCandidate.confidence === 'none' ? 'low' : senderFallbackCandidate.confidence,
        resolutionRule: conversationKind === 'lid' ? 'lid_sender_fallback_promoted' : 'sender_fallback_promoted',
        remoteJidOriginal, sender, participant, pushName, fromMe,
        instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: serializeCandidates(),
      };
    }

    appendRejection(rejections, bestCandidate.sourcePath, 'low_confidence_author');
    return {
      authorPhone: null, sourcePath: null, candidateType: null, confidence: 'none',
      resolutionRule: null, remoteJidOriginal, sender, participant, pushName, fromMe,
      instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: serializeCandidates(),
    };
  }

  maybeCacheLidFromSafeCandidate({ remoteJidOriginal, conversationKind, candidate: bestCandidate });

  return {
    authorPhone: bestCandidate.phone, sourcePath: bestCandidate.sourcePath,
    candidateType: bestCandidate.candidateType, confidence: bestCandidate.confidence,
    resolutionRule: 'candidate_ranked_best', remoteJidOriginal, sender, participant, pushName,
    fromMe, instanceNumbers: Array.from(instanceNumbersSet), rejections, candidates: serializeCandidates(),
  };
};

export const extractWhatsAppPhoneFromWebhookDetailed = (payload = {}, options = {}) => {
  const authorResolution = resolveIncomingAuthor(payload, options);
  return {
    phone: authorResolution.authorPhone,
    sourcePath: authorResolution.sourcePath,
    candidateType: authorResolution.candidateType,
    confidence: authorResolution.confidence,
    resolutionRule: authorResolution.resolutionRule,
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

export const extractSenderPhoneFromWebhook = (payload = {}, options = {}) =>
  extractWhatsAppPhoneFromWebhook(payload, options);

export const isValidWhatsAppNumber = (value) => normalizeWhatsAppNumber(value) !== null;