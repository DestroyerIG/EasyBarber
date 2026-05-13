import crypto from 'crypto';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
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
import { updateInstanceFromPayload } from '../services/whatsapp/whatsappInstanceCache.js';
import { getBarbershopWhatsAppInstanceContext } from '../services/whatsapp/whatsappInstanceService.js';
import { getBotConfig } from '../services/whatsapp/whatsappConfigService.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';
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

const router = Router();
const waProtected = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

// ─── Types ───────────────────────────────────────────────────────────────────

interface DisconnectedStatusPayload {
  [key: string]: unknown;
  status: string;
  qrCode: null;
  error: null;
  connectedNumber: null;
  connectedName: null;
  provider: string;
  instanceName?: string;
}

interface WhatsAppContext {
  [key: string]: unknown;
  barbershopId: string | null;
  instanceName: string | null;
}

interface SimulatorBarbershopContextOk {
  ok: true;
  barbershopId: string;
  source: string;
}

interface SimulatorBarbershopContextErr {
  ok: false;
  statusCode: number;
  code: string;
  message: string;
  reason: string;
  source: string | null;
  error?: unknown;
}

type SimulatorBarbershopContext = SimulatorBarbershopContextOk | SimulatorBarbershopContextErr;

interface AuthorExtraction {
  phone: string | null;
  source: string;
  isLid: boolean;
  lidJid: string | null;
}

interface ResolvedExtraction {
  authorPhone: string | null;
  sourcePath?: string | null;
  candidateType?: string | null;
  confidence?: string;
  resolutionRule?: string | null;
  remoteJidOriginal?: string | null;
  candidates?: unknown[];
  rejections?: unknown[];
  instanceNumbers?: unknown[];
  sender?: string | null;
  participant?: string | null;
  fromMe?: boolean;
}

interface IncomingWebhookMessage {
  payload: Record<string, unknown>;
  eventName: string;
  extractedPhone: string;
  extractedText: string;
  lidJid: string | null;
  allowLidDirect: boolean;
  extraction: ResolvedExtraction & {
    instanceName: string | null;
    lidJid: string | null;
    allowLidDirect: boolean;
  };
}

interface DedupeResult {
  deduped: boolean;
  dedupeKey: string;
  messageId: string | null;
}

