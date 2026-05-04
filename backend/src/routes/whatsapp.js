import crypto from 'crypto';
import express from 'express';
import { handleIncomingMessage, sendWhatsAppMessage } from '../services/whatsapp/index.js';
import {
  getWhatsAppStatus,
  getWhatsAppStatusByInstance,
  getConnectedNumberCached,
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppQrCode,
  sendWhatsAppText,
  refreshWhatsAppStatus,
  logoutWhatsApp,
  restartWhatsApp,
  initializeWhatsAppInstance,
} from '../services/whatsappClient.js';
import { getBarbershopWhatsAppInstanceContext } from '../services/whatsapp/whatsappInstanceService.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import pool from '../config/database.js';
import { sendSuccess, sendCreated, sendError } from '../utils/response.js';
import logger from '../utils/logger.js';
import {
  normalizeWhatsAppNumber,
  normalizePhone,
  isSelfMessage,
  extractPayloadDestination,
  extractWhatsAppRemoteJidFromWebhook,
  resolveIncomingAuthor,
} from '../utils/whatsapp.js';

const router = express.Router();
const waProtected = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

const buildDisconnectedStatusPayload = (instanceName = null) => ({
  status: 'disconnected',
  qrCode: null,
  error: null,
  connectedNumber: null,
  connectedName: null,
  provider: 'evolution',
  ...(instanceName ? { instanceName } : {}),
});

const resolveAuthenticatedWhatsAppContext = async (req) => {
  const barbershopId = req.user?.barbershopId || null;

  if (!barbershopId) {
    return {
      barbershopId: null,
      instanceName: null,
    };
  }

  const context = await getBarbershopWhatsAppInstanceContext(barbershopId);

  return {
    barbershopId,
    instanceName: context.whatsappInstanceName || null,
  };
};

const normalizeSimulatorBarbershopId = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const resolveSimulatorBarbershopContext = async ({ payloadBarbershopId, authBarbershopId }) => {
  if (!payloadBarbershopId && !authBarbershopId) {
    return {
      ok: false,
      statusCode: 400,
      code: 'WHATSAPP_SIMULATOR_BARBERSHOP_REQUIRED',
      message: 'Campo barbershopId e obrigatorio no simulador quando o contexto autenticado nao estiver disponivel',
      reason: 'missing_barbershop_context',
      source: null,
    };
  }

  if (!authBarbershopId) {
    return {
      ok: false,
      statusCode: 400,
      code: 'WHATSAPP_SIMULATOR_AUTH_CONTEXT_MISSING',
      message: 'Contexto autenticado sem barbershopId. Faca login novamente para usar o simulador.',
      reason: 'missing_auth_barbershop_context',
      source: null,
    };
  }

  if (payloadBarbershopId && payloadBarbershopId !== authBarbershopId) {
    return {
      ok: false,
      statusCode: 403,
      code: 'WHATSAPP_SIMULATOR_BARBERSHOP_FORBIDDEN',
      message: 'barbershopId do payload nao corresponde ao tenant autenticado',
      reason: 'payload_auth_mismatch',
      source: 'payload',
    };
  }

  const resolvedBarbershopId = payloadBarbershopId || authBarbershopId;
  const contextSource = payloadBarbershopId ? 'payload' : 'auth';

  try {
    const result = await pool.query(
      'SELECT id FROM barbershops WHERE id = $1 LIMIT 1',
      [resolvedBarbershopId]
    );

    if (!result.rows.length) {
      return {
        ok: false,
        statusCode: 400,
        code: 'WHATSAPP_SIMULATOR_INVALID_BARBERSHOP',
        message: 'barbershopId informado para o simulador e invalido',
        reason: 'barbershop_not_found',
        source: contextSource,
      };
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 500,
      code: 'WHATSAPP_SIMULATOR_CONTEXT_VALIDATION_FAILED',
      message: 'Falha ao validar o contexto da barbearia no simulador',
      reason: 'barbershop_validation_query_failed',
      source: contextSource,
      error,
    };
  }

  return {
    ok: true,
    barbershopId: resolvedBarbershopId,
    source: contextSource,
  };
};

const WEBHOOK_MESSAGE_DEDUPE = new Map();
const WEBHOOK_DEDUPE_TTL_MS = 10 * 60 * 1000;
const WEBHOOK_FALLBACK_DEDUPE_TTL_MS = 15 * 1000;
const WEBHOOK_DEDUPE_MAX_KEYS = 10000;

const normalizeWebhookEventName = (value) =>
  String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

const INCOMING_WEBHOOK_EVENTS = new Set([
  'messages-upsert',
  'messagesupsert',
  'message-upsert',
  'messageupsert',
  'messages',
  'message',
  'new-message',
  'incoming-message',
  'message-received',
  'messagereceived',
]);

const isIncomingWebhookEvent = (eventName, { allowEmpty = true } = {}) => {
  const normalized = normalizeWebhookEventName(eventName);

  if (!normalized) {
    return allowEmpty;
  }

  return INCOMING_WEBHOOK_EVENTS.has(normalized);
};

const isWebhookBooleanTrue = (value) => {
  if (value === true) return true;
  if (value === 1) return true;

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const mergePlainObjects = (...values) => {
  const plainValues = values.filter(isPlainObject);

  if (!plainValues.length) {
    return null;
  }

  const result = {};

  for (const value of plainValues) {
    for (const [key, currentValue] of Object.entries(value)) {
      const existingValue = result[key];

      if (isPlainObject(existingValue) && isPlainObject(currentValue)) {
        result[key] = mergePlainObjects(existingValue, currentValue);
      } else {
        result[key] = currentValue;
      }
    }
  }

  return result;
};

const WEBHOOK_MESSAGE_WRAPPER_KEYS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
];

const extractTextFromMessageContent = (messageContent, depth = 0) => {
  if (!messageContent || typeof messageContent !== 'object' || depth > 8) {
    return null;
  }

  const directText = [
    messageContent?.conversation,
    messageContent?.extendedTextMessage?.text,
    messageContent?.extendedTextMessage?.caption,
    messageContent?.imageMessage?.caption,
    messageContent?.videoMessage?.caption,
    messageContent?.documentMessage?.caption,
    messageContent?.documentWithCaptionMessage?.message?.documentMessage?.caption,
  ].find((value) => typeof value === 'string' && value.trim());

  if (directText) {
    return directText.trim();
  }

  const editedMessage = messageContent?.protocolMessage?.editedMessage;
  if (editedMessage && typeof editedMessage === 'object') {
    const editedText = extractTextFromMessageContent(editedMessage, depth + 1);
    if (editedText) {
      return editedText;
    }
  }

  for (const wrapperKey of WEBHOOK_MESSAGE_WRAPPER_KEYS) {
    const wrapperNode = messageContent?.[wrapperKey];
    if (!wrapperNode || typeof wrapperNode !== 'object') {
      continue;
    }

    const nestedMessage = wrapperNode?.message && typeof wrapperNode.message === 'object'
      ? wrapperNode.message
      : wrapperNode;

    const nestedText = extractTextFromMessageContent(nestedMessage, depth + 1);
    if (nestedText) {
      return nestedText;
    }
  }

  return null;
};

const extractWebhookText = (payload) => {
  const directText = [
    payload?.message,
    payload?.text,
    payload?.body,
    payload?.data?.message,
    payload?.data?.text,
    payload?.data?.body,
    payload?.data?.message?.conversation,
    payload?.data?.message?.extendedTextMessage?.text,
    payload?.data?.message?.extendedTextMessage?.caption,
    payload?.data?.message?.imageMessage?.caption,
    payload?.data?.message?.videoMessage?.caption,
    payload?.data?.messages?.[0]?.message?.conversation,
    payload?.data?.messages?.[0]?.message?.extendedTextMessage?.text,
    payload?.data?.messages?.[0]?.message?.extendedTextMessage?.caption,
    payload?.data?.messages?.[0]?.message?.imageMessage?.caption,
    payload?.data?.messages?.[0]?.message?.videoMessage?.caption,
    payload?.messages?.[0]?.message?.conversation,
    payload?.messages?.[0]?.message?.extendedTextMessage?.text,
    payload?.messages?.[0]?.message?.extendedTextMessage?.caption,
    payload?.messages?.[0]?.message?.imageMessage?.caption,
    payload?.messages?.[0]?.message?.videoMessage?.caption,
  ].find((value) => typeof value === 'string' && value.trim());

  if (directText) {
    return directText.trim();
  }

  const messageNodes = [
    payload?.message,
    payload?.data?.message,
    payload?.data?.messages?.[0]?.message,
    payload?.messages?.[0]?.message,
  ];

  for (const messageNode of messageNodes) {
    const extractedText = extractTextFromMessageContent(messageNode);
    if (extractedText) {
      return extractedText;
    }
  }

  return null;
};

const parseWebhookPayload = (rawBody) => {
  if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
    return {
      payload: rawBody,
      bodyType: 'object',
      parseError: null,
    };
  }

  if (typeof rawBody === 'string') {
    const trimmedBody = rawBody.trim();

    if (!trimmedBody) {
      return {
        payload: {},
        bodyType: 'string',
        parseError: 'empty_string_body',
      };
    }

    try {
      const parsed = JSON.parse(trimmedBody);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          payload: parsed,
          bodyType: 'json_string',
          parseError: null,
        };
      }

      return {
        payload: {},
        bodyType: 'json_string',
        parseError: 'json_body_not_object',
      };
    } catch (error) {
      return {
        payload: {},
        bodyType: 'string',
        parseError: `json_parse_error:${error?.message || 'unknown_error'}`,
      };
    }
  }

  return {
    payload: {},
    bodyType: rawBody === null ? 'null' : typeof rawBody,
    parseError: 'unsupported_body_type',
  };
};

const getWebhookPayloadSize = (payload = {}) => {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    return null;
  }
};

const buildPayloadLogSummary = (payload = {}) => ({
  payloadKeys: Object.keys(payload || {}),
  payloadSizeBytes: getWebhookPayloadSize(payload),
  hasMessagesArray:
    Array.isArray(payload?.messages) ||
    Array.isArray(payload?.data?.messages),
  messageCount:
    (Array.isArray(payload?.messages) ? payload.messages.length : 0) ||
    (Array.isArray(payload?.data?.messages) ? payload.data.messages.length : 0),
  remoteJid:
    payload?.key?.remoteJid ||
    payload?.data?.key?.remoteJid ||
    payload?.data?.messages?.[0]?.key?.remoteJid ||
    payload?.messages?.[0]?.key?.remoteJid ||
    null,
  instanceName:
    payload?.instanceName ||
    payload?.instance?.instanceName ||
    payload?.owner ||
    payload?.data?.instanceName ||
    payload?.data?.instance?.instanceName ||
    payload?.data?.owner ||
    payload?.message?.instanceName ||
    payload?.message?.instance?.instanceName ||
    payload?.message?.owner ||
    payload?.data?.messages?.[0]?.instanceName ||
    payload?.data?.messages?.[0]?.instance?.instanceName ||
    payload?.data?.messages?.[0]?.owner ||
    payload?.messages?.[0]?.instanceName ||
    payload?.messages?.[0]?.instance?.instanceName ||
    payload?.messages?.[0]?.owner ||
    null,
});

const buildAuthorSignalShape = (payload = {}) => ({
  keyRemoteJid:
    payload?.key?.remoteJid ||
    payload?.data?.key?.remoteJid ||
    payload?.data?.messages?.[0]?.message?.key?.remoteJid ||
    payload?.data?.messages?.[0]?.key?.remoteJid ||
    payload?.messages?.[0]?.message?.key?.remoteJid ||
    payload?.messages?.[0]?.key?.remoteJid ||
    null,
  sender:
    payload?.sender ||
    payload?.data?.sender ||
    payload?.data?.messages?.[0]?.sender ||
    payload?.messages?.[0]?.sender ||
    null,
  from:
    payload?.from ||
    payload?.data?.from ||
    payload?.data?.messages?.[0]?.from ||
    payload?.messages?.[0]?.from ||
    null,
  participant:
    payload?.participant ||
    payload?.key?.participant ||
    payload?.data?.participant ||
    payload?.data?.key?.participant ||
    payload?.data?.messages?.[0]?.message?.key?.participant ||
    payload?.data?.messages?.[0]?.participant ||
    payload?.data?.messages?.[0]?.key?.participant ||
    payload?.messages?.[0]?.message?.key?.participant ||
    payload?.messages?.[0]?.participant ||
    payload?.messages?.[0]?.key?.participant ||
    null,
  senderPn:
    payload?.senderPn ||
    payload?.key?.senderPn ||
    payload?.data?.senderPn ||
    payload?.data?.key?.senderPn ||
    payload?.data?.messages?.[0]?.senderPn ||
    payload?.data?.messages?.[0]?.key?.senderPn ||
    payload?.messages?.[0]?.senderPn ||
    payload?.messages?.[0]?.key?.senderPn ||
    payload?.contextInfo?.senderPn ||
    payload?.messageContextInfo?.senderPn ||
    payload?.message?.contextInfo?.senderPn ||
    payload?.message?.messageContextInfo?.senderPn ||
    payload?.data?.contextInfo?.senderPn ||
    payload?.data?.messageContextInfo?.senderPn ||
    payload?.data?.message?.contextInfo?.senderPn ||
    payload?.data?.message?.messageContextInfo?.senderPn ||
    payload?.data?.messages?.[0]?.messageContextInfo?.senderPn ||
    payload?.data?.messages?.[0]?.message?.messageContextInfo?.senderPn ||
    payload?.messages?.[0]?.messageContextInfo?.senderPn ||
    payload?.messages?.[0]?.message?.messageContextInfo?.senderPn ||
    null,
  participantPn:
    payload?.participantPn ||
    payload?.key?.participantPn ||
    payload?.data?.participantPn ||
    payload?.data?.key?.participantPn ||
    payload?.data?.messages?.[0]?.participantPn ||
    payload?.data?.messages?.[0]?.key?.participantPn ||
    payload?.messages?.[0]?.participantPn ||
    payload?.messages?.[0]?.key?.participantPn ||
    payload?.contextInfo?.participantPn ||
    payload?.messageContextInfo?.participantPn ||
    payload?.message?.contextInfo?.participantPn ||
    payload?.message?.messageContextInfo?.participantPn ||
    payload?.data?.contextInfo?.participantPn ||
    payload?.data?.messageContextInfo?.participantPn ||
    payload?.data?.message?.contextInfo?.participantPn ||
    payload?.data?.message?.messageContextInfo?.participantPn ||
    payload?.data?.messages?.[0]?.messageContextInfo?.participantPn ||
    payload?.data?.messages?.[0]?.message?.messageContextInfo?.participantPn ||
    payload?.messages?.[0]?.messageContextInfo?.participantPn ||
    payload?.messages?.[0]?.message?.messageContextInfo?.participantPn ||
    null,
  hasContextInfo: Boolean(
    payload?.contextInfo ||
    payload?.message?.contextInfo ||
    payload?.data?.contextInfo ||
    payload?.data?.message?.contextInfo ||
    payload?.data?.messages?.[0]?.message?.contextInfo ||
    payload?.messages?.[0]?.message?.contextInfo
  ),
  hasMessageContextInfo: Boolean(
    payload?.messageContextInfo ||
    payload?.message?.messageContextInfo ||
    payload?.data?.messageContextInfo ||
    payload?.data?.message?.messageContextInfo ||
    payload?.data?.messages?.[0]?.messageContextInfo ||
    payload?.data?.messages?.[0]?.message?.messageContextInfo ||
    payload?.messages?.[0]?.messageContextInfo ||
    payload?.messages?.[0]?.message?.messageContextInfo
  ),
});

const logWebhookReceipt = ({ req, route, eventName = null, payload = {}, parseError = null, bodyType = null }) => {
  logger.info(
    {
      requestId: req?.id || null,
      route,
      event: eventName,
      parseError,
      bodyType,
    },
    'WEBHOOK RECEBIDO'
  );

  logger.info(
    {
      requestId: req?.id || null,
      route,
      event: eventName,
      bodyType,
      ...buildPayloadLogSummary(payload),
      parseError,
    },
    'Webhook WhatsApp recebido'
  );

  logger.debug(
    {
      requestId: req?.id || null,
      route,
      event: eventName,
      ...buildPayloadLogSummary(payload),
    },
    'Webhook WhatsApp payload resumido'
  );
};

// CORREÇÃO: extractWebhookFromMe definido ANTES de normalizeWebhookEventPayload
// para que possa ser chamado dentro da normalização sem ReferenceError.
const extractWebhookFromMe = (payload) => {
  const candidates = [
    payload?.fromMe,
    payload?.key?.fromMe,
    payload?.data?.fromMe,
    payload?.data?.key?.fromMe,
    payload?.data?.messages?.[0]?.message?.key?.fromMe,
    payload?.data?.messages?.[0]?.key?.fromMe,
    payload?.messages?.[0]?.message?.key?.fromMe,
    payload?.messages?.[0]?.key?.fromMe,
  ];

  return candidates.some((value) => isWebhookBooleanTrue(value));
};