interface DefaultMenuOption {
  order: number;
  label: string;
  emoji: string;
  handler: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const buildDisconnectedStatusPayload = (instanceName: string | null = null): DisconnectedStatusPayload => ({
  status: 'disconnected',
  qrCode: null,
  error: null,
  connectedNumber: null,
  connectedName: null,
  provider: 'evolution',
  ...(instanceName ? { instanceName } : {}),
});

const resolveAuthenticatedWhatsAppContext = async (req: Request): Promise<WhatsAppContext> => {
  const barbershopId = req.user?.barbershopId ?? null;

  if (!barbershopId) {
    return {
      barbershopId: null,
      instanceName: null,
    };
  }

  const context = await getBarbershopWhatsAppInstanceContext(barbershopId);

  return {
    barbershopId,
    instanceName: (context as { whatsappInstanceName?: string | null }).whatsappInstanceName ?? null,
  };
};

const normalizeSimulatorBarbershopId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const resolveSimulatorBarbershopContext = async ({
  payloadBarbershopId,
  authBarbershopId,
}: {
  payloadBarbershopId: string | null;
  authBarbershopId: string | null;
}): Promise<SimulatorBarbershopContext> => {
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

  const resolvedBarbershopId = payloadBarbershopId ?? authBarbershopId;
  const contextSource = payloadBarbershopId ? 'payload' : 'auth';

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM barbershops WHERE id = ${resolvedBarbershopId}::uuid LIMIT 1`
    );

    if (!rows.length) {
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

const WEBHOOK_MESSAGE_DEDUPE = new Map<string, { expiresAt: number }>();
const WEBHOOK_DEDUPE_TTL_MS = 10 * 60 * 1000;
const WEBHOOK_FALLBACK_DEDUPE_TTL_MS = 15 * 1000;
const WEBHOOK_DEDUPE_MAX_KEYS = 10000;

const normalizeWebhookEventName = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

const INCOMING_WEBHOOK_EVENTS = new Set<string>([
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

const isIncomingWebhookEvent = (eventName: string, { allowEmpty = true }: { allowEmpty?: boolean } = {}): boolean => {
  const normalized = normalizeWebhookEventName(eventName);

  if (!normalized) {
    return allowEmpty;
  }

  return INCOMING_WEBHOOK_EVENTS.has(normalized);
};

const isWebhookBooleanTrue = (value: unknown): boolean => {
  if (value === true) return true;
  if (value === 1) return true;

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const mergePlainObjects = (...values: unknown[]): Record<string, unknown> | null => {
  const plainValues = values.filter(isPlainObject) as Record<string, unknown>[];

  if (!plainValues.length) {
    return null;
  }

  const result: Record<string, unknown> = {};

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

const extractTextFromMessageContent = (messageContent: unknown, depth = 0): string | null => {
  if (!messageContent || typeof messageContent !== 'object' || depth > 8) {
    return null;
  }

  const mc = messageContent as Record<string, unknown>;

  const directText = [
    mc['conversation'],
    (mc['extendedTextMessage'] as Record<string, unknown> | undefined)?.['text'],
    (mc['extendedTextMessage'] as Record<string, unknown> | undefined)?.['caption'],
    (mc['imageMessage'] as Record<string, unknown> | undefined)?.['caption'],
    (mc['videoMessage'] as Record<string, unknown> | undefined)?.['caption'],
    (mc['documentMessage'] as Record<string, unknown> | undefined)?.['caption'],
    ((mc['documentWithCaptionMessage'] as Record<string, unknown> | undefined)?.['message'] as Record<string, unknown> | undefined)?.['documentMessage'] as string | undefined,
  ].find((value) => typeof value === 'string' && (value as string).trim());

  if (directText) {
    return String(directText).trim();
  }

  const protocolMessage = mc['protocolMessage'] as Record<string, unknown> | undefined;
  const editedMessage = protocolMessage?.['editedMessage'];
  if (editedMessage && typeof editedMessage === 'object') {
    const editedText = extractTextFromMessageContent(editedMessage, depth + 1);
    if (editedText) {
      return editedText;
    }
  }

  for (const wrapperKey of WEBHOOK_MESSAGE_WRAPPER_KEYS) {
    const wrapperNode = mc[wrapperKey];
    if (!wrapperNode || typeof wrapperNode !== 'object') {
      continue;
    }

    const wrapperObj = wrapperNode as Record<string, unknown>;
    const nestedMessage =
      wrapperObj['message'] && typeof wrapperObj['message'] === 'object'
        ? wrapperObj['message']
        : wrapperNode;

    const nestedText = extractTextFromMessageContent(nestedMessage, depth + 1);
    if (nestedText) {
      return nestedText;
    }
  }

  return null;
};

const extractWebhookText = (payload: Record<string, unknown>): string | null => {
  const data = payload['data'] as Record<string, unknown> | undefined;
  const dataMessages = Array.isArray(data?.['messages']) ? (data!['messages'] as Record<string, unknown>[]) : [];
  const rootMessages = Array.isArray(payload['messages']) ? (payload['messages'] as Record<string, unknown>[]) : [];
  const dm0 = dataMessages[0] as Record<string, unknown> | undefined;
  const rm0 = rootMessages[0] as Record<string, unknown> | undefined;
  const dm0msg = dm0?.['message'] as Record<string, unknown> | undefined;
  const rm0msg = rm0?.['message'] as Record<string, unknown> | undefined;
  const dataMsg = data?.['message'] as Record<string, unknown> | undefined;

  const directText = [
    payload['message'],
    payload['text'],
    payload['body'],
    data?.['message'],
    data?.['text'],
    data?.['body'],
    dm0msg?.['conversation'],
    (dm0msg?.['extendedTextMessage'] as Record<string, unknown> | undefined)?.['text'],
    (dm0msg?.['extendedTextMessage'] as Record<string, unknown> | undefined)?.['caption'],
    (dm0msg?.['imageMessage'] as Record<string, unknown> | undefined)?.['caption'],
    (dm0msg?.['videoMessage'] as Record<string, unknown> | undefined)?.['caption'],
    rm0msg?.['conversation'],
    (rm0msg?.['extendedTextMessage'] as Record<string, unknown> | undefined)?.['text'],
    (rm0msg?.['extendedTextMessage'] as Record<string, unknown> | undefined)?.['caption'],
    (rm0msg?.['imageMessage'] as Record<string, unknown> | undefined)?.['caption'],
    (rm0msg?.['videoMessage'] as Record<string, unknown> | undefined)?.['caption'],
  ].find((value) => typeof value === 'string' && (value as string).trim());

  if (directText) {
    return String(directText).trim();
  }

  const messageNodes = [
    payload['message'],
    dataMsg,
    dm0msg,
    rm0msg,
  ];

  for (const messageNode of messageNodes) {
    const extractedText = extractTextFromMessageContent(messageNode);
    if (extractedText) {
      return extractedText;
    }
  }

  return null;
};

interface ParsedWebhookPayload {
  payload: Record<string, unknown>;
  bodyType: string;
  parseError: string | null;
}

const parseWebhookPayload = (rawBody: unknown): ParsedWebhookPayload => {
  if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
    return {
      payload: rawBody as Record<string, unknown>,
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
      const parsed: unknown = JSON.parse(trimmedBody);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          payload: parsed as Record<string, unknown>,
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
        parseError: `json_parse_error:${(error as Error)?.message ?? 'unknown_error'}`,
      };
    }
  }

  return {
    payload: {},
    bodyType: rawBody === null ? 'null' : typeof rawBody,
    parseError: 'unsupported_body_type',
  };
};

const getWebhookPayloadSize = (payload: Record<string, unknown> = {}): number | null => {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    return null;
  }
};

const buildPayloadLogSummary = (payload: Record<string, unknown> = {}): Record<string, unknown> => {
  const data = payload['data'] as Record<string, unknown> | undefined;
  const dataMessages = Array.isArray(data?.['messages']) ? (data!['messages'] as Record<string, unknown>[]) : [];
  const rootMessages = Array.isArray(payload['messages']) ? (payload['messages'] as Record<string, unknown>[]) : [];

  return {
    payloadKeys: Object.keys(payload ?? {}),
    payloadSizeBytes: getWebhookPayloadSize(payload),
    hasMessagesArray: Array.isArray(payload['messages']) || Array.isArray(data?.['messages']),
    messageCount:
      (Array.isArray(payload['messages']) ? rootMessages.length : 0) ||
      (Array.isArray(data?.['messages']) ? dataMessages.length : 0),
    remoteJid:
      (payload['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ??
      (data?.['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ??
      (dataMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ??
      (rootMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ??
      null,
    instanceName:
      payload['instanceName'] ??
      (payload['instance'] as Record<string, unknown> | undefined)?.['instanceName'] ??
      payload['owner'] ??
      data?.['instanceName'] ??
      (data?.['instance'] as Record<string, unknown> | undefined)?.['instanceName'] ??
      data?.['owner'] ??
      (payload['message'] as Record<string, unknown> | undefined)?.['instanceName'] ??
      (payload['message'] as Record<string, unknown> | undefined)?.['owner'] ??
      dataMessages[0]?.['instanceName'] ??
      dataMessages[0]?.['owner'] ??
      rootMessages[0]?.['instanceName'] ??
      rootMessages[0]?.['owner'] ??
      null,
  };
};

const buildAuthorSignalShape = (payload: Record<string, unknown> = {}): Record<string, unknown> => {
  const data = payload['data'] as Record<string, unknown> | undefined;
  const key = payload['key'] as Record<string, unknown> | undefined;
  const dataKey = data?.['key'] as Record<string, unknown> | undefined;
  const dataMessages = Array.isArray(data?.['messages']) ? (data!['messages'] as Record<string, unknown>[]) : [];
  const rootMessages = Array.isArray(payload['messages']) ? (payload['messages'] as Record<string, unknown>[]) : [];
  const dm0 = dataMessages[0] as Record<string, unknown> | undefined;
  const rm0 = rootMessages[0] as Record<string, unknown> | undefined;
  const dm0key = dm0?.['key'] as Record<string, unknown> | undefined;
  const rm0key = rm0?.['key'] as Record<string, unknown> | undefined;
  const dm0msgKey = (dm0?.['message'] as Record<string, unknown> | undefined)?.['key'] as Record<string, unknown> | undefined;
  const rm0msgKey = (rm0?.['message'] as Record<string, unknown> | undefined)?.['key'] as Record<string, unknown> | undefined;

  return {
    keyRemoteJid:
      key?.['remoteJid'] ?? dataKey?.['remoteJid'] ?? dm0msgKey?.['remoteJid'] ?? dm0key?.['remoteJid'] ??
      rm0msgKey?.['remoteJid'] ?? rm0key?.['remoteJid'] ?? null,
    sender:
      payload['sender'] ?? data?.['sender'] ?? dm0?.['sender'] ?? rm0?.['sender'] ?? null,
    from:
      payload['from'] ?? data?.['from'] ?? dm0?.['from'] ?? rm0?.['from'] ?? null,
    participant:
      payload['participant'] ?? key?.['participant'] ?? data?.['participant'] ?? dataKey?.['participant'] ??
      dm0msgKey?.['participant'] ?? dm0?.['participant'] ?? dm0key?.['participant'] ??
      rm0msgKey?.['participant'] ?? rm0?.['participant'] ?? rm0key?.['participant'] ?? null,
    senderPn: null,
    participantPn: null,
    hasContextInfo: Boolean(
      payload['contextInfo'] ?? (payload['message'] as Record<string, unknown> | undefined)?.['contextInfo'] ??
      data?.['contextInfo'] ?? (data?.['message'] as Record<string, unknown> | undefined)?.['contextInfo'] ??
      (dm0?.['message'] as Record<string, unknown> | undefined)?.['contextInfo'] ??
      (rm0?.['message'] as Record<string, unknown> | undefined)?.['contextInfo']
    ),
    hasMessageContextInfo: Boolean(
      payload['messageContextInfo'] ?? (payload['message'] as Record<string, unknown> | undefined)?.['messageContextInfo'] ??
      data?.['messageContextInfo'] ?? (data?.['message'] as Record<string, unknown> | undefined)?.['messageContextInfo'] ??
      dm0?.['messageContextInfo'] ?? (dm0?.['message'] as Record<string, unknown> | undefined)?.['messageContextInfo'] ??
      rm0?.['messageContextInfo'] ?? (rm0?.['message'] as Record<string, unknown> | undefined)?.['messageContextInfo']
    ),
  };
};

const logWebhookReceipt = ({
  req,
  route,
  eventName = null,
  payload = {},
  parseError = null,
  bodyType = null,
}: {
  req: Request;
  route: string;
  eventName?: string | null;
  payload?: Record<string, unknown>;
  parseError?: string | null;
  bodyType?: string | null;
}): void => {
  logger.info(
    {
      requestId: (req as Request & { id?: string })['id'] ?? null,
      route,
      event: eventName,
      parseError,
      bodyType,
    },
    'WEBHOOK RECEBIDO'
  );

  logger.info(
    {
      requestId: (req as Request & { id?: string })['id'] ?? null,
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
      requestId: (req as Request & { id?: string })['id'] ?? null,
      route,
      event: eventName,
      ...buildPayloadLogSummary(payload),
    },
    'Webhook WhatsApp payload resumido'
  );
};

const extractWebhookFromMe = (payload: Record<string, unknown>): boolean => {
  const key = payload['key'] as Record<string, unknown> | undefined;
  const data = payload['data'] as Record<string, unknown> | undefined;
  const dataKey = data?.['key'] as Record<string, unknown> | undefined;
  const dataMessages = Array.isArray(data?.['messages']) ? (data!['messages'] as Record<string, unknown>[]) : [];
  const rootMessages = Array.isArray(payload['messages']) ? (payload['messages'] as Record<string, unknown>[]) : [];
  const dm0 = dataMessages[0] as Record<string, unknown> | undefined;
  const rm0 = rootMessages[0] as Record<string, unknown> | undefined;

  const candidates = [
    payload['fromMe'],
    key?.['fromMe'],
    data?.['fromMe'],
    dataKey?.['fromMe'],
    (dm0?.['message'] as Record<string, unknown> | undefined)?.['key'] && ((dm0?.['message'] as Record<string, unknown>)['key'] as Record<string, unknown>)['fromMe'],
    (dm0?.['key'] as Record<string, unknown> | undefined)?.['fromMe'],
    (rm0?.['message'] as Record<string, unknown> | undefined)?.['key'] && ((rm0?.['message'] as Record<string, unknown>)['key'] as Record<string, unknown>)['fromMe'],
    (rm0?.['key'] as Record<string, unknown> | undefined)?.['fromMe'],
  ];

  return candidates.some((value) => isWebhookBooleanTrue(value));
};

const normalizeWebhookEventPayload = (payload: Record<string, unknown> = {}, forcedEvent: string | null = null): Record<string, unknown> => {
  const dataNode = payload['data'] && typeof payload['data'] === 'object' ? (payload['data'] as Record<string, unknown>) : null;
  const dataMessage = dataNode?.['message'] && typeof dataNode['message'] === 'object' ? (dataNode['message'] as Record<string, unknown>) : null;
  const dataUpsertMessage =
    Array.isArray(dataNode?.['messages']) && (dataNode!['messages'] as unknown[])[0] && typeof (dataNode!['messages'] as unknown[])[0] === 'object'
      ? ((dataNode!['messages'] as unknown[])[0] as Record<string, unknown>)
      : null;
  const rootUpsertMessage =
    Array.isArray(payload['messages']) && (payload['messages'] as unknown[])[0] && typeof (payload['messages'] as unknown[])[0] === 'object'
      ? ((payload['messages'] as unknown[])[0] as Record<string, unknown>)
      : null;
  const messageNode = dataUpsertMessage ?? rootUpsertMessage ?? dataMessage;

  const key =
    mergePlainObjects(
      payload['key'],
      (payload['message'] as Record<string, unknown> | undefined)?.['key'],
      dataNode?.['key'],
      dataMessage?.['key'],
      messageNode?.['key']
    ) ??
    messageNode?.['key'] ??
    payload['key'] ??
    (payload['message'] as Record<string, unknown> | undefined)?.['key'] ??
    dataNode?.['key'] ??
    null;

  const mergedMessage =
    mergePlainObjects(
      isPlainObject(payload['message']) ? payload['message'] : null,
      isPlainObject(dataNode?.['message']) ? dataNode!['message'] : null,
      isPlainObject(dataMessage) ? dataMessage : null,
      isPlainObject(messageNode?.['message']) ? messageNode!['message'] : null
    );

  const message =
    mergedMessage ??
    messageNode?.['message'] ??
    payload['message'] ??
    dataNode?.['message'] ??
    null;

  const resolvedSender =
    payload['sender'] ??
    dataNode?.['sender'] ??
    messageNode?.['sender'] ??
    null;

  const resolvedFrom =
    payload['from'] ??
    dataNode?.['from'] ??
    messageNode?.['from'] ??
    null;

  const resolvedInstanceName =
    payload['instanceName'] ??
    (payload['instance'] as Record<string, unknown> | undefined)?.['instanceName'] ??
    payload['owner'] ??
    dataNode?.['instanceName'] ??
    (dataNode?.['instance'] as Record<string, unknown> | undefined)?.['instanceName'] ??
    dataNode?.['owner'] ??
    messageNode?.['instanceName'] ??
    (messageNode?.['instance'] as Record<string, unknown> | undefined)?.['instanceName'] ??
    messageNode?.['owner'] ??
    null;

  const preservedDestination =
    payload['destination'] ??
    dataNode?.['destination'] ??
    messageNode?.['destination'];

  return {
    ...payload,
    ...(dataNode ?? {}),
    ...(messageNode ?? {}),
    key: key ?? undefined,
    message: message ?? undefined,
    ...(preservedDestination !== undefined ? { destination: preservedDestination } : {}),
    contextInfo:
      mergePlainObjects(
        payload['contextInfo'],
        dataNode?.['contextInfo'],
        messageNode?.['contextInfo'],
        (message as Record<string, unknown> | undefined)?.['contextInfo']
      ) ?? undefined,
    messageContextInfo:
      mergePlainObjects(
        payload['messageContextInfo'],
        dataNode?.['messageContextInfo'],
        messageNode?.['messageContextInfo'],
        (message as Record<string, unknown> | undefined)?.['messageContextInfo']
      ) ?? undefined,
    sender: resolvedSender,
    from: resolvedFrom,
    instanceName: resolvedInstanceName,
    event:
      forcedEvent ??
      payload['event'] ??
      payload['type'] ??
      dataNode?.['event'] ??
      dataNode?.['type'] ??
      null,
    type:
      payload['type'] ??
      payload['event'] ??
      dataNode?.['type'] ??
      dataNode?.['event'] ??
      forcedEvent ??
      null,
  };
};

const getConfidenceRank = (value: string | undefined): number => {
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

const selectAuthorExtraction = (normalizedExtraction: ResolvedExtraction, rawExtraction: ResolvedExtraction | null = null): ResolvedExtraction => {
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
        ? (rawExtraction.candidates as Record<string, unknown>[]).map((candidate) => ({
            ...candidate,
            sourcePath: candidate?.['sourcePath'] ? `raw.${candidate['sourcePath']}` : 'raw',
          }))
        : []),
    ],
    rejections: [
      ...(Array.isArray(normalizedExtraction?.rejections) ? normalizedExtraction.rejections : []),
      ...(Array.isArray(rawExtraction?.rejections)
        ? (rawExtraction.rejections as Record<string, unknown>[]).map((item) => ({
            ...item,
            sourcePath: item?.['sourcePath'] ? `raw.${item['sourcePath']}` : 'raw',
          }))
        : []),
      {
        sourcePath: 'raw_vs_normalized',
        reason: 'ambiguous_author_between_payload_shapes',
      },
    ],
  };
};

const resolveConnectedNumberFromDatabase = async (instanceName: string | null = null): Promise<string | null> => {
  if (typeof instanceName !== 'string' || !instanceName.trim()) {
    return null;
  }

  const normalizedInstanceName = instanceName.trim().toLowerCase();

  try {
    const rows = await prisma.$queryRaw<{ whatsapp: string | null }[]>(
      Prisma.sql`SELECT whatsapp
         FROM barbershops
        WHERE active = true
          AND NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
          AND lower(btrim(whatsapp_instance_name)) = ${normalizedInstanceName}
        LIMIT 1`
    );

    if (!rows.length) {
      return null;
    }

    return normalizeWhatsAppNumber(rows[0]?.whatsapp ?? null);
  } catch (error) {
    logger.warn(
      { err: error, instanceName: normalizedInstanceName },
      'Falha ao resolver connectedNumber via banco no webhook'
    );
    return null;
  }
};

const resolveConnectedNumberForWebhook = async (instanceName: string | null = null, payload: Record<string, unknown> = {}): Promise<string | null> => {
  const payloadDestination = extractPayloadDestination(payload);
  if (payloadDestination) {
    updateInstanceFromPayload(instanceName, payload, 'webhook');
    return payloadDestination;
  }

  const cached = getConnectedNumberCached(instanceName);
  if (cached) {
    return cached;
  }

  const dbNumber = await resolveConnectedNumberFromDatabase(instanceName);
  if (dbNumber) {
    return dbNumber;
  }

  return null;
};

const buildWebhookPhoneExtractionOptions = (instanceName: string | null = null, connectedNumberOverride: string | null = null): Record<string, unknown> => {
  const connectedNumber =
    normalizeWhatsAppNumber(connectedNumberOverride) ?? getConnectedNumberCached(instanceName);

  if (!connectedNumber) {
    return {};
  }

  return {
    connectedNumbers: [connectedNumber],
  };
};

const isLidJid = (jid: unknown): boolean =>
  typeof jid === 'string' && jid.endsWith('@lid');

const extractAuthorPhone = (payload: Record<string, unknown>, connectedNumber: string | null): AuthorExtraction => {
  const dataMessages = Array.isArray((payload['data'] as Record<string, unknown> | undefined)?.['messages'])
    ? ((payload['data'] as Record<string, unknown>)['messages'] as Record<string, unknown>[])
    : [];
  const rootMessages = Array.isArray(payload['messages']) ? (payload['messages'] as Record<string, unknown>[]) : [];
  const msg = (dataMessages[0] ?? rootMessages[0] ?? payload) as Record<string, unknown>;
  const key = (msg['key'] ?? payload['key'] ?? {}) as Record<string, unknown>;
  const remoteJid = (key['remoteJid'] ?? (payload['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ?? null) as string | null;
  const participant = (key['participant'] ?? payload['participant'] ?? null) as string | null;
  const sender = (payload['sender'] ?? null) as string | null;

  const msgContextInfo = msg['messageContextInfo'] as Record<string, unknown> | undefined;
  const payloadContextInfo = payload['messageContextInfo'] as Record<string, unknown> | undefined;
  const msgMsgContextInfo = (msg['message'] as Record<string, unknown> | undefined)?.['messageContextInfo'] as Record<string, unknown> | undefined;

  const participantPn =
    (msgContextInfo?.['participantPn'] ?? payloadContextInfo?.['participantPn'] ?? msgMsgContextInfo?.['participantPn'] ?? null) as string | null;

  if (participantPn) {
    const phone = normalizePhone(participantPn);
    if (phone) {
      return {
        phone,
        source: 'participantPn',
        isLid: isLidJid(remoteJid),
        lidJid: isLidJid(remoteJid) ? remoteJid : null,
      };
    }
  }

  if (participant && !isLidJid(participant)) {
    const phone = normalizePhone(participant);
    if (phone) {
      return {
        phone,
        source: 'participant',
        isLid: isLidJid(remoteJid),
        lidJid: isLidJid(remoteJid) ? remoteJid : null,
      };
    }
  }

  if (isLidJid(remoteJid)) {
    if (sender) {
      const senderPhone = normalizePhone(sender);
      if (senderPhone && !isSelfMessage({ authorPhone: senderPhone, connectedNumber })) {
        return { phone: senderPhone, source: 'sender_lid_fallback', isLid: true, lidJid: remoteJid };
      }
    }
    // Evolution API v1 places the remote client's phone JID in payload.destination for incoming messages.
    // normalizePhone returns null for @lid JIDs so this safely falls through when destination is @lid.
    const destRaw = (payload['destination'] ?? null) as string | null;
    if (destRaw) {
      const destPhone = normalizePhone(destRaw);
      if (destPhone && !isSelfMessage({ authorPhone: destPhone, connectedNumber })) {
        return { phone: destPhone, source: 'destination_jid_fallback', isLid: true, lidJid: remoteJid };
      }
    }
    const lidDigits = remoteJid!.split('@')[0];
    if (lidDigits && lidDigits.length >= 10) {
      return { phone: lidDigits, source: 'lid_jid_direct', isLid: true, lidJid: remoteJid };
    }
    return { phone: null, source: 'lid_no_fallback', isLid: true, lidJid: null };
  }

  if (sender) {
    const senderPhone = normalizePhone(sender);
    if (senderPhone) {
      return { phone: senderPhone, source: 'sender', isLid: false, lidJid: null };
    }
  }

  if (remoteJid && !isLidJid(remoteJid)) {
    const phone = normalizePhone(remoteJid);
    if (phone) {
      return { phone, source: 'remoteJid', isLid: false, lidJid: null };
    }
  }

  return { phone: null, source: 'not_found', isLid: false, lidJid: null };
};

const mapWebhookIncomingMessage = async (payload: Record<string, unknown>): Promise<IncomingWebhookMessage | null> => {
  const normalizedPayload = normalizeWebhookEventPayload(payload);
  const eventName = normalizeWebhookEventName(
    normalizedPayload['event'] ?? normalizedPayload['type'] ?? ''
  );

  if (!isIncomingWebhookEvent(eventName)) {
    return null;
  }

  const fromMe = extractWebhookFromMe(payload);
  if (fromMe) {
    logger.info(
      {
        event: eventName,
        fromMe: true,
        remoteJid: (normalizedPayload['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ?? null,
        sender: normalizedPayload['sender'] ?? null,
      },
      'Webhook ignorado: fromMe=true'
    );
    return null;
  }

  if (
    (payload['key'] as Record<string, unknown> | undefined)?.['fromMe'] === true ||
    (normalizedPayload['key'] as Record<string, unknown> | undefined)?.['fromMe'] === true ||
    ((payload['data'] as Record<string, unknown> | undefined)?.['messages'] as Record<string, unknown>[] | undefined)?.[0]?.['key'] && (((payload['data'] as Record<string, unknown>)['messages'] as Record<string, unknown>[])[0]?.['key'] as Record<string, unknown> | undefined)?.['fromMe'] === true
  ) {
    logger.info({ event: eventName }, 'Webhook ignorado: key.fromMe=true explícito');
    return null;
  }

  const instanceName =
    (normalizedPayload['instanceName'] as string | null) ??
    (payload['instanceName'] as string | null) ??
    null;

  const connectedNumber = await resolveConnectedNumberForWebhook(instanceName, payload);

  const text = extractWebhookText(normalizedPayload);

  const extractionOptions = buildWebhookPhoneExtractionOptions(instanceName, connectedNumber);
  const extraction = resolveIncomingAuthor(normalizedPayload, { ...extractionOptions, messageText: text }) as ResolvedExtraction;
  const rawExtraction = resolveIncomingAuthor(payload, { ...extractionOptions, messageText: text }) as ResolvedExtraction;
  const resolvedExtraction = selectAuthorExtraction(extraction, rawExtraction);

  const authorExtracted = extractAuthorPhone(payload, connectedNumber);

  // When resolvedExtraction fell back to lid_sender_fallback_promoted (sender = bot's own number
  // in old 8-digit format), prefer the destination_jid_fallback result from extractAuthorPhone
  // which reads the actual client phone from payload.destination.
  const preferDestinationFallback =
    resolvedExtraction.resolutionRule === 'lid_sender_fallback_promoted' &&
    authorExtracted.source === 'destination_jid_fallback';
  const authorPhone = (preferDestinationFallback ? authorExtracted.phone : null)
    ?? resolvedExtraction.authorPhone
    ?? authorExtracted.phone
    ?? null;

  const effectiveLidJid = authorExtracted.lidJid ??
    (typeof resolvedExtraction.remoteJidOriginal === 'string' && resolvedExtraction.remoteJidOriginal.endsWith('@lid') ? resolvedExtraction.remoteJidOriginal : null);
  const authorIsLidDirect = authorExtracted.source === 'lid_jid_direct';

  const normalizedAuthor = authorPhone ? normalizePhone(authorPhone) : null;
  const normalizedConnected = connectedNumber ? normalizePhone(connectedNumber) : null;

  logger.info(
    {
      instanceName,
      authorPhone,
      connectedNumber,
      normalizedAuthor,
      normalizedConnected,
      fromMe,
      isSelf: false,
      event: eventName,
      authorSource: resolvedExtraction.authorPhone
        ? resolvedExtraction.sourcePath
        : authorExtracted.source,
      isLid: authorExtracted.isLid,
      hasText: Boolean(text),
    },
    'DEBUG WHATSAPP - AUTOR E NUMERO IDENTIFICADOS'
  );

  if (!authorPhone) {
    logger.warn(
      {
        event: eventName,
        instanceName,
        connectedNumber: connectedNumber ?? null,
        sourceTried: authorExtracted.source,
        isLid: authorExtracted.isLid,
        resolvedExtractionRule: resolvedExtraction.resolutionRule ?? null,
        remoteJid: (normalizedPayload['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ?? null,
        sender: normalizedPayload['sender'] ?? payload['sender'] ?? null,
      },
      'Webhook ignorado: não foi possível identificar o telefone do autor'
    );
    return null;
  }

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
      connectedNumber: connectedNumber ?? null,
      textPreview: text.slice(0, 60),
      resolutionRule: resolvedExtraction.resolutionRule ?? authorExtracted.source,
      isLid: authorExtracted.isLid,
      authorIsLidDirect,
      effectiveLidJid,
    },
    'WEBHOOK PROCESSADO: autor identificado, mensagem válida'
  );

  return {
    payload: normalizedPayload,
    eventName,
    extractedPhone: authorPhone,
    extractedText: text,
    lidJid: effectiveLidJid ?? null,
    allowLidDirect: authorIsLidDirect ?? false,
    extraction: {
      ...resolvedExtraction,
      authorPhone,
      instanceName,
      lidJid: effectiveLidJid ?? null,
      allowLidDirect: authorIsLidDirect ?? false,
    },
  };
};

const buildWebhookDebugFields = (payload: Record<string, unknown>, extraction: ResolvedExtraction | null = null): Record<string, unknown> => {
  const text = extractWebhookText(payload);
  const resolvedExtraction =
    extraction ??
    (resolveIncomingAuthor(payload, {
      ...buildWebhookPhoneExtractionOptions(),
      messageText: text,
    }) as ResolvedExtraction);

  return {
    keyRemoteJid: (payload['key'] as Record<string, unknown> | undefined)?.['remoteJid'] ?? null,
    messageKeyRemoteJid: ((payload['message'] as Record<string, unknown> | undefined)?.['key'] && ((payload['message'] as Record<string, unknown>)['key'] as Record<string, unknown>)['remoteJid']) ?? null,
    sender: resolvedExtraction.sender ?? payload['sender'] ?? null,
    participant: resolvedExtraction.participant ?? payload['participant'] ?? null,
    fromMe: resolvedExtraction.fromMe,
    from: payload['from'] ?? null,
    extractedPhone: resolvedExtraction.authorPhone,
    extractionSourcePath: resolvedExtraction.sourcePath,
    extractionCandidateType: resolvedExtraction.candidateType,
    extractionConfidence: resolvedExtraction.confidence,
    extractionResolutionRule: resolvedExtraction.resolutionRule ?? null,
    remoteJidOriginal: resolvedExtraction.remoteJidOriginal,
    authorCandidates: resolvedExtraction.candidates,
    extractionRejections: resolvedExtraction.rejections,
    instanceNumbers: resolvedExtraction.instanceNumbers,
    instanceName: payload['instanceName'] ?? null,
  };
};

const pruneWebhookDedupeCache = (): void => {
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

const extractWebhookMessageId = (payload: Record<string, unknown> = {}): string | null => {
  const data = payload['data'] as Record<string, unknown> | undefined;
  const dataMessages = Array.isArray(data?.['messages']) ? (data!['messages'] as Record<string, unknown>[]) : [];
  const rootMessages = Array.isArray(payload['messages']) ? (payload['messages'] as Record<string, unknown>[]) : [];

  const candidates = [
    (payload['key'] as Record<string, unknown> | undefined)?.['id'],
    (payload['message'] as Record<string, unknown> | undefined)?.['key'] && ((payload['message'] as Record<string, unknown>)['key'] as Record<string, unknown>)['id'],
    (data?.['key'] as Record<string, unknown> | undefined)?.['id'],
    (dataMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['id'],
    (rootMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['id'],
    (payload['key'] as Record<string, unknown> | undefined)?.['stanzaId'],
    (payload['message'] as Record<string, unknown> | undefined)?.['key'] && ((payload['message'] as Record<string, unknown>)['key'] as Record<string, unknown>)['stanzaId'],
    (data?.['key'] as Record<string, unknown> | undefined)?.['stanzaId'],
    (dataMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['stanzaId'],
    (rootMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['stanzaId'],
  ];

  return (
    candidates.find((value) => typeof value === 'string' && (value as string).trim())
      ? String(candidates.find((value) => typeof value === 'string' && (value as string).trim())).trim()
      : null
  );
};

const extractWebhookMessageTimestamp = (payload: Record<string, unknown> = {}): string | null => {
  const data = payload['data'] as Record<string, unknown> | undefined;
  const dataMessages = Array.isArray(data?.['messages']) ? (data!['messages'] as Record<string, unknown>[]) : [];
  const rootMessages = Array.isArray(payload['messages']) ? (payload['messages'] as Record<string, unknown>[]) : [];

  const candidates = [
    (payload['key'] as Record<string, unknown> | undefined)?.['messageTimestamp'],
    (payload['message'] as Record<string, unknown> | undefined)?.['key'] && ((payload['message'] as Record<string, unknown>)['key'] as Record<string, unknown>)['messageTimestamp'],
    (data?.['key'] as Record<string, unknown> | undefined)?.['messageTimestamp'],
    (dataMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['messageTimestamp'],
    (rootMessages[0]?.['key'] as Record<string, unknown> | undefined)?.['messageTimestamp'],
    (payload['key'] as Record<string, unknown> | undefined)?.['timestamp'],
    (data?.['key'] as Record<string, unknown> | undefined)?.['timestamp'],
    payload['timestamp'],
    data?.['timestamp'],
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
}: {
  payload: Record<string, unknown>;
  eventName: string;
  extractedPhone: string;
  extractedText: string;
}): DedupeResult => {
  pruneWebhookDedupeCache();

  const messageId = extractWebhookMessageId(payload);
  let dedupeKey: string;
  let ttlMs = WEBHOOK_DEDUPE_TTL_MS;

  if (messageId) {
    dedupeKey = `id:${messageId}`;
  } else {
    ttlMs = WEBHOOK_FALLBACK_DEDUPE_TTL_MS;

    const remoteJid = extractWhatsAppRemoteJidFromWebhook(payload) ?? '';
    const messageTimestamp = extractWebhookMessageTimestamp(payload) ?? '';
    const normalizedText = String(extractedText ?? '').trim().toLowerCase();
    const seed = [
      normalizeWebhookEventName(eventName),
      extractedPhone ?? '',
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
router.post('/webhook', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      sendSuccess(res, {
        received: true,
        processed: false,
        ignored: true,
        reason: 'from_me',
      });
      return;
    }

    logWebhookReceipt({
      req,
      route: '/api/v1/whatsapp/webhook',
      eventName: normalizeWebhookEventName(payload['event'] ?? payload['type'] ?? ''),
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
          event: normalizedPayload['event'] ?? normalizedPayload['type'],
          fromMe: extractWebhookFromMe(normalizedPayload),
          parseError,
          durationMs: Date.now() - startedAt,
        },
        'Webhook ignorado sem payload de mensagem util'
      );

      sendSuccess(res, { received: true, processed: false });
      return;
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

      sendSuccess(res, {
        received: true,
        processed: false,
        deduped: true,
        reason: 'duplicate_message',
      });
      return;
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
      preExtractedInstanceNumbers: (incoming.extraction?.instanceNumbers ?? []) as string[],
      preResolvedAuthorExtraction: incoming.extraction as unknown as import('../services/whatsapp/whatsappFlowService.js').PhoneExtraction | null,
      eventName: incoming.eventName,
      dedupeKey: dedupe.dedupeKey,
      messageId: dedupe.messageId ?? undefined,
      lidJid: incoming.lidJid ?? undefined,
      allowLidDirect: incoming.allowLidDirect ?? false,
    }) as { ok?: boolean; ignored?: boolean; reason?: string } | null;

    logger.debug(
      {
        phone: debugFields['extractedPhone'],
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

    sendSuccess(res, {
      received: true,
      processed: Boolean(result?.ok),
      deduped: false,
      ignored: Boolean(result?.ignored),
      reason: result?.reason ?? null,
    });
  } catch (error) {
    next(error);
  }
});

// Webhook Evolution API — sub-rotas: /webhook/messages-upsert, /webhook/chats-update, etc.
router.post('/webhook/:event', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const startedAt = Date.now();
    const eventName = normalizeWebhookEventName(req.params['event'] ?? '');
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

      sendSuccess(res, {
        received: true,
        processed: false,
        ignored: true,
        reason: 'from_me',
      });
      return;
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
      sendSuccess(res, { received: true, processed: false });
      return;
    }

    const incoming = await mapWebhookIncomingMessage({
      ...payload,
      event: eventName,
    });

    if (!incoming) {
      logger.debug(
        {
          event: eventName,
          fromMe: extractWebhookFromMe(payload),
          parseError,
          durationMs: Date.now() - startedAt,
        },
        'Webhook Evolution sub-rota sem payload util'
      );

      sendSuccess(res, { received: true, processed: false });
      return;
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

      sendSuccess(res, {
        received: true,
        processed: false,
        deduped: true,
        reason: 'duplicate_message',
      });
      return;
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
      preExtractedInstanceNumbers: (incoming.extraction?.instanceNumbers ?? []) as string[],
      eventName: incoming.eventName,
      dedupeKey: dedupe.dedupeKey,
      messageId: dedupe.messageId ?? undefined,
      lidJid: incoming.lidJid ?? undefined,
      allowLidDirect: incoming.allowLidDirect ?? false,
    }) as { ok?: boolean; ignored?: boolean; reason?: string } | null;

    logger.debug(
      {
        event: eventName,
        phone: debugFields['extractedPhone'],
        dedupeKey: dedupe.dedupeKey,
        messageId: dedupe.messageId,
        processed: result?.ok,
        ignored: result?.ignored,
        reason: result?.reason,
        durationMs: Date.now() - startedAt,
      },
      'Resultado do processamento de mensagem WhatsApp'
    );

    sendSuccess(res, {
      received: true,
      processed: Boolean(result?.ok),
      deduped: false,
      ignored: Boolean(result?.ignored),
      reason: result?.reason ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/simulator/message', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const text = typeof body['text'] === 'string' ? body['text'].trim() : '';
    const fallbackPhone = '5511999999999';
    const phone = normalizeWhatsAppNumber(body['phone']) ?? fallbackPhone;
    const payloadBarbershopId = normalizeSimulatorBarbershopId(body['barbershopId']);
    const authBarbershopId = normalizeSimulatorBarbershopId(req.user?.barbershopId);
    const pushName =
      typeof body['pushName'] === 'string' && body['pushName'].trim()
        ? body['pushName'].trim()
        : 'Simulador';

    logger.info(
      {
        payloadBarbershopId,
        authBarbershopId,
      },
      'Simulador WhatsApp: contexto recebido'
    );

    if (!text) {
      sendError(
        res,
        400,
        'WHATSAPP_SIMULATOR_INVALID_PAYLOAD',
        'Campo text e obrigatorio'
      );
      return;
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

      sendError(res, context.statusCode, context.code, context.message);
      return;
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
    const payload: Record<string, unknown> = {
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

    const botResponses: string[] = [];

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
    }) as { ok?: boolean; ignored?: boolean; reason?: string } | null;

    if (result?.reason === 'barbershop_not_resolved') {
      logger.warn(
        {
          barbershopId: context.barbershopId,
          contextSource: context.source,
          reason: result.reason,
        },
        'Simulador WhatsApp: fluxo retornou contexto nao resolvido'
      );

      sendError(
        res,
        422,
        'WHATSAPP_SIMULATOR_CONTEXT_UNRESOLVED',
        'Nao foi possivel resolver o contexto da barbearia no simulador'
      );
      return;
    }

    const lastBotResponse = botResponses.length > 0 ? botResponses[botResponses.length - 1] : null;

    sendSuccess(res, {
      received: true,
      processed: Boolean(result?.ok),
      ignored: Boolean(result?.ignored),
      reason: result?.reason ?? null,
      botResponses,
      lastBotResponse,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== STATUS E CONEXÃO ====================

router.get('/status', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);

    if (!tenantContext.instanceName) {
      sendSuccess(res, buildDisconnectedStatusPayload());
      return;
    }

    const status = await refreshWhatsAppStatus(tenantContext);
    sendSuccess(res, {
      ...status,
      instanceName: tenantContext.instanceName,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/connect', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantContext = { barbershopId: req.user.barbershopId };
    const connected = await connectWhatsApp(tenantContext);
    const resolvedContext = await resolveAuthenticatedWhatsAppContext(req);
    const status = resolvedContext.instanceName
      ? getWhatsAppStatusByInstance(resolvedContext.instanceName)
      : buildDisconnectedStatusPayload();

    if (!connected && ((status as Record<string, unknown>)['status'] === 'provider_unavailable' || (status as Record<string, unknown>)['status'] === 'unavailable')) {
      sendError(
        res,
        503,
        'WHATSAPP_PROVIDER_UNAVAILABLE',
        (status as Record<string, unknown>)['error'] as string || 'Evolution API indisponivel'
      );
      return;
    }

    if (!connected && (status as Record<string, unknown>)['status'] === 'instance_not_found') {
      sendError(
        res,
        404,
        'WHATSAPP_INSTANCE_NOT_FOUND',
        (status as Record<string, unknown>)['error'] as string || 'Instancia configurada nao existe na Evolution API'
      );
      return;
    }

    sendSuccess(res, {
      ...status,
      instanceName: resolvedContext.instanceName,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/initialize', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantContext = { barbershopId: req.user.barbershopId };
    const result = await initializeWhatsAppInstance(tenantContext) as { ok?: boolean; status?: Record<string, unknown> } | null;
    const status = result?.status ?? getWhatsAppStatus();

    if (!result?.ok && ((status as Record<string, unknown>)['status'] === 'provider_unavailable' || (status as Record<string, unknown>)['status'] === 'unavailable')) {
      sendError(
        res,
        503,
        'WHATSAPP_PROVIDER_UNAVAILABLE',
        (status as Record<string, unknown>)['error'] as string || 'Evolution API indisponivel'
      );
      return;
    }

    if (!result?.ok && (status as Record<string, unknown>)['status'] === 'instance_not_found') {
      sendError(
        res,
        404,
        'WHATSAPP_INSTANCE_NOT_FOUND',
        (status as Record<string, unknown>)['error'] as string || 'Instancia configurada nao existe na Evolution API'
      );
      return;
    }
    sendSuccess(res, status);
  } catch (error) {
    next(error);
  }
});

router.get('/qrcode', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = await refreshWhatsAppStatus({ barbershopId: req.user.barbershopId }) as Record<string, unknown>;
    const resolvedContext = await resolveAuthenticatedWhatsAppContext(req);

    if (status['status'] === 'provider_unavailable' || status['status'] === 'unavailable') {
      sendSuccess(res, {
        status: 'provider_unavailable',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status['error'] ?? 'Evolution API indisponivel',
      });
      return;
    }

    if (status['status'] === 'instance_not_found') {
      sendSuccess(res, {
        status: 'instance_not_found',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status['error'] ?? 'Instancia configurada nao existe na Evolution API',
      });
      return;
    }

    const qrCode = await getWhatsAppQrCode({ barbershopId: req.user.barbershopId });
    const refreshedContext = await resolveAuthenticatedWhatsAppContext(req);
    const refreshed = refreshedContext.instanceName
      ? getWhatsAppStatusByInstance(refreshedContext.instanceName)
      : buildDisconnectedStatusPayload();

    if (!qrCode) {
      sendSuccess(res, {
        status: (refreshed as Record<string, unknown>)['status'],
        qrCode: null,
        instanceName: refreshedContext.instanceName,
        message:
          (refreshed as Record<string, unknown>)['status'] === 'connected'
            ? 'Instancia ja conectada'
            : 'QR Code ainda nao disponivel',
      });
      return;
    }

    sendSuccess(res, {
      status: (refreshed as Record<string, unknown>)['status'],
      qrCode,
      instanceName: refreshedContext.instanceName,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/disconnect', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const success = await disconnectWhatsApp({ barbershopId: req.user.barbershopId });
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);

    if (success) {
      sendSuccess(res, {
        message: 'WhatsApp desconectado com sucesso',
        status: tenantContext.instanceName
          ? getWhatsAppStatusByInstance(tenantContext.instanceName)
          : buildDisconnectedStatusPayload(),
      });
      return;
    }

    sendError(res, 502, 'WHATSAPP_DISCONNECT_FAILED', 'Nao foi possivel desconectar');
  } catch (error) {
    next(error);
  }
});

router.post('/send', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const phone = body['phone'];
    const message = body['message'];
    const remoteJidOriginal = body['remoteJidOriginal'];
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const normalizedMessage = String(message ?? '').trim();
    const normalizedRemoteJidOriginal =
      typeof remoteJidOriginal === 'string' && remoteJidOriginal.trim()
        ? remoteJidOriginal.trim()
        : null;

    if (!normalizedPhone || !normalizedMessage) {
      sendError(
        res,
        400,
        'WHATSAPP_SEND_INVALID_PAYLOAD',
        'Campos phone valido e message sao obrigatorios'
      );
      return;
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
      sendError(res, 502, 'WHATSAPP_SEND_FAILED', (status as Record<string, unknown>)['error'] as string || 'Falha ao enviar mensagem');
      return;
    }

    sendSuccess(res, {
      sent: true,
      phone: normalizedPhone,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/test-send', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const phone = body['phone'];
    const message = body['message'];
    const remoteJidOriginal = body['remoteJidOriginal'];
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const normalizedMessage = String(message ?? '').trim();
    const normalizedRemoteJidOriginal =
      typeof remoteJidOriginal === 'string' && remoteJidOriginal.trim()
        ? remoteJidOriginal.trim()
        : null;

    if (!normalizedPhone || !normalizedMessage) {
      sendError(
        res,
        400,
        'WHATSAPP_TEST_SEND_INVALID_PAYLOAD',
        'Campos phone valido e message sao obrigatorios'
      );
      return;
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
          providerStatus: (status as Record<string, unknown>)['status'],
          providerError: (status as Record<string, unknown>)['error'],
        },
        'Teste isolado de envio WhatsApp falhou'
      );

      sendError(
        res,
        502,
        'WHATSAPP_TEST_SEND_FAILED',
        (status as Record<string, unknown>)['error'] as string || 'Falha ao enviar mensagem no teste isolado'
      );
      return;
    }

    logger.info(
      {
        route: '/api/v1/whatsapp/test-send',
        phone: normalizedPhone,
        remoteJidOriginal: normalizedRemoteJidOriginal,
      },
      'Teste isolado de envio WhatsApp concluido com sucesso'
    );

    sendSuccess(res, {
      sent: true,
      phone: normalizedPhone,
      remoteJidOriginal: normalizedRemoteJidOriginal,
      messageLength: normalizedMessage.length,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/debug-send', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const phone = body['phone'];
    const message = body['message'];
    const remoteJidOriginal = body['remoteJidOriginal'];
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const normalizedMessage = String(message ?? 'teste').trim() || 'teste';
    const normalizedRemoteJidOriginal =
      typeof remoteJidOriginal === 'string' && remoteJidOriginal.trim()
        ? remoteJidOriginal.trim()
        : null;

    if (!normalizedPhone) {
      sendError(
        res,
        400,
        'WHATSAPP_DEBUG_SEND_INVALID_PAYLOAD',
        'Campo phone valido e obrigatorio'
      );
      return;
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
          providerStatus: (status as Record<string, unknown>)['status'],
          providerError: (status as Record<string, unknown>)['error'],
        },
        'debug-send falhou no provider'
      );

      sendError(
        res,
        502,
        'WHATSAPP_DEBUG_SEND_FAILED',
        (status as Record<string, unknown>)['error'] as string || 'Falha no envio do debug-send'
      );
      return;
    }

    sendSuccess(res, {
      sent: true,
      phone: normalizedPhone,
      remoteJidOriginal: normalizedRemoteJidOriginal,
      message: normalizedMessage,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== ALIASES LEGADOS ====================

router.get('/qr', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = await refreshWhatsAppStatus({ barbershopId: req.user.barbershopId }) as Record<string, unknown>;
    const resolvedContext = await resolveAuthenticatedWhatsAppContext(req);

    if (status['status'] === 'provider_unavailable' || status['status'] === 'unavailable') {
      sendSuccess(res, {
        status: 'provider_unavailable',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status['error'] ?? 'Evolution API indisponivel',
      });
      return;
    }

    if (status['status'] === 'instance_not_found') {
      sendSuccess(res, {
        status: 'instance_not_found',
        qrCode: null,
        instanceName: resolvedContext.instanceName,
        message: status['error'] ?? 'Instancia configurada nao existe na Evolution API',
      });
      return;
    }

    const qrCode = await getWhatsAppQrCode({ barbershopId: req.user.barbershopId });
    const refreshedContext = await resolveAuthenticatedWhatsAppContext(req);
    const refreshed = refreshedContext.instanceName
      ? getWhatsAppStatusByInstance(refreshedContext.instanceName)
      : buildDisconnectedStatusPayload();

    sendSuccess(res, {
      status: (refreshed as Record<string, unknown>)['status'],
      qrCode: qrCode ?? null,
      instanceName: refreshedContext.instanceName,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const success = await logoutWhatsApp({ barbershopId: req.user.barbershopId });
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);

    if (success) {
      sendSuccess(res, {
        message: 'WhatsApp desconectado com sucesso',
        status: tenantContext.instanceName
          ? getWhatsAppStatusByInstance(tenantContext.instanceName)
          : buildDisconnectedStatusPayload(),
      });
      return;
    }

    sendError(res, 502, 'WHATSAPP_LOGOUT_FAILED', 'Nao foi possivel desconectar');
  } catch (error) {
    next(error);
  }
});

router.post('/restart', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await restartWhatsApp({ barbershopId: req.user.barbershopId });
    const tenantContext = await resolveAuthenticatedWhatsAppContext(req);
    sendSuccess(
      res,
      tenantContext.instanceName
        ? getWhatsAppStatusByInstance(tenantContext.instanceName)
        : buildDisconnectedStatusPayload()
    );
  } catch (error) {
    next(error);
  }
});

// ==================== CONFIGURAÇÃO DE MENSAGENS ====================

router.get('/config', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;
    const config = await getBotConfig(barbershopId!);
    sendSuccess(res, config);
  } catch (error) {
    next(error);
  }
});

router.put('/config', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;
    const body = req.body as Record<string, unknown>;
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
    } = body;

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`INSERT INTO whatsapp_bot_config (
          barbershop_id, welcome_header, ask_name_message, attendant_message,
          confirmation_message, reminder_message, invalid_option_message,
          session_expired_message, end_session_message, name_validation_message,
          no_slots_message, cancel_no_appointments_message, cancel_list_message,
          cancel_success_message, reschedule_no_appointments_message, reschedule_list_message,
          no_previous_appointments_message, rating_question_message, rating_confirmation_message,
          promotions_message, instagram_message, updated_at
      ) VALUES (
        ${barbershopId}::uuid,${welcome_header ?? null},${ask_name_message ?? null},${attendant_message ?? null},
        ${confirmation_message ?? null},${reminder_message ?? null},${invalid_option_message ?? null},
        ${session_expired_message ?? null},${end_session_message ?? null},${name_validation_message ?? null},
        ${no_slots_message ?? null},${cancel_no_appointments_message ?? null},${cancel_list_message ?? null},
        ${cancel_success_message ?? null},${reschedule_no_appointments_message ?? null},${reschedule_list_message ?? null},
        ${no_previous_appointments_message ?? null},${rating_question_message ?? null},${rating_confirmation_message ?? null},
        ${promotions_message ?? null},${instagram_message ?? null},CURRENT_TIMESTAMP
      )
      ON CONFLICT (barbershop_id)
      DO UPDATE SET
          welcome_header = COALESCE(EXCLUDED.welcome_header, whatsapp_bot_config.welcome_header),
          ask_name_message = COALESCE(EXCLUDED.ask_name_message, whatsapp_bot_config.ask_name_message),
          attendant_message = COALESCE(EXCLUDED.attendant_message, whatsapp_bot_config.attendant_message),
          confirmation_message = COALESCE(EXCLUDED.confirmation_message, whatsapp_bot_config.confirmation_message),
          reminder_message = COALESCE(EXCLUDED.reminder_message, whatsapp_bot_config.reminder_message),
          invalid_option_message = COALESCE(EXCLUDED.invalid_option_message, whatsapp_bot_config.invalid_option_message),
          session_expired_message = COALESCE(EXCLUDED.session_expired_message, whatsapp_bot_config.session_expired_message),
          end_session_message = COALESCE(EXCLUDED.end_session_message, whatsapp_bot_config.end_session_message),
          name_validation_message = COALESCE(EXCLUDED.name_validation_message, whatsapp_bot_config.name_validation_message),
          no_slots_message = COALESCE(EXCLUDED.no_slots_message, whatsapp_bot_config.no_slots_message),
          cancel_no_appointments_message = COALESCE(EXCLUDED.cancel_no_appointments_message, whatsapp_bot_config.cancel_no_appointments_message),
          cancel_list_message = COALESCE(EXCLUDED.cancel_list_message, whatsapp_bot_config.cancel_list_message),
          cancel_success_message = COALESCE(EXCLUDED.cancel_success_message, whatsapp_bot_config.cancel_success_message),
          reschedule_no_appointments_message = COALESCE(EXCLUDED.reschedule_no_appointments_message, whatsapp_bot_config.reschedule_no_appointments_message),
          reschedule_list_message = COALESCE(EXCLUDED.reschedule_list_message, whatsapp_bot_config.reschedule_list_message),
          no_previous_appointments_message = COALESCE(EXCLUDED.no_previous_appointments_message, whatsapp_bot_config.no_previous_appointments_message),
          rating_question_message = COALESCE(EXCLUDED.rating_question_message, whatsapp_bot_config.rating_question_message),
          rating_confirmation_message = COALESCE(EXCLUDED.rating_confirmation_message, whatsapp_bot_config.rating_confirmation_message),
          promotions_message = COALESCE(EXCLUDED.promotions_message, whatsapp_bot_config.promotions_message),
          instagram_message = COALESCE(EXCLUDED.instagram_message, whatsapp_bot_config.instagram_message),
          updated_at = CURRENT_TIMESTAMP
      RETURNING *`
    );

    sendSuccess(res, rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/config/reset', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;

    await prisma.$queryRaw(
      Prisma.sql`DELETE FROM whatsapp_bot_config WHERE barbershop_id = ${barbershopId}::uuid`
    );

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`INSERT INTO whatsapp_bot_config (barbershop_id)
       VALUES (${barbershopId}::uuid)
       RETURNING *`
    );

    sendSuccess(res, rows[0]);
  } catch (error) {
    next(error);
  }
});

// ==================== OPÇÕES DO MENU DO BOT ====================

const DEFAULT_MENU_OPTIONS: DefaultMenuOption[] = [
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

router.get('/config/menu', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;

    let rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM whatsapp_menu_options WHERE barbershop_id = ${barbershopId}::uuid ORDER BY option_order ASC`
    );