const normalizeWebhookEventPayload = (payload = {}, forcedEvent = null) => {
  const dataNode = payload?.data && typeof payload.data === 'object' ? payload.data : null;
  const dataMessage = dataNode?.message && typeof dataNode.message === 'object' ? dataNode.message : null;
  const dataUpsertMessage =
    Array.isArray(dataNode?.messages) && dataNode.messages[0] && typeof dataNode.messages[0] === 'object'
      ? dataNode.messages[0]
      : null;
  const rootUpsertMessage =
    Array.isArray(payload?.messages) && payload.messages[0] && typeof payload.messages[0] === 'object'
      ? payload.messages[0]
      : null;
  const messageNode = dataUpsertMessage || rootUpsertMessage || dataMessage;

  const key =
    mergePlainObjects(
      payload?.key,
      payload?.message?.key,
      dataNode?.key,
      dataMessage?.key,
      messageNode?.key
    ) ||
    messageNode?.key ||
    payload?.key ||
    payload?.message?.key ||
    dataNode?.key ||
    null;

  const mergedMessage =
    mergePlainObjects(
      isPlainObject(payload?.message) ? payload.message : null,
      isPlainObject(dataNode?.message) ? dataNode.message : null,
      isPlainObject(dataMessage) ? dataMessage : null,
      isPlainObject(messageNode?.message) ? messageNode.message : null
    );

  const message =
    mergedMessage ||
    messageNode?.message ||
    payload?.message ||
    dataNode?.message ||
    null;

  // CORREÇÃO: extrair sender e from com prioridade explícita ANTES do spread
  // O spread encadeado (payload → dataNode → messageNode) sobrescrevia sender/from
  // do nível raiz com valores de níveis aninhados, causando identificação errada do autor.
  const resolvedSender =
    payload?.sender ||
    dataNode?.sender ||
    messageNode?.sender ||
    null;

  const resolvedFrom =
    payload?.from ||
    dataNode?.from ||
    messageNode?.from ||
    null;

  const resolvedInstanceName =
    payload?.instanceName ||
    payload?.instance?.instanceName ||
    payload?.owner ||
    dataNode?.instanceName ||
    dataNode?.instance?.instanceName ||
    dataNode?.owner ||
    messageNode?.instanceName ||
    messageNode?.instance?.instanceName ||
    messageNode?.owner ||
    null;

  const preservedDestination =
    payload?.destination ??
    dataNode?.destination ??
    messageNode?.destination ??
    undefined;

  return {
    ...payload,
    ...(dataNode || {}),
    ...(messageNode || {}),
    key: key || undefined,
    message: message || undefined,
    // Evolution envia destination no raiz; spreads aninhados não podem apagar (anti–auto-resposta @lid).
    ...(preservedDestination !== undefined ? { destination: preservedDestination } : {}),
    contextInfo:
      mergePlainObjects(
        payload?.contextInfo,
        dataNode?.contextInfo,
        messageNode?.contextInfo,
        message?.contextInfo
      ) || undefined,
    messageContextInfo:
      mergePlainObjects(
        payload?.messageContextInfo,
        dataNode?.messageContextInfo,
        messageNode?.messageContextInfo,
        message?.messageContextInfo
      ) || undefined,
    // Restaurar sender e from após o spread para evitar contaminação
    sender: resolvedSender,
    from: resolvedFrom,
    instanceName: resolvedInstanceName,
    event:
      forcedEvent ||
      payload?.event ||
      payload?.type ||
      dataNode?.event ||
      dataNode?.type ||
      null,
    type:
      payload?.type ||
      payload?.event ||
      dataNode?.type ||
      dataNode?.event ||
      forcedEvent ||
      null,
  };
};

const getConfidenceRank = (value) => {
  switch (value) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
};

const selectAuthorExtraction = (normalizedExtraction, rawExtraction = null) => {
  if (!rawExtraction) {
    return normalizedExtraction;
  }

  if (!normalizedExtraction?.authorPhone && rawExtraction?.authorPhone) {
    return rawExtraction;
  }

  if (normalizedExtraction?.authorPhone && !rawExtraction?.authorPhone) {
    return normalizedExtraction;
  }

  if (!normalizedExtraction?.authorPhone && !rawExtraction?.authorPhone) {
    return normalizedExtraction;
  }

  if (normalizedExtraction.authorPhone === rawExtraction.authorPhone) {
    return getConfidenceRank(rawExtraction.confidence) > getConfidenceRank(normalizedExtraction.confidence)
      ? rawExtraction
      : normalizedExtraction;
  }

  return {
    ...normalizedExtraction,
    authorPhone: null,
    sourcePath: null,
    candidateType: null,
    confidence: 'none',
    resolutionRule: null,
    candidates: [
      ...(Array.isArray(normalizedExtraction?.candidates) ? normalizedExtraction.candidates : []),
      ...(Array.isArray(rawExtraction?.candidates)
        ? rawExtraction.candidates.map((candidate) => ({
            ...candidate,
            sourcePath: candidate?.sourcePath ? `raw.${candidate.sourcePath}` : 'raw',
          }))
        : []),
    ],
    rejections: [
      ...(Array.isArray(normalizedExtraction?.rejections) ? normalizedExtraction.rejections : []),
      ...(Array.isArray(rawExtraction?.rejections)
        ? rawExtraction.rejections.map((item) => ({
            ...item,
            sourcePath: item?.sourcePath ? `raw.${item.sourcePath}` : 'raw',
          }))
        : []),
      {
        sourcePath: 'raw_vs_normalized',
        reason: 'ambiguous_author_between_payload_shapes',
      },
    ],
  };
};

const resolveConnectedNumberFromDatabase = async (instanceName = null) => {
  if (typeof instanceName !== 'string' || !instanceName.trim()) {
    return null;
  }

  const normalizedInstanceName = instanceName.trim().toLowerCase();

  try {
    const result = await pool.query(
      `SELECT whatsapp
         FROM barbershops
        WHERE active = true
          AND NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
          AND lower(btrim(whatsapp_instance_name)) = $1
        LIMIT 1`,
      [normalizedInstanceName]
    );

    if (!result.rows.length) {
      return null;
    }

    return normalizeWhatsAppNumber(result.rows[0]?.whatsapp || null);
  } catch (error) {
    logger.warn(
      { err: error, instanceName: normalizedInstanceName },
      'Falha ao resolver connectedNumber via banco no webhook'
    );
    return null;
  }
};

const resolveConnectedNumberForWebhook = async (instanceName = null, payload = {}) => {
  const cached = getConnectedNumberCached(instanceName);
  if (cached) {
    return cached;
  }

  const payloadDestination = extractPayloadDestination(payload);
  if (payloadDestination) {
    return payloadDestination;
  }

  const dbNumber = await resolveConnectedNumberFromDatabase(instanceName);
  if (dbNumber) {
    return dbNumber;
  }

  return null;
};

const buildWebhookPhoneExtractionOptions = (instanceName = null, connectedNumberOverride = null) => {
  // Usa o cache dedicado por instância (sem HTTP)
  const connectedNumber =
    normalizeWhatsAppNumber(connectedNumberOverride) || getConnectedNumberCached(instanceName);

  if (!connectedNumber) {
    return {};
  }

  return {
    connectedNumbers: [connectedNumber],
  };
};

// Verifica se um JID é do tipo @lid (Linked Device — sem número confiável).
const isLidJid = (jid) =>
  typeof jid === 'string' && jid.endsWith('@lid');

/**
 * Extrai o telefone do autor da mensagem a partir do payload do webhook.
 *
 * Ordem de prioridade (da mais confiável para menos confiável):
 * 1. messageContextInfo.participantPn — campo específico do Evolution para LIDs
 * 2. key.participant — participante em conversas de grupo/LID
 * 3. sender — quando remoteJid não é @lid
 * 4. remoteJid — apenas se NÃO for @lid
 *
 * REGRA: ignorar remoteJid e sender quando remoteJid for @lid,
 *        a menos que sender não seja o número da instância.
 */
const extractAuthorPhone = (payload, connectedNumber) => {
  const msg = payload?.data?.messages?.[0] || payload?.messages?.[0] || payload;
  const key = msg?.key || payload?.key || {};
  const remoteJid = key?.remoteJid || payload?.key?.remoteJid || null;
  const participant = key?.participant || payload?.participant || null;
  const sender = payload?.sender || null;

  // 1. participantPn — mais confiável para @lid
  const participantPn =
    msg?.messageContextInfo?.participantPn ||
    payload?.messageContextInfo?.participantPn ||
    msg?.message?.messageContextInfo?.participantPn ||
    null;

  if (participantPn) {
    const phone = normalizePhone(participantPn);
    if (phone) {
      return { phone, source: 'participantPn', isLid: isLidJid(remoteJid) };
    }
  }

  // 2. participant (grupo ou LID)
  if (participant && !isLidJid(participant)) {
    const phone = normalizePhone(participant);
    if (phone) {
      return { phone, source: 'participant', isLid: isLidJid(remoteJid) };
    }
  }

  // 3. Se remoteJid for @lid: usar sender APENAS se sender != connectedNumber
  if (isLidJid(remoteJid)) {
    if (sender) {
      const senderPhone = normalizePhone(sender);
      if (senderPhone && !isSelfMessage({ authorPhone: senderPhone, connectedNumber })) {
        return { phone: senderPhone, source: 'sender_lid_fallback', isLid: true };
      }
    }
    // @lid sem fallback confiável
    return { phone: null, source: 'lid_no_fallback', isLid: true };
  }

  // 4. sender (não-LID)
  if (sender) {
    const senderPhone = normalizePhone(sender);
    if (senderPhone) {
      return { phone: senderPhone, source: 'sender', isLid: false };
    }
  }

  // 5. remoteJid (não-LID, último recurso)
  if (remoteJid && !isLidJid(remoteJid)) {
    const phone = normalizePhone(remoteJid);
    if (phone) {
      return { phone, source: 'remoteJid', isLid: false };
    }
  }

  return { phone: null, source: 'not_found', isLid: false };
};

const mapWebhookIncomingMessage = async (payload) => {
  const normalizedPayload = normalizeWebhookEventPayload(payload);
  const eventName = normalizeWebhookEventName(
    normalizedPayload?.event || normalizedPayload?.type || ''
  );

  if (!isIncomingWebhookEvent(eventName)) {
    return null;
  }

  // ========== REGRA 1: BLOQUEAR fromMe ==========
  // Verificado no payload RAW para evitar falso-positivo por spread contaminado.
  const fromMe = extractWebhookFromMe(payload);
  if (fromMe) {
    logger.info(
      {
        event: eventName,
        fromMe: true,
        remoteJid: normalizedPayload?.key?.remoteJid || null,
        sender: normalizedPayload?.sender || null,
      },
      'Webhook ignorado: fromMe=true'
    );
    return null;
  }

  // Verificação redundante explícita em key.fromMe (defesa em profundidade)
  if (
    payload?.key?.fromMe === true ||
    normalizedPayload?.key?.fromMe === true ||
    payload?.data?.messages?.[0]?.key?.fromMe === true
  ) {
    logger.info({ event: eventName }, 'Webhook ignorado: key.fromMe=true explícito');
    return null;
  }

  // ========== IDENTIFICAR INSTÂNCIA ==========
  // instanceName é o identificador do tenant (barbearia)
  const instanceName =
    normalizedPayload?.instanceName ||
    payload?.instanceName ||
    null;

  // ========== REGRA 2: CONNECTED NUMBER DO CACHE (SEM HTTP) ==========
  // NUNCA fazer HTTP aqui. Cache é atualizado via syncStateFromEvolution e eventos.
  // REGRA CRÍTICA: se connectedNumber for null, processar normalmente (não bloquear).
  const connectedNumber = await resolveConnectedNumberForWebhook(instanceName, payload);

  // ========== EXTRAÇÃO DE TEXTO ==========
  const text = extractWebhookText(normalizedPayload);

  // ========== EXTRAÇÃO DO AUTOR ==========
  // Usa sistema existente de resolvência de autor (suporte a LID, participantPn, etc.)
  const extractionOptions = buildWebhookPhoneExtractionOptions(instanceName, connectedNumber);
  const extraction = resolveIncomingAuthor(normalizedPayload, { ...extractionOptions, messageText: text });
  const rawExtraction = resolveIncomingAuthor(payload, { ...extractionOptions, messageText: text });
  const resolvedExtraction = selectAuthorExtraction(extraction, rawExtraction);

  // Extração direta do autor (sistema simplificado conforme regras do refactoring)
  const authorExtracted = extractAuthorPhone(payload, connectedNumber);

  // authorPhone: preferência ao sistema existente (mais sofisticado), fallback ao simplificado
  const authorPhone = resolvedExtraction.authorPhone || authorExtracted.phone || null;

  const payloadIdentityPhone = extractPayloadDestination(payload);
  const identityForSelfCheck = connectedNumber || payloadIdentityPhone || null;

  const normalizedAuthor = authorPhone ? normalizePhone(authorPhone) : null;
  const normalizedConnected = identityForSelfCheck ? normalizePhone(identityForSelfCheck) : null;
  const isSelf = Boolean(
    identityForSelfCheck && authorPhone && isSelfMessage({ authorPhone, connectedNumber: identityForSelfCheck })
  );

  // ========== LOG ESTRUTURADO (campos obrigatórios anti–auto-resposta) ==========
  logger.info(
    {
      instanceName,
      authorPhone,
      connectedNumber,
      normalizedAuthor,
      normalizedConnected,
      isSelf,
      event: eventName,
      authorSource: resolvedExtraction.authorPhone
        ? resolvedExtraction.sourcePath
        : authorExtracted.source,
      isLid: authorExtracted.isLid,
      fromMe,
      hasText: Boolean(text),
    },
    'DEBUG WHATSAPP - AUTOR E NUMERO IDENTIFICADOS'
  );

  // ========== REGRA 3: BLOQUEAR AUTO-RESPOSTA ==========
  // SÓ bloqueia se connectedNumber for CONHECIDO e igual ao autor (normalizado + variantes BR).
  // Se connectedNumber for null (sync ainda não rodou), processar normalmente (fail-open).
  if (isSelf) {
    logger.warn(
      {
        instanceName,
        authorPhone,
        connectedNumber,
        normalizedAuthor,
        normalizedConnected,
        isSelf: true,
        event: eventName,
      },
      'BLOQUEADO: mensagem do próprio número da instância'
    );
    return null;
  }

  // ========== REGRA 4: TELEFONE DO AUTOR OBRIGATÓRIO ==========
  if (!authorPhone) {
    logger.warn(
      {
        event: eventName,
        instanceName,
        connectedNumber: connectedNumber || null,
        sourceTried: authorExtracted.source,
        isLid: authorExtracted.isLid,
        resolvedExtractionRule: resolvedExtraction.resolutionRule || null,
        remoteJid: normalizedPayload?.key?.remoteJid || null,
        sender: normalizedPayload?.sender || payload?.sender || null,
      },
      'Webhook ignorado: não foi possível identificar o telefone do autor'
    );
    return null;
  }

  // ========== REGRA 5: TEXTO OBRIGATÓRIO ==========
  if (!text) {
    logger.debug(
      { event: eventName, authorPhone, instanceName },
      'Webhook ignorado: mensagem sem texto'
    );
    return null;
  }

  logger.info(
    {
      event: eventName,
      authorPhone,
      instanceName,
      connectedNumber: connectedNumber || null,
      textPreview: text.slice(0, 60),
      resolutionRule: resolvedExtraction.resolutionRule || authorExtracted.source,
      isLid: authorExtracted.isLid,
    },
    'WEBHOOK PROCESSADO: autor identificado, mensagem válida'
  );

  return {
    payload: normalizedPayload,
    eventName,
    extractedPhone: authorPhone,
    extractedText: text,
    extraction: {
      ...resolvedExtraction,
      authorPhone,
      instanceName,
    },
  };
};


const buildWebhookDebugFields = (payload, extraction = null) => {
  const text = extractWebhookText(payload);
  const resolvedExtraction =
    extraction ||
    resolveIncomingAuthor(payload, {
      ...buildWebhookPhoneExtractionOptions(),
      messageText: text,
    });

  return {
    keyRemoteJid: payload?.key?.remoteJid || null,
    messageKeyRemoteJid: payload?.message?.key?.remoteJid || null,
    sender: resolvedExtraction.sender || payload?.sender || null,
    participant: resolvedExtraction.participant || payload?.participant || null,
    fromMe: resolvedExtraction.fromMe,
    from: payload?.from || null,
    extractedPhone: resolvedExtraction.authorPhone,
    extractionSourcePath: resolvedExtraction.sourcePath,
    extractionCandidateType: resolvedExtraction.candidateType,
    extractionConfidence: resolvedExtraction.confidence,
    extractionResolutionRule: resolvedExtraction.resolutionRule || null,
    remoteJidOriginal: resolvedExtraction.remoteJidOriginal,
    authorCandidates: resolvedExtraction.candidates,
    extractionRejections: resolvedExtraction.rejections,
    instanceNumbers: resolvedExtraction.instanceNumbers,
    instanceName: payload?.instanceName || null,
  };
};

const pruneWebhookDedupeCache = () => {
  const now = Date.now();

  for (const [key, value] of WEBHOOK_MESSAGE_DEDUPE.entries()) {
    if (!value || value.expiresAt <= now) {
      WEBHOOK_MESSAGE_DEDUPE.delete(key);
    }
  }

  if (WEBHOOK_MESSAGE_DEDUPE.size <= WEBHOOK_DEDUPE_MAX_KEYS) {
    return;
  }

  const overflow = WEBHOOK_MESSAGE_DEDUPE.size - WEBHOOK_DEDUPE_MAX_KEYS;
  let removed = 0;

  for (const key of WEBHOOK_MESSAGE_DEDUPE.keys()) {
    WEBHOOK_MESSAGE_DEDUPE.delete(key);
    removed += 1;

    if (removed >= overflow) {
      break;
    }
  }
};