    if (rows.length === 0) {
      for (const opt of DEFAULT_MENU_OPTIONS) {
        await prisma.$queryRaw(
          Prisma.sql`INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
           VALUES (${barbershopId}::uuid, ${opt.order}, ${opt.label}, ${opt.emoji}, 'system', ${opt.handler}, true)
           ON CONFLICT (barbershop_id, option_order) DO NOTHING`
        );
      }

      rows = await prisma.$queryRaw<Record<string, unknown>[]>(
        Prisma.sql`SELECT * FROM whatsapp_menu_options WHERE barbershop_id = ${barbershopId}::uuid ORDER BY option_order ASC`
      );
    }

    sendSuccess(res, rows);
  } catch (error) {
    next(error);
  }
});

router.post('/config/menu', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;
    const body = req.body as Record<string, unknown>;
    const label = body['label'] as string | undefined;
    const emoji = body['emoji'] as string | undefined;
    const response_message = body['response_message'] as string | undefined;

    if (!label || !response_message) {
      res.status(400).json({
        success: false,
        error: { message: 'Label e mensagem de resposta são obrigatórios' },
      });
      return;
    }

    const maxOrderRows = await prisma.$queryRaw<{ max_order: bigint | number }[]>(
      Prisma.sql`SELECT COALESCE(MAX(option_order), 0) as max_order FROM whatsapp_menu_options WHERE barbershop_id = ${barbershopId}::uuid`
    );

    const nextOrder = Number(maxOrderRows[0]?.max_order ?? 0) + 1;

    if (nextOrder > 15) {
      res.status(400).json({
        success: false,
        error: { message: 'Máximo de 15 opções no menu' },
      });
      return;
    }

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, response_message, active)
       VALUES (${barbershopId}::uuid, ${nextOrder}, ${label}, ${emoji ?? ''}, 'custom', ${response_message}, true)
       RETURNING *`
    );

    sendCreated(res, rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/config/menu/:id', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;
    const id = req.params['id'];
    const body = req.body as Record<string, unknown>;
    const label = body['label'] as string | null | undefined;
    const emoji = body['emoji'] as string | null | undefined;
    const active = body['active'] as boolean | null | undefined;
    const response_message = body['response_message'] as string | null | undefined;

    const existing = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM whatsapp_menu_options WHERE id = ${id}::uuid AND barbershop_id = ${barbershopId}::uuid`
    );

    if (existing.length === 0) {
      res.status(404).json({
        success: false,
        error: { message: 'Opção não encontrada' },
      });
      return;
    }

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`UPDATE whatsapp_menu_options SET
          label = COALESCE(${label ?? null}, label),
          emoji = COALESCE(${emoji ?? null}, emoji),
          active = COALESCE(${active ?? null}, active),
          response_message = COALESCE(${response_message ?? null}, response_message),
          updated_at = CURRENT_TIMESTAMP
       WHERE id = ${id}::uuid AND barbershop_id = ${barbershopId}::uuid
       RETURNING *`
    );

    sendSuccess(res, rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/config/menu/:id', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;
    const id = req.params['id'];

    const existing = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM whatsapp_menu_options WHERE id = ${id}::uuid AND barbershop_id = ${barbershopId}::uuid`
    );

    if (existing.length === 0) {
      res.status(404).json({
        success: false,
        error: { message: 'Opção não encontrada' },
      });
      return;
    }

    if (existing[0]?.['type'] === 'system') {
      res.status(400).json({
        success: false,
        error: { message: 'Opções do sistema não podem ser excluídas. Desative-as.' },
      });
      return;
    }

    const deletedOrder = existing[0]?.['option_order'] as number;

    await prisma.$queryRaw(
      Prisma.sql`DELETE FROM whatsapp_menu_options WHERE id = ${id}::uuid AND barbershop_id = ${barbershopId}::uuid`
    );

    await prisma.$queryRaw(
      Prisma.sql`UPDATE whatsapp_menu_options
       SET option_order = option_order - 1, updated_at = CURRENT_TIMESTAMP
       WHERE barbershop_id = ${barbershopId}::uuid AND option_order > ${deletedOrder}`
    );

    sendSuccess(res, { message: 'Opção excluída com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.put('/config/menu-reorder', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;
    const body = req.body as Record<string, unknown>;
    const order = body['order'];

    if (!Array.isArray(order) || order.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Array de IDs é obrigatório' },
      });
      return;
    }

    for (let i = 0; i < order.length; i++) {
      const itemId = order[i] as string;
      const tempOrder = -(i + 1);
      await prisma.$queryRaw(
        Prisma.sql`UPDATE whatsapp_menu_options
         SET option_order = ${tempOrder}, updated_at = CURRENT_TIMESTAMP
         WHERE id = ${itemId}::uuid AND barbershop_id = ${barbershopId}::uuid`
      );
    }

    for (let i = 0; i < order.length; i++) {
      const itemId = order[i] as string;
      const finalOrder = i + 1;
      await prisma.$queryRaw(
        Prisma.sql`UPDATE whatsapp_menu_options
         SET option_order = ${finalOrder}
         WHERE id = ${itemId}::uuid AND barbershop_id = ${barbershopId}::uuid`
      );
    }

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM whatsapp_menu_options WHERE barbershop_id = ${barbershopId}::uuid ORDER BY option_order ASC`
    );

    sendSuccess(res, rows);
  } catch (error) {
    next(error);
  }
});

router.post('/config/menu/reset', ...waProtected, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { barbershopId } = req.user;

    await prisma.$queryRaw(
      Prisma.sql`DELETE FROM whatsapp_menu_options WHERE barbershop_id = ${barbershopId}::uuid`
    );

    for (const opt of DEFAULT_MENU_OPTIONS) {
      await prisma.$queryRaw(
        Prisma.sql`INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
         VALUES (${barbershopId}::uuid, ${opt.order}, ${opt.label}, ${opt.emoji}, 'system', ${opt.handler}, true)`
      );
    }

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`SELECT * FROM whatsapp_menu_options WHERE barbershop_id = ${barbershopId}::uuid ORDER BY option_order ASC`
    );

    sendSuccess(res, rows);
  } catch (error) {
    next(error);
  }
});

export default router;