const extractWebhookMessageId = (payload = {}) => {
  const candidates = [
    payload?.key?.id,
    payload?.message?.key?.id,
    payload?.data?.key?.id,
    payload?.data?.messages?.[0]?.key?.id,
    payload?.messages?.[0]?.key?.id,
    payload?.key?.stanzaId,
    payload?.message?.key?.stanzaId,
    payload?.data?.key?.stanzaId,
    payload?.data?.messages?.[0]?.key?.stanzaId,
    payload?.messages?.[0]?.key?.stanzaId,
  ];

  return (
    candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || null
  );
};

const extractWebhookMessageTimestamp = (payload = {}) => {
  const candidates = [
    payload?.key?.messageTimestamp,
    payload?.message?.key?.messageTimestamp,
    payload?.data?.key?.messageTimestamp,
    payload?.data?.messages?.[0]?.key?.messageTimestamp,
    payload?.messages?.[0]?.key?.messageTimestamp,
    payload?.key?.timestamp,
    payload?.message?.key?.timestamp,
    payload?.data?.key?.timestamp,
    payload?.data?.messages?.[0]?.key?.timestamp,
    payload?.messages?.[0]?.key?.timestamp,
    payload?.timestamp,
    payload?.data?.timestamp,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const value = String(candidate).trim();
      if (value) {
        return value;
      }
    }
  }

  return null;
};

const registerWebhookMessageDeduplication = ({
  payload,
  eventName,
  extractedPhone,
  extractedText,
}) => {
  pruneWebhookDedupeCache();

  const messageId = extractWebhookMessageId(payload);
  let dedupeKey = null;
  let ttlMs = WEBHOOK_DEDUPE_TTL_MS;

  if (messageId) {
    dedupeKey = `id:${messageId}`;
  } else {
    ttlMs = WEBHOOK_FALLBACK_DEDUPE_TTL_MS;

    const remoteJid = extractWhatsAppRemoteJidFromWebhook(payload) || '';
    const messageTimestamp = extractWebhookMessageTimestamp(payload) || '';
    const normalizedText = String(extractedText || '').trim().toLowerCase();
    const seed = [
      normalizeWebhookEventName(eventName),
      extractedPhone || '',
      remoteJid,
      messageTimestamp,
      normalizedText,
    ].join('|');

    const hash = crypto.createHash('sha1').update(seed).digest('hex');
    dedupeKey = `fallback:${hash}`;
  }

  const now = Date.now();
  const cached = WEBHOOK_MESSAGE_DEDUPE.get(dedupeKey);

  if (cached && cached.expiresAt > now) {
    return {
      deduped: true,
      dedupeKey,
      messageId,
    };
  }

  WEBHOOK_MESSAGE_DEDUPE.set(dedupeKey, {
    expiresAt: now + ttlMs,
  });

  return {
    deduped: false,
    dedupeKey,
    messageId,
  };
};

// ==================== WEBHOOKS ====================

// Webhook local / legado
router.post('/webhook', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const { payload, parseError, bodyType } = parseWebhookPayload(req.body);

    if (extractWebhookFromMe(payload)) {
      logger.info(
        {
          route: '/api/v1/whatsapp/webhook',
          fromMe: true,
          durationMs: Date.now() - startedAt,
        },
        'Webhook legado ignorado: mensagem fromMe=true'
      );

      return sendSuccess(res, {
        received: true,
        processed: false,
        ignored: true,
        reason: 'from_me',
      });
    }

    logWebhookReceipt({
      req,
      route: '/api/v1/whatsapp/webhook',
      eventName: normalizeWebhookEventName(payload?.event || payload?.type || ''),
      payload,
      parseError,
      bodyType,
    });

    logger.warn(
      {
        route: '/api/v1/whatsapp/webhook',
        parseError,
      },
      'Webhook legado recebido. Recomenda-se migrar para /api/v1/whatsapp/webhook/messages-upsert'
    );

    const incoming = await mapWebhookIncomingMessage(payload);

    if (!incoming) {
      const normalizedPayload = normalizeWebhookEventPayload(payload);

      logger.debug(
        {
          event: normalizedPayload?.event || normalizedPayload?.type,
          fromMe: extractWebhookFromMe(normalizedPayload),
          parseError,
          durationMs: Date.now() - startedAt,
        },
        'Webhook ignorado sem payload de mensagem util'
      );

      return sendSuccess(res, { received: true, processed: false });
    }

    const dedupe = registerWebhookMessageDeduplication(incoming);

    if (dedupe.deduped) {
      logger.debug(
        {
          event: incoming.eventName,
          dedupeKey: dedupe.dedupeKey,
          messageId: dedupe.messageId,
          phone: incoming.extractedPhone,
          durationMs: Date.now() - startedAt,
        },
        'Webhook ignorado por deduplicacao'
      );

      return sendSuccess(res, {
        received: true,
        processed: false,
        deduped: true,
        reason: 'duplicate_message',
      });
    }

    const debugFields = buildWebhookDebugFields(incoming.payload, incoming.extraction);

    logger.debug(debugFields, 'Webhook WhatsApp debug de extração de telefone');

    logger.info(
      {
        event: incoming.eventName,
        phone: incoming.extractedPhone,
        messageId: dedupe.messageId,
        dedupeKey: dedupe.dedupeKey,
      },
      'FLUXO EXECUTADO'
    );

    const result = await handleIncomingMessage(incoming.payload, incoming.extractedText, {
      preExtractedPhone: incoming.extractedPhone,
      preExtractedText: incoming.extractedText,
      preExtractedInstanceNumbers: incoming.extraction?.instanceNumbers || [],
      preResolvedAuthorExtraction: incoming.extraction || null,
      eventName: incoming.eventName,
      dedupeKey: dedupe.dedupeKey,
      messageId: dedupe.messageId,
    });

    logger.debug(
      {
        phone: debugFields.extractedPhone,
        event: incoming.eventName,
        dedupeKey: dedupe.dedupeKey,
        messageId: dedupe.messageId,
        processed: result?.ok,
        ignored: result?.ignored,
        reason: result?.reason,
        durationMs: Date.now() - startedAt,
      },
      'Resultado do processamento de mensagem WhatsApp'
    );

    return sendSuccess(res, {
      received: true,
      processed: Boolean(result?.ok),
      deduped: false,
      ignored: Boolean(result?.ignored),
      reason: result?.reason || null,
    });
  } catch (error) {
    return next(error);
  }
});

// Webhook Evolution API — sub-rotas: /webhook/messages-upsert, /webhook/chats-update, etc.
router.post('/webhook/:event', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const eventName = normalizeWebhookEventName(req.params.event || '');
    const { payload, parseError, bodyType } = parseWebhookPayload(req.body);

    if (extractWebhookFromMe(payload)) {
      logger.info(
        {
          route: '/api/v1/whatsapp/webhook/:event',
          event: eventName,
          fromMe: true,
          durationMs: Date.now() - startedAt,
        },
        'Webhook Evolution sub-rota ignorado: mensagem fromMe=true'
      );

      return sendSuccess(res, {
        received: true,
        processed: false,
        ignored: true,
        reason: 'from_me',
      });
    }

    logWebhookReceipt({
      req,
      route: '/api/v1/whatsapp/webhook/:event',
      eventName,
      payload,
      parseError,
      bodyType,
    });

    if (!isIncomingWebhookEvent(eventName, { allowEmpty: false })) {
      logger.debug({ event: eventName }, 'Webhook Evolution sub-rota ignorada (nao e mensagem)');
      return sendSuccess(res, { received: true, processed: false });
    }

    const incoming = await mapWebhookIncomingMessage({
      ...payload,
      event: eventName,
    });

    if (!incoming) {
      logger.debug(
        {
          event: eventName,
          // CORREÇÃO: fromMe verificado no payload raw, não no normalizado (evita spread contaminado)
          fromMe: extractWebhookFromMe(payload),
          parseError,
          durationMs: Date.now() - startedAt,
        },
        'Webhook Evolution sub-rota sem payload util'
      );

      return sendSuccess(res, { received: true, processed: false });
    }

    const dedupe = registerWebhookMessageDeduplication(incoming);

    if (dedupe.deduped) {
      logger.debug(
        {
          event: eventName,
          dedupeKey: dedupe.dedupeKey,
          messageId: dedupe.messageId,
          phone: incoming.extractedPhone,
          durationMs: Date.now() - startedAt,
        },
        'Webhook Evolution ignorado por deduplicacao'
      );

      return sendSuccess(res, {
        received: true,
        processed: false,
        deduped: true,
        reason: 'duplicate_message',
      });
    }

    const debugFields = buildWebhookDebugFields(incoming.payload, incoming.extraction);

    logger.debug(
      {
        event: eventName,
        ...debugFields,
      },
      'Webhook Evolution messages-upsert debug de extração de telefone'
    );

    logger.info(
      {
        event: eventName,
        phone: incoming.extractedPhone,
        messageId: dedupe.messageId,
        dedupeKey: dedupe.dedupeKey,
      },
      'FLUXO EXECUTADO'
    );

    const result = await handleIncomingMessage(incoming.payload, incoming.extractedText, {
      preExtractedPhone: incoming.extractedPhone,
      preExtractedText: incoming.extractedText,
      preExtractedInstanceNumbers: incoming.extraction?.instanceNumbers || [],
      eventName: incoming.eventName,
      dedupeKey: dedupe.dedupeKey,
      messageId: dedupe.messageId,
    });

    logger.debug(
      {
        event: eventName,
        phone: debugFields.extractedPhone,
        dedupeKey: dedupe.dedupeKey,
        messageId: dedupe.messageId,
        processed: result?.ok,
        ignored: result?.ignored,
        reason: result?.reason,
        durationMs: Date.now() - startedAt,
      },
      'Resultado do processamento de mensagem WhatsApp'
    );

    return sendSuccess(res, {
      received: true,
      processed: Boolean(result?.ok),
      deduped: false,
      ignored: Boolean(result?.ignored),
      reason: result?.reason || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/simulator/message', ...waProtected, async (req, res, next) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const fallbackPhone = '5511999999999';
    const phone = normalizeWhatsAppNumber(req.body?.phone) || fallbackPhone;
    const payloadBarbershopId = normalizeSimulatorBarbershopId(req.body?.barbershopId);
    const authBarbershopId = normalizeSimulatorBarbershopId(req.user?.barbershopId);
    const pushName =
      typeof req.body?.pushName === 'string' && req.body.pushName.trim()
        ? req.body.pushName.trim()
        : 'Simulador';

    logger.info(
      {
        payloadBarbershopId,
        authBarbershopId,
      },
      'Simulador WhatsApp: contexto recebido'
    );

    if (!text) {
      return sendError(
        res,
        400,
        'WHATSAPP_SIMULATOR_INVALID_PAYLOAD',
        'Campo text e obrigatorio'
      );
    }

    const context = await resolveSimulatorBarbershopContext({
      payloadBarbershopId,
      authBarbershopId,
    });

    if (!context.ok) {
      const logPayload = {
        payloadBarbershopId,
        authBarbershopId,
        reason: context.reason,
        source: context.source,
      };

      if (context.statusCode >= 500) {
        logger.error(
          {
            ...logPayload,
            err: context.error,
          },
          'Simulador WhatsApp: falha ao validar contexto'
        );
      } else {
        logger.warn(logPayload, 'Simulador WhatsApp: contexto invalido');
      }

      return sendError(res, context.statusCode, context.code, context.message);
    }

    logger.info(
      {
        barbershopId: context.barbershopId,
        contextSource: context.source,
      },
      'Simulador WhatsApp: contexto resolvido'
    );

    const messageId = `SIMULATOR_${Date.now()}`;
    const remoteJid = `${phone}@s.whatsapp.net`;
    const payload = {
      event: 'messages.upsert',
      data: {
        messages: [
          {
            key: {
              remoteJid,
              fromMe: false,
              id: messageId,
            },
            message: {
              conversation: text,
            },
            pushName,
          },
        ],
      },
    };

    const botResponses = [];

    const result = await handleIncomingMessage(payload, text, {
      eventName: 'messages-upsert',
      preExtractedPhone: phone,
      preExtractedText: text,
      dedupeKey: `simulator:${messageId}`,
      messageId,
      simulationMode: true,
      responseCollector: botResponses,
      barbershopId: context.barbershopId,
      barbershopContextSource: context.source,
    });

    if (result?.reason === 'barbershop_not_resolved') {
      logger.warn(
        {
          barbershopId: context.barbershopId,
          contextSource: context.source,
          reason: result.reason,
        },
        'Simulador WhatsApp: fluxo retornou contexto nao resolvido'
      );

      return sendError(
        res,
        422,
        'WHATSAPP_SIMULATOR_CONTEXT_UNRESOLVED',
        'Nao foi possivel resolver o contexto da barbearia no simulador'
      );
    }

    const lastBotResponse = botResponses.length > 0 ? botResponses[botResponses.length - 1] : null;

    return sendSuccess(res, {
      received: true,
      processed: Boolean(result?.ok),
      ignored: Boolean(result?.ignored),
      reason: result?.reason || null,
      botResponses,
      lastBotResponse,
    });
  } catch (error) {
    return next(error);
  }
});

// ==================== STATUS E CONEXÃO ====================

router.get('/status', ...waProtected, async (req, res, next) => {
  try {
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);

    if (!tenantContext.instanceName) {
      return sendSuccess(res, buildDisconnectedStatusPayload());
    }

    const status = await refreshWhatsAppStatus(tenantContext);
    return sendSuccess(res, {
      ...status,
      instanceName: tenantContext.instanceName,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/connect', ...waProtected, async (req, res, next) => {
  try {
    const tenantContext = { barbershopId: req.user.barbershopId };
    const connected = await connectWhatsApp(tenantContext);
    const resolvedContext = await resolveAuthenticatedWhatsAppContext(req);
    const status = resolvedContext.instanceName
      ? getWhatsAppStatusByInstance(resolvedContext.instanceName)
      : buildDisconnectedStatusPayload();

    if (!connected && (status.status === 'provider_unavailable' || status.status === 'unavailable')) {
      return sendError(
        res,
        503,
        'WHATSAPP_PROVIDER_UNAVAILABLE',
        status.error || 'Evolution API indisponivel'
      );
    }

    if (!connected && status.status === 'instance_not_found') {
      return sendError(
        res,
        404,
        'WHATSAPP_INSTANCE_NOT_FOUND',
        status.error || 'Instancia configurada nao existe na Evolution API'
      );
    }

    return sendSuccess(res, {
      ...status,
      instanceName: resolvedContext.instanceName,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/initialize', ...waProtected, async (req, res, next) => {
  try {
    const tenantContext = { barbershopId: req.user.barbershopId };
    const result = await initializeWhatsAppInstance(tenantContext);
    const status = result?.status || getWhatsAppStatus();

    if (!result?.ok && (status.status === 'provider_unavailable' || status.status === 'unavailable')) {
      return sendError(
        res,
        503,
        'WHATSAPP_PROVIDER_UNAVAILABLE',
        status.error || 'Evolution API indisponivel'
      );
    }

    if (!result?.ok && status.status === 'instance_not_found') {
      return sendError(
        res,
        404,
        'WHATSAPP_INSTANCE_NOT_FOUND',
        status.error || 'Instancia configurada nao existe na Evolution API'
      );
    }
    return sendSuccess(res, status);
  } catch (error) {
    return next(error);
  }
});

router.get('/qrcode', ...waProtected, async (req, res, next) => {
  try {
    const status = await refreshWhatsAppStatus({ barbershopId: req.user.barbershopId });
    const resolvedContext = await resolveAuthenticatedWhatsAppContext(req);

    if (status.status === 'provider_unavailable' || status.status === 'unavailable') {
      return sendSuccess(res, {
        status: 'provider_unavailable',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status.error || 'Evolution API indisponivel',
      });
    }

    if (status.status === 'instance_not_found') {
      return sendSuccess(res, {
        status: 'instance_not_found',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status.error || 'Instancia configurada nao existe na Evolution API',
      });
    }

    const qrCode = await getWhatsAppQrCode({ barbershopId: req.user.barbershopId });
    const refreshedContext = await resolveAuthenticatedWhatsAppContext(req);
    const refreshed = refreshedContext.instanceName
      ? getWhatsAppStatusByInstance(refreshedContext.instanceName)
      : buildDisconnectedStatusPayload();

    if (!qrCode) {
      return sendSuccess(res, {
        status: refreshed.status,
        qrCode: null,
        instanceName: refreshedContext.instanceName,
        message:
          refreshed.status === 'connected'
            ? 'Instancia ja conectada'
            : 'QR Code ainda nao disponivel',
      });
    }

    return sendSuccess(res, {
      status: refreshed.status,
      qrCode,
      instanceName: refreshedContext.instanceName,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/disconnect', ...waProtected, async (req, res, next) => {
  try {
    const success = await disconnectWhatsApp({ barbershopId: req.user.barbershopId });
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);

    if (success) {
      return sendSuccess(res, {
        message: 'WhatsApp desconectado com sucesso',
        status: tenantContext.instanceName
          ? getWhatsAppStatusByInstance(tenantContext.instanceName)
          : buildDisconnectedStatusPayload(),
      });
    }

    return sendError(res, 502, 'WHATSAPP_DISCONNECT_FAILED', 'Nao foi possivel desconectar');
  } catch (error) {
    return next(error);
  }
});

router.post('/send', ...waProtected, async (req, res, next) => {
  try {
    const { phone, message, remoteJidOriginal } = req.body || {};
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const normalizedMessage = String(message || '').trim();
    const normalizedRemoteJidOriginal =
      typeof remoteJidOriginal === 'string' && remoteJidOriginal.trim()
        ? remoteJidOriginal.trim()
        : null;

    if (!normalizedPhone || !normalizedMessage) {
      return sendError(
        res,
        400,
        'WHATSAPP_SEND_INVALID_PAYLOAD',
        'Campos phone valido e message sao obrigatorios'
      );
    }

    logger.info(
      {
        route: '/api/v1/whatsapp/send',
        phone: normalizedPhone,
        remoteJidOriginal: normalizedRemoteJidOriginal,
        messageLength: normalizedMessage.length,
      },
      'Solicitacao manual de envio WhatsApp recebida'
    );

    const sent = await sendWhatsAppText(normalizedPhone, normalizedMessage, {
      remoteJidOriginal: normalizedRemoteJidOriginal,
      barbershopId: req.user.barbershopId,
    });

    if (!sent) {
      const tenantContext = await resolveAuthenticatedWhatsAppContext(req);
      const status = tenantContext.instanceName
        ? getWhatsAppStatusByInstance(tenantContext.instanceName)
        : buildDisconnectedStatusPayload();
      return sendError(res, 502, 'WHATSAPP_SEND_FAILED', status.error || 'Falha ao enviar mensagem');
    }

    return sendSuccess(res, {
      sent: true,
      phone: normalizedPhone,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/test-send', ...waProtected, async (req, res, next) => {
  try {
    const { phone, message, remoteJidOriginal } = req.body || {};
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const normalizedMessage = String(message || '').trim();
    const normalizedRemoteJidOriginal =
      typeof remoteJidOriginal === 'string' && remoteJidOriginal.trim()
        ? remoteJidOriginal.trim()
        : null;

    if (!normalizedPhone || !normalizedMessage) {
      return sendError(
        res,
        400,
        'WHATSAPP_TEST_SEND_INVALID_PAYLOAD',
        'Campos phone valido e message sao obrigatorios'
      );
    }

    logger.info(
      {
        route: '/api/v1/whatsapp/test-send',
        phone: normalizedPhone,
        remoteJidOriginal: normalizedRemoteJidOriginal,
        messageLength: normalizedMessage.length,
      },
      'Executando teste isolado de envio WhatsApp'
    );

    const sent = await sendWhatsAppText(normalizedPhone, normalizedMessage, {
      remoteJidOriginal: normalizedRemoteJidOriginal,
      barbershopId: req.user.barbershopId,
    });

    if (!sent) {
      const tenantContext = await resolveAuthenticatedWhatsAppContext(req);
      const status = tenantContext.instanceName
        ? getWhatsAppStatusByInstance(tenantContext.instanceName)
        : buildDisconnectedStatusPayload();
      logger.warn(
        {
          route: '/api/v1/whatsapp/test-send',
          phone: normalizedPhone,
          remoteJidOriginal: normalizedRemoteJidOriginal,
          providerStatus: status.status,
          providerError: status.error,
        },
        'Teste isolado de envio WhatsApp falhou'
      );

      return sendError(
        res,
        502,
        'WHATSAPP_TEST_SEND_FAILED',
        status.error || 'Falha ao enviar mensagem no teste isolado'
      );
    }

    logger.info(
      {
        route: '/api/v1/whatsapp/test-send',
        phone: normalizedPhone,
        remoteJidOriginal: normalizedRemoteJidOriginal,
      },
      'Teste isolado de envio WhatsApp concluido com sucesso'
    );

    return sendSuccess(res, {
      sent: true,
      phone: normalizedPhone,
      remoteJidOriginal: normalizedRemoteJidOriginal,
      messageLength: normalizedMessage.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/debug-send', ...waProtected, async (req, res, next) => {
  try {
    const { phone, message, remoteJidOriginal } = req.body || {};
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const normalizedMessage = String(message || 'teste').trim() || 'teste';
    const normalizedRemoteJidOriginal =
      typeof remoteJidOriginal === 'string' && remoteJidOriginal.trim()
        ? remoteJidOriginal.trim()
        : null;

    if (!normalizedPhone) {
      return sendError(
        res,
        400,
        'WHATSAPP_DEBUG_SEND_INVALID_PAYLOAD',
        'Campo phone valido e obrigatorio'
      );
    }

    logger.info(
      {
        route: '/api/v1/whatsapp/debug-send',
        phone: normalizedPhone,
        remoteJidOriginal: normalizedRemoteJidOriginal,
        messageLength: normalizedMessage.length,
      },
      'Executando debug-send isolado via sendWhatsAppMessage'
    );

    const sent = await sendWhatsAppMessage(normalizedPhone, normalizedMessage, {
      remoteJidOriginal: normalizedRemoteJidOriginal,
      eventName: 'debug-send',
      barbershopId: req.user.barbershopId,
    });

    if (!sent) {
      const tenantContext = await resolveAuthenticatedWhatsAppContext(req);
      const status = tenantContext.instanceName
        ? getWhatsAppStatusByInstance(tenantContext.instanceName)
        : buildDisconnectedStatusPayload();

      logger.warn(
        {
          route: '/api/v1/whatsapp/debug-send',
          phone: normalizedPhone,
          remoteJidOriginal: normalizedRemoteJidOriginal,
          providerStatus: status.status,
          providerError: status.error,
        },
        'debug-send falhou no provider'
      );

      return sendError(
        res,
        502,
        'WHATSAPP_DEBUG_SEND_FAILED',
        status.error || 'Falha no envio do debug-send'
      );
    }

    return sendSuccess(res, {
      sent: true,
      phone: normalizedPhone,
      remoteJidOriginal: normalizedRemoteJidOriginal,
      message: normalizedMessage,
    });
  } catch (error) {
    return next(error);
  }
});

// ==================== ALIASES LEGADOS ====================

router.get('/qr', ...waProtected, async (req, res, next) => {
  try {
    const status = await refreshWhatsAppStatus({ barbershopId: req.user.barbershopId });
    const resolvedContext = await resolveAuthenticatedWhatsAppContext(req);

    if (status.status === 'provider_unavailable' || status.status === 'unavailable') {
      return sendSuccess(res, {
        status: 'provider_unavailable',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status.error || 'Evolution API indisponivel',
      });
    }

    if (status.status === 'instance_not_found') {
      return sendSuccess(res, {
        status: 'instance_not_found',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status.error || 'Instancia configurada nao existe na Evolution API',
      });
    }

    const qrCode = await getWhatsAppQrCode({ barbershopId: req.user.barbershopId });
    const refreshedContext = await resolveAuthenticatedWhatsAppContext(req);
    const refreshed = refreshedContext.instanceName
      ? getWhatsAppStatusByInstance(refreshedContext.instanceName)
      : buildDisconnectedStatusPayload();

    return sendSuccess(res, {
      status: refreshed.status,
      qrCode: qrCode || null,
      instanceName: refreshedContext.instanceName,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', ...waProtected, async (req, res, next) => {
  try {
    const success = await logoutWhatsApp({ barbershopId: req.user.barbershopId });
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);

    if (success) {
      return sendSuccess(res, {
        message: 'WhatsApp desconectado com sucesso',
        status: tenantContext.instanceName
          ? getWhatsAppStatusByInstance(tenantContext.instanceName)
          : buildDisconnectedStatusPayload(),
      });
    }

    return sendError(res, 502, 'WHATSAPP_LOGOUT_FAILED', 'Nao foi possivel desconectar');
  } catch (error) {
    return next(error);
  }
});

router.post('/restart', ...waProtected, async (req, res, next) => {
  try {
    await restartWhatsApp({ barbershopId: req.user.barbershopId });
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);
    return sendSuccess(
      res,
      tenantContext.instanceName
        ? getWhatsAppStatusByInstance(tenantContext.instanceName)
        : buildDisconnectedStatusPayload()
    );
  } catch (error) {
    return next(error);
  }
});

// ==================== CONFIGURAÇÃO DE MENSAGENS ====================

router.get('/config', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;

    let config = await pool.query(
      'SELECT * FROM whatsapp_bot_config WHERE barbershop_id = $1',
      [barbershopId]
    );

    if (config.rows.length === 0) {
      config = await pool.query(
        `INSERT INTO whatsapp_bot_config (barbershop_id)
         VALUES ($1)
         RETURNING *`,
        [barbershopId]
      );
    }

    return sendSuccess(res, config.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.put('/config', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;
    const {
      welcome_header,
      ask_name_message,
      attendant_message,
      confirmation_message,
      reminder_message,
      invalid_option_message,
      session_expired_message,
      end_session_message,
      name_validation_message,
      no_slots_message,
      cancel_no_appointments_message,
      cancel_list_message,
      cancel_success_message,
      reschedule_no_appointments_message,
      reschedule_list_message,
      no_previous_appointments_message,
      rating_question_message,
      rating_confirmation_message,
      promotions_message,
      instagram_message,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO whatsapp_bot_config (
          barbershop_id, welcome_header, ask_name_message, attendant_message,
          confirmation_message, reminder_message, invalid_option_message,
          session_expired_message, end_session_message, name_validation_message,
          no_slots_message, cancel_no_appointments_message, cancel_list_message,
          cancel_success_message, reschedule_no_appointments_message, reschedule_list_message,
          no_previous_appointments_message, rating_question_message, rating_confirmation_message,
          promotions_message, instagram_message, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CURRENT_TIMESTAMP)
      ON CONFLICT (barbershop_id)
      DO UPDATE SET
          welcome_header = COALESCE($2, whatsapp_bot_config.welcome_header),
          ask_name_message = COALESCE($3, whatsapp_bot_config.ask_name_message),
          attendant_message = COALESCE($4, whatsapp_bot_config.attendant_message),
          confirmation_message = COALESCE($5, whatsapp_bot_config.confirmation_message),
          reminder_message = COALESCE($6, whatsapp_bot_config.reminder_message),
          invalid_option_message = COALESCE($7, whatsapp_bot_config.invalid_option_message),
          session_expired_message = COALESCE($8, whatsapp_bot_config.session_expired_message),
          end_session_message = COALESCE($9, whatsapp_bot_config.end_session_message),
          name_validation_message = COALESCE($10, whatsapp_bot_config.name_validation_message),
          no_slots_message = COALESCE($11, whatsapp_bot_config.no_slots_message),
          cancel_no_appointments_message = COALESCE($12, whatsapp_bot_config.cancel_no_appointments_message),
          cancel_list_message = COALESCE($13, whatsapp_bot_config.cancel_list_message),
          cancel_success_message = COALESCE($14, whatsapp_bot_config.cancel_success_message),
          reschedule_no_appointments_message = COALESCE($15, whatsapp_bot_config.reschedule_no_appointments_message),
          reschedule_list_message = COALESCE($16, whatsapp_bot_config.reschedule_list_message),
          no_previous_appointments_message = COALESCE($17, whatsapp_bot_config.no_previous_appointments_message),
          rating_question_message = COALESCE($18, whatsapp_bot_config.rating_question_message),
          rating_confirmation_message = COALESCE($19, whatsapp_bot_config.rating_confirmation_message),
          promotions_message = COALESCE($20, whatsapp_bot_config.promotions_message),
          instagram_message = COALESCE($21, whatsapp_bot_config.instagram_message),
          updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        barbershopId,
        welcome_header,
        ask_name_message,
        attendant_message,
        confirmation_message,
        reminder_message,
        invalid_option_message,
        session_expired_message,
        end_session_message,
        name_validation_message,
        no_slots_message,
        cancel_no_appointments_message,
        cancel_list_message,
        cancel_success_message,
        reschedule_no_appointments_message,
        reschedule_list_message,
        no_previous_appointments_message,
        rating_question_message,
        rating_confirmation_message,
        promotions_message,
        instagram_message,
      ]
    );

    return sendSuccess(res, result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/config/reset', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;

    await pool.query(
      'DELETE FROM whatsapp_bot_config WHERE barbershop_id = $1',
      [barbershopId]
    );

    const result = await pool.query(
      `INSERT INTO whatsapp_bot_config (barbershop_id)
       VALUES ($1)
       RETURNING *`,
      [barbershopId]
    );

    return sendSuccess(res, result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

// ==================== OPÇÕES DO MENU DO BOT ====================

const DEFAULT_MENU_OPTIONS = [
  { order: 1, label: 'Agendar um horário', emoji: '💈', handler: 'schedule' },
  { order: 2, label: 'Ver nossos serviços', emoji: '📋', handler: 'view_services' },
  { order: 3, label: 'Cancelar agendamento', emoji: '❌', handler: 'cancel' },
  { order: 4, label: 'Reagendamento', emoji: '🔄', handler: 'reschedule' },
  { order: 5, label: 'Avaliação pós-atendimento', emoji: '⭐', handler: 'rating' },
  { order: 6, label: 'Promoções', emoji: '🎉', handler: 'promotions' },
  { order: 7, label: 'Instagram', emoji: '📱', handler: 'instagram' },
  { order: 8, label: 'Falar com um humano', emoji: '👨‍💼', handler: 'attendant' },
  { order: 9, label: 'Encerrar atendimento', emoji: '🚪', handler: 'end_session' },
];

router.get('/config/menu', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;

    let result = await pool.query(
      'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
      [barbershopId]
    );

    if (result.rows.length === 0) {
      for (const opt of DEFAULT_MENU_OPTIONS) {
        await pool.query(
          `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
           VALUES ($1, $2, $3, $4, 'system', $5, true)
           ON CONFLICT (barbershop_id, option_order) DO NOTHING`,
          [barbershopId, opt.order, opt.label, opt.emoji, opt.handler]
        );
      }

      result = await pool.query(
        'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
        [barbershopId]
      );
    }

    return sendSuccess(res, result.rows);
  } catch (error) {
    return next(error);
  }
});

router.post('/config/menu', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;
    const { label, emoji, response_message } = req.body;

    if (!label || !response_message) {
      return res.status(400).json({
        success: false,
        error: { message: 'Label e mensagem de resposta são obrigatórios' },
      });
    }

    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(option_order), 0) as max_order FROM whatsapp_menu_options WHERE barbershop_id = $1',
      [barbershopId]
    );

    const nextOrder = Number(maxOrder.rows[0].max_order) + 1;

    if (nextOrder > 15) {
      return res.status(400).json({
        success: false,
        error: { message: 'Máximo de 15 opções no menu' },
      });
    }

    const result = await pool.query(
      `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, response_message, active)
       VALUES ($1, $2, $3, $4, 'custom', $5, true)
       RETURNING *`,
      [barbershopId, nextOrder, label, emoji || '', response_message]
    );

    return sendCreated(res, result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.put('/config/menu/:id', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;
    const { label, emoji, active, response_message } = req.body;

    const existing = await pool.query(
      'SELECT * FROM whatsapp_menu_options WHERE id = $1 AND barbershop_id = $2',
      [id, barbershopId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Opção não encontrada' },
      });
    }

    const result = await pool.query(
      `UPDATE whatsapp_menu_options SET
          label = COALESCE($1, label),
          emoji = COALESCE($2, emoji),
          active = COALESCE($3, active),
          response_message = COALESCE($4, response_message),
          updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND barbershop_id = $6
       RETURNING *`,
      [label, emoji, active, response_message, id, barbershopId]
    );

    return sendSuccess(res, result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.delete('/config/menu/:id', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT * FROM whatsapp_menu_options WHERE id = $1 AND barbershop_id = $2',
      [id, barbershopId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Opção não encontrada' },
      });
    }

    if (existing.rows[0].type === 'system') {
      return res.status(400).json({
        success: false,
        error: { message: 'Opções do sistema não podem ser excluídas. Desative-as.' },
      });
    }

    const deletedOrder = existing.rows[0].option_order;

    await pool.query(
      'DELETE FROM whatsapp_menu_options WHERE id = $1 AND barbershop_id = $2',
      [id, barbershopId]
    );

    await pool.query(
      `UPDATE whatsapp_menu_options
       SET option_order = option_order - 1, updated_at = CURRENT_TIMESTAMP
       WHERE barbershop_id = $1 AND option_order > $2`,
      [barbershopId, deletedOrder]
    );

    return sendSuccess(res, { message: 'Opção excluída com sucesso' });
  } catch (error) {
    return next(error);
  }
});

router.put('/config/menu-reorder', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Array de IDs é obrigatório' },
      });
    }

    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE whatsapp_menu_options
         SET option_order = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND barbershop_id = $3`,
        [-(i + 1), order[i], barbershopId]
      );
    }

    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE whatsapp_menu_options
         SET option_order = $1
         WHERE id = $2 AND barbershop_id = $3`,
        [i + 1, order[i], barbershopId]
      );
    }

    const result = await pool.query(
      'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
      [barbershopId]
    );

    return sendSuccess(res, result.rows);
  } catch (error) {
    return next(error);
  }
});

router.post('/config/menu/reset', ...waProtected, async (req, res, next) => {
  try {
    const { barbershopId } = req.user;

    await pool.query(
      'DELETE FROM whatsapp_menu_options WHERE barbershop_id = $1',
      [barbershopId]
    );

    for (const opt of DEFAULT_MENU_OPTIONS) {
      await pool.query(
        `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
         VALUES ($1, $2, $3, $4, 'system', $5, true)`,
        [barbershopId, opt.order, opt.label, opt.emoji, opt.handler]
      );
    }

    const result = await pool.query(
      'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
      [barbershopId]
    );

    return sendSuccess(res, result.rows);
  } catch (error) {
    return next(error);
  }
});

export default router;
