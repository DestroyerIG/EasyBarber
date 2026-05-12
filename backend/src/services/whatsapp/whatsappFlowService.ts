/**
 * whatsappFlowService.ts — CORRIGIDO
 *
 * BUGS CORRIGIDOS:
 * Bug 2: INCOMING_MESSAGE_EVENTS sincronizado com whatsapp.js
 * Bug 3: resolveConnectedNumber() com null-safe fallback
 * Bug 4: updateSession uma única vez com todos os dados antes do send
 * Bug 5: parse de datas via localToDateStr/formatDateBR sem UTC
 * Bug 6: updateSession com newSlots salvo antes de retornar no race condition
 */

import type { Request, Response } from 'express';
import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';
import { sendWhatsAppMessage, buildWelcomeMessage } from './whatsappMessageService.js';
import type { SendWhatsAppMessageContext } from './whatsappMessageService.js';
import { getWhatsAppStatus, getWhatsAppStatusByInstance, getConnectedNumberCached } from '../whatsappClient.js';
import { getConnectedNumber as getCachedConnectedNumber } from './whatsappInstanceCache.js';
import {
  normalizeWhatsAppNumber,
  isSelfMessage,
  extractWhatsAppPhoneFromWebhookDetailed,
  extractWhatsAppInstanceNumbersFromWebhook,
  extractWhatsAppRemoteJidFromWebhook,
  resolveSafeReplyDestination,
} from '../../utils/whatsapp.js';
import { evaluateGreetingMessage } from '../../utils/whatsappGreeting.js';
import {
  getSession,
  isSessionExpired,
  createSession,
  updateSession,
  deleteSession,
} from './whatsappSessionService.js';
import type { WhatsAppSession } from './whatsappSessionService.js';
import { getBotConfig, getMenuOptions } from './whatsappConfigService.js';
import { STEPS } from './whatsappConstants.js';
import type { BotConfig } from './whatsappConstants.js';
import {
  handleCancelAppointment,
  handleConfirmCancel,
  handleRescheduleAppointment,
  handleConfirmReschedule,
  handlePostAttendanceEvaluation,
  handleSendRating,
} from './whatsappBookingService.js';
import {
  getBarbershopBusinessSettings,
  isWithinBusinessHours,
  isBusinessOpenOnDate,
  generateAvailableTimeSlots,
  formatBusinessHoursRange,
} from '../barbershopBusinessSettingsService.js';
import { appointmentService } from '../appointmentService.js';
import { barbershopSettingsRepository } from '../../repositories/barbershopSettingsRepository.js';

// ==================== LOCAL INTERFACES ====================

interface ServiceRow {
  id: string;
  name: string;
  price: string | number;
  duration_minutes: number;
}

interface BarberRow {
  id: string;
  name: string;
}

interface MenuOptionRow {
  id: string;
  barbershop_id: string;
  option_order: number;
  label: string;
  emoji: string;
  type: string;
  handler: string;
  active: boolean;
  response_message?: string | null;
}

export interface PhoneExtraction {
  [key: string]: unknown;
  phone: string | null;
  fromMe?: boolean;
  sourcePath?: string;
  candidateType?: string;
  confidence?: string;
  resolutionRule?: string;
  remoteJidOriginal?: string;
  instanceNumbers?: string[];
  rejections?: unknown[];
  lidJid?: string | null;
  allowLidDirect?: boolean;
}

interface ResolveIncomingMessageResult {
  normalizedPhone: string | null;
  normalizedText: string;
  remoteJidOriginal: string | null;
  payloadSummary: ReturnType<typeof buildWebhookPayloadSummary> | null;
  phoneExtraction: PhoneExtraction | null;
  knownInstanceNumbers: string[];
  instanceName: string | null;
}

interface HandleIncomingMessageOptions {
  barbershopId?: string;
  barbershopContextSource?: string;
  simulationMode?: boolean;
  eventName?: string;
  messageId?: string;
  dedupeKey?: string;
  preExtractedPhone?: string;
  preExtractedText?: string;
  preExtractedInstanceName?: string;
  preExtractedInstanceNumbers?: string[];
  preResolvedAuthorExtraction?: PhoneExtraction | null;
  now?: Date;
  captureCollector?: (msg: string) => void;
  responseCollector?: string[];
  allowLidDirect?: boolean;
  lidJid?: string | null;
  connectedNumber?: string;
  knownInstanceNumbers?: string[];
  phone?: string;
  instanceName?: string;
  source?: string;
}

interface FlowResult {
  ok: boolean;
  ignored?: boolean;
  reason?: string | null;
  error?: string;
}

interface BusinessSettings {
  openingTime: string;
  closingTime: string;
  timezone?: string;
  allowWalkins?: boolean;
  autoConfirmAppointments?: boolean;
  slotIntervalMinutes?: number;
  [key: string]: unknown;
}

// ==================== HELPERS INTERNOS ====================

const normalizeText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
};

const normalizeWebhookEventName = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

const isWebhookBooleanTrue = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase() === 'true' || value.trim().toLowerCase() === '1';
};

const isWebhookBooleanFalse = (value: unknown): boolean => {
  if (value === false || value === 0) return true;
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase() === 'false' || value.trim().toLowerCase() === '0';
};

/**
 * FIX Bug 2 — set sincronizado com INCOMING_WEBHOOK_EVENTS de whatsapp.js.
 * Removidos "messages-set" e "messageset": existiam aqui mas não no router,
 * então o router descartava esses eventos antes de chegarem ao flow.
 */
const INCOMING_MESSAGE_EVENTS = new Set([
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

const normalizeChoice = (text: string): number | null => {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned) return null;
  const numericMatch = cleaned.match(/^(\d{1,2})$/);
  if (numericMatch) return Number(numericMatch[1] ?? '0');
  const emojiMap: Record<string, number> = {
    '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5,
    '6️⃣': 6, '7️⃣': 7, '8️⃣': 8, '9️⃣': 9, '🔟': 10,
  };
  return emojiMap[cleaned] ?? null;
};

const isFromMe = (payload: Record<string, unknown> = {}): boolean => {
  const data = payload?.data as Record<string, unknown> | undefined;
  const dataMsgs = data?.messages as Record<string, unknown>[] | undefined;
  const msgs = payload?.messages as Record<string, unknown>[] | undefined;

  const candidates = [
    payload?.fromMe,
    (payload?.key as Record<string, unknown>)?.fromMe,
    data?.fromMe,
    (data?.key as Record<string, unknown>)?.fromMe,
    ((dataMsgs?.[0]?.message as Record<string, unknown>)?.key as Record<string, unknown>)?.fromMe,
    dataMsgs?.[0]?.fromMe,
    ((msgs?.[0]?.message as Record<string, unknown>)?.key as Record<string, unknown>)?.fromMe,
    msgs?.[0]?.fromMe,
  ];
  return candidates.some((v) => isWebhookBooleanTrue(v));
};

/**
 * Returns true if fromMe is explicitly true, false if explicitly false, undefined if field absent.
 * Distinguishes "not from me" from "unknown" to avoid false-positive self-reply blocks.
 */
const isFromMeExplicit = (payload: Record<string, unknown> = {}): boolean | undefined => {
  const data = payload?.data as Record<string, unknown> | undefined;
  const dataMsgs = data?.messages as Record<string, unknown>[] | undefined;
  const msgs = payload?.messages as Record<string, unknown>[] | undefined;

  const candidates: unknown[] = [
    payload?.fromMe,
    (payload?.key as Record<string, unknown>)?.fromMe,
    data?.fromMe,
    (data?.key as Record<string, unknown>)?.fromMe,
    (dataMsgs?.[0]?.key as Record<string, unknown>)?.fromMe,       // Evolution API: data.messages[0].key.fromMe
    dataMsgs?.[0]?.fromMe,
    ((dataMsgs?.[0]?.message as Record<string, unknown>)?.key as Record<string, unknown>)?.fromMe,
    (msgs?.[0]?.key as Record<string, unknown>)?.fromMe,           // messages[0].key.fromMe
    msgs?.[0]?.fromMe,
    ((msgs?.[0]?.message as Record<string, unknown>)?.key as Record<string, unknown>)?.fromMe,
  ];
  if (candidates.some(isWebhookBooleanTrue)) return true;
  if (candidates.some(isWebhookBooleanFalse)) return false;
  return undefined;
};

const isIncomingMessageEvent = (payload: Record<string, unknown> = {}): boolean => {
  const eventName = normalizeWebhookEventName(
    payload?.event ?? (payload?.data as Record<string, unknown>)?.event ?? payload?.type ?? (payload?.data as Record<string, unknown>)?.type ?? ''
  );
  if (!eventName) return true;
  return INCOMING_MESSAGE_EVENTS.has(eventName);
};

const WEBHOOK_MESSAGE_WRAPPER_KEYS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
] as const;

const extractTextFromMessageContent = (messageContent: unknown, depth = 0): string => {
  if (!messageContent || typeof messageContent !== 'object' || depth > 8) {
    return '';
  }

  const mc = messageContent as Record<string, unknown>;

  const directText = [
    mc?.conversation,
    (mc?.extendedTextMessage as Record<string, unknown>)?.text,
    (mc?.extendedTextMessage as Record<string, unknown>)?.caption,
    (mc?.imageMessage as Record<string, unknown>)?.caption,
    (mc?.videoMessage as Record<string, unknown>)?.caption,
    (mc?.documentMessage as Record<string, unknown>)?.caption,
    ((mc?.documentWithCaptionMessage as Record<string, unknown>)?.message as Record<string, unknown>)?.documentMessage
      ? (((mc?.documentWithCaptionMessage as Record<string, unknown>)?.message as Record<string, unknown>)?.documentMessage as Record<string, unknown>)?.caption
      : undefined,
  ].find((value) => typeof value === 'string' && (value as string).trim());

  if (directText) {
    return (directText as string).trim();
  }

  const editedMessage = (mc?.protocolMessage as Record<string, unknown>)?.editedMessage;
  if (editedMessage && typeof editedMessage === 'object') {
    const editedText = extractTextFromMessageContent(editedMessage, depth + 1);
    if (editedText) {
      return editedText;
    }
  }

  for (const wrapperKey of WEBHOOK_MESSAGE_WRAPPER_KEYS) {
    const wrapperNode = mc?.[wrapperKey];
    if (!wrapperNode || typeof wrapperNode !== 'object') {
      continue;
    }

    const wn = wrapperNode as Record<string, unknown>;
    const nestedMessage = wn?.message && typeof wn.message === 'object'
      ? wn.message
      : wrapperNode;

    const nestedText = extractTextFromMessageContent(nestedMessage, depth + 1);
    if (nestedText) {
      return nestedText;
    }
  }

  return '';
};

const extractTextFromWebhook = (payload: Record<string, unknown> = {}): string => {
  const data = payload?.data as Record<string, unknown> | undefined;
  const msg = payload?.message as Record<string, unknown> | undefined;
  const dataMsg = data?.message as Record<string, unknown> | undefined;
  const dataMsgs0 = (data?.messages as Record<string, unknown>[])?.[0];
  const msgs0 = (payload?.messages as Record<string, unknown>[])?.[0];

  const candidates = [
    payload?.text, payload?.body, payload?.message, payload?.content,
    data?.text, data?.body, data?.message,
    msg?.conversation, (msg?.extendedTextMessage as Record<string, unknown>)?.text,
    dataMsg?.conversation, (dataMsg?.extendedTextMessage as Record<string, unknown>)?.text,
    (dataMsgs0?.message as Record<string, unknown>)?.conversation,
    ((dataMsgs0?.message as Record<string, unknown>)?.extendedTextMessage as Record<string, unknown>)?.text,
    (msgs0?.message as Record<string, unknown>)?.conversation,
    ((msgs0?.message as Record<string, unknown>)?.extendedTextMessage as Record<string, unknown>)?.text,
  ];
  for (const c of candidates) {
    const n = normalizeText(c);
    if (n) return n;
  }

  const messageNodes = [
    msg,
    dataMsg,
    dataMsgs0?.message,
    msgs0?.message,
  ];

  for (const messageNode of messageNodes) {
    const extractedText = extractTextFromMessageContent(messageNode);
    if (extractedText) {
      return extractedText;
    }
  }

  return '';
};

const buildWebhookPayloadSummary = (payload: Record<string, unknown> = {}) => ({
  event: payload?.event ?? (payload?.data as Record<string, unknown>)?.event ?? payload?.type ?? (payload?.data as Record<string, unknown>)?.type ?? null,
  keyRemoteJid: (payload?.key as Record<string, unknown>)?.remoteJid ?? (payload?.data as Record<string, unknown> & { key?: Record<string, unknown> })?.key?.remoteJid ?? null,
  sender: payload?.sender ?? (payload?.data as Record<string, unknown>)?.sender ?? null,
  fromMe: payload?.fromMe ?? (payload?.key as Record<string, unknown>)?.fromMe ?? (payload?.data as Record<string, unknown>)?.fromMe ?? null,
});

const mergeKnownInstanceNumbers = (values: (string | null | undefined)[] = []): string[] => {
  const s = new Set<string>();
  for (const v of values) {
    const p = normalizeWhatsAppNumber(v);
    if (p) s.add(p);
  }
  return Array.from(s);
};

const SESSION_LOOKUP_WINDOW_MS_DEFAULT = 30 * 60 * 1000;
const INSTANCE_BARBERSHOP_MAP_ENV_KEY = 'WHATSAPP_INSTANCE_BARBERSHOP_MAP';

const normalizeFlowInstanceName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const resolveWebhookInstanceNameCandidate = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return normalizeFlowInstanceName(value);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const v = value as Record<string, unknown>;
  const nestedCandidates = [
    v.instanceName,
    v.instance,
    v.name,
    v.instance_id,
    v.instanceId,
  ];

  for (const candidate of nestedCandidates) {
    const normalized = normalizeFlowInstanceName(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const WEBHOOK_INSTANCE_NAME_CANDIDATES: Array<(payload: Record<string, unknown>) => unknown> = [
  (payload) => payload?.instanceName,
  (payload) => payload?.instance,
  (payload) => payload?.owner,
  (payload) => payload?.instanceData,
  (payload) => (payload?.data as Record<string, unknown>)?.instanceName,
  (payload) => (payload?.data as Record<string, unknown>)?.instance,
  (payload) => (payload?.data as Record<string, unknown>)?.owner,
  (payload) => (payload?.data as Record<string, unknown>)?.instanceData,
  (payload) => (payload?.message as Record<string, unknown>)?.instanceName,
  (payload) => (payload?.message as Record<string, unknown>)?.instance,
  (payload) => (payload?.message as Record<string, unknown>)?.owner,
  (payload) => (payload?.message as Record<string, unknown>)?.instanceData,
  (payload) => ((payload?.data as Record<string, unknown>)?.messages as Record<string, unknown>[])?.[0]?.instanceName,
  (payload) => ((payload?.data as Record<string, unknown>)?.messages as Record<string, unknown>[])?.[0]?.instance,
  (payload) => ((payload?.data as Record<string, unknown>)?.messages as Record<string, unknown>[])?.[0]?.owner,
  (payload) => (payload?.messages as Record<string, unknown>[])?.[0]?.instanceName,
  (payload) => (payload?.messages as Record<string, unknown>[])?.[0]?.instance,
  (payload) => (payload?.messages as Record<string, unknown>[])?.[0]?.owner,
];

const extractWebhookInstanceName = (payload: Record<string, unknown> = {}): string | null => {
  for (const resolver of WEBHOOK_INSTANCE_NAME_CANDIDATES) {
    const resolved = resolveWebhookInstanceNameCandidate(resolver(payload));
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

let instanceBarbershopMapCacheRaw: string | null = null;
let instanceBarbershopMapCache: Map<string, string> = new Map();

const normalizeFlowBarbershopId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const readInstanceBarbershopMapFromEnv = (): Map<string, string> => {
  const raw = String(process.env[INSTANCE_BARBERSHOP_MAP_ENV_KEY] || '').trim();
  const defaultInstanceName = normalizeFlowInstanceName(process.env.EVOLUTION_INSTANCE_NAME);
  const defaultBarbershopId = normalizeFlowBarbershopId(process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID);
  const cacheKey = `${raw}::${defaultInstanceName || ''}::${defaultBarbershopId || ''}`;

  if (cacheKey === instanceBarbershopMapCacheRaw) {
    return instanceBarbershopMapCache;
  }

  const resolved = new Map<string, string>();

  if (raw) {
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as unknown;

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [instanceName, barbershopId] of Object.entries(parsed as Record<string, unknown>)) {
            const normalizedInstanceName = normalizeFlowInstanceName(instanceName);
            const normalizedBarbershopId = normalizeFlowBarbershopId(barbershopId);

            if (normalizedInstanceName && normalizedBarbershopId) {
              resolved.set(normalizedInstanceName, normalizedBarbershopId);
            }
          }
        }
      } catch (error) {
        logger.warn(
          {
            err: error,
            envKey: INSTANCE_BARBERSHOP_MAP_ENV_KEY,
          },
          'Falha ao interpretar mapa de instancia->barbershop (JSON)'
        );
      }
    } else {
      for (const entry of raw.split(/[\n,;]+/)) {
        const token = entry.trim();
        if (!token) {
          continue;
        }

        const separator = token.includes('=') ? '=' : token.includes(':') ? ':' : null;

        if (!separator) {
          continue;
        }

        const [instanceName, barbershopId] = token.split(separator, 2);
        const normalizedInstanceName = normalizeFlowInstanceName(instanceName);
        const normalizedBarbershopId = normalizeFlowBarbershopId(barbershopId);

        if (normalizedInstanceName && normalizedBarbershopId) {
          resolved.set(normalizedInstanceName, normalizedBarbershopId);
        }
      }
    }
  }

  if (defaultInstanceName && defaultBarbershopId && !resolved.has(defaultInstanceName)) {
    resolved.set(defaultInstanceName, defaultBarbershopId);
  }

  instanceBarbershopMapCacheRaw = cacheKey;
  instanceBarbershopMapCache = resolved;

  return resolved;
};

const resolveBarbershopFromInstanceName = (instanceName: string | null): string | null => {
  const normalizedInstanceName = normalizeFlowInstanceName(instanceName);

  if (!normalizedInstanceName) {
    return null;
  }

  return readInstanceBarbershopMapFromEnv().get(normalizedInstanceName) ?? null;
};

interface BarbershopFromInstance {
  barbershopId: string;
  instanceName: string;
  source: string;
}

const resolveBarbershopFromInstanceNameInDatabase = async (instanceName: string | null): Promise<BarbershopFromInstance | null> => {
  const normalizedInstanceName = normalizeFlowInstanceName(instanceName);

  if (!normalizedInstanceName) {
    return null;
  }

  try {
    const barbershop = await barbershopSettingsRepository.findByWhatsAppInstanceName(normalizedInstanceName);

    if (!(barbershop as { id?: string })?.id) {
      const diagnostics = await barbershopSettingsRepository.findWhatsAppInstanceNameDiagnostics(
        normalizedInstanceName
      ) as Array<{ id: string; name: string; active: boolean; whatsapp?: string; whatsappInstanceName?: string }>;

      logger.warn(
        {
          instanceName: normalizedInstanceName,
          lookupFound: false,
          lookupMatches: diagnostics.length,
          activeMatches: diagnostics.filter((item) => item.active === true).length,
          matches: diagnostics.map((item) => ({
            barbershopId: item.id,
            name: item.name,
            active: item.active,
            whatsapp: item.whatsapp || null,
            whatsappInstanceName: item.whatsappInstanceName,
          })),
        },
        'Lookup de instanceName no banco nao encontrou barbearia ativa vinculada'
      );
      return null;
    }

    const bs = barbershop as { id: string; whatsappInstanceName?: string };

    logger.info(
      {
        instanceName: normalizedInstanceName,
        lookupFound: true,
        barbershopId: bs.id,
        whatsappInstanceName: bs.whatsappInstanceName,
      },
      'Lookup de instanceName no banco resolveu barbearia'
    );

    return {
      barbershopId: bs.id,
      instanceName: normalizedInstanceName,
      source: 'instance_db',
    };
  } catch (error) {
    logger.warn(
      {
        err: error,
        instanceName: normalizedInstanceName,
      },
      'Falha ao resolver barbershop por instanceName no banco'
    );
    return null;
  }
};

const buildLookupNumbers = (values: (string | null | undefined)[] = []): string[] => {
  const normalized = new Set<string>();

  for (const value of values) {
    const phone = normalizeWhatsAppNumber(value);
    if (!phone) {
      continue;
    }

    normalized.add(phone);

    if (phone.startsWith('55')) {
      const withoutCountry = phone.slice(2);
      if (withoutCountry.length >= 10) {
        normalized.add(withoutCountry);
      }
    } else if (phone.length >= 10) {
      normalized.add(`55${phone}`);
    }
  }

  return Array.from(normalized);
};

interface BarbershopFromNumbers {
  barbershopId: string;
  matchedNumber: string | null;
}

const resolveBarbershopFromKnownNumbers = async (values: string[] = []): Promise<BarbershopFromNumbers | null> => {
  const lookupNumbers = buildLookupNumbers(values);

  if (!lookupNumbers.length) {
    return null;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; whatsapp_digits: string }>>(
      Prisma.sql`
        SELECT id,
               regexp_replace(COALESCE(whatsapp,''),'\D','','g') AS whatsapp_digits
          FROM barbershops
         WHERE regexp_replace(COALESCE(whatsapp,''),'\D','','g') = ANY(${lookupNumbers}::text[])
         ORDER BY created_at ASC NULLS LAST, id ASC
         LIMIT 3
      `
    );

    if (!rows.length) {
      return null;
    }

    if (rows.length > 1) {
      logger.warn(
        {
          lookupNumbers,
          matches: rows.map((row) => ({
            barbershopId: row.id,
            whatsappDigits: row.whatsapp_digits,
          })),
        },
        'Resolucao de barbershop por numero da instancia ambigua; aguardando mapeamento explicito'
      );
      return null;
    }

    const firstRow = rows[0];
    return {
      barbershopId: firstRow!.id,
      matchedNumber: firstRow!.whatsapp_digits || null,
    };
  } catch (error) {
    logger.warn(
      {
        err: error,
        lookupNumbers,
      },
      'Falha ao resolver barbershop por numeros conhecidos da instancia'
    );
    return null;
  }
};

const resolveSessionLookupWindowMs = (): number => {
  const parsed = Number.parseInt(
    process.env.WHATSAPP_SESSION_TIMEOUT_MS || String(SESSION_LOOKUP_WINDOW_MS_DEFAULT),
    10
  );

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SESSION_LOOKUP_WINDOW_MS_DEFAULT;
  }

  return Math.max(parsed, 5 * 60 * 1000);
};

const resolveBarbershopFromSessionContext = async (phone: unknown): Promise<string | null> => {
  const normalizedPhone = normalizeWhatsAppNumber(phone);

  if (!normalizedPhone) {
    return null;
  }

  const lookupWindowMs = resolveSessionLookupWindowMs();

  try {
    const rows = await prisma.$queryRaw<Array<{ barbershop_id: string; last_updated_at: Date }>>(
      Prisma.sql`
        SELECT barbershop_id,
               MAX(updated_at) AS last_updated_at
          FROM whatsapp_sessions
         WHERE phone = ${normalizedPhone}
           AND updated_at >= NOW() - (${lookupWindowMs}::bigint * INTERVAL '1 millisecond')
         GROUP BY barbershop_id
         ORDER BY last_updated_at DESC
         LIMIT 2
      `
    );

    if (!rows.length) {
      return null;
    }

    if (rows.length > 1) {
      logger.warn(
        {
          phone: normalizedPhone,
          lookupWindowMs,
          matches: rows.map((row) => row.barbershop_id),
        },
        'Contexto de sessao WhatsApp ambiguo para resolver barbershop'
      );
      return null;
    }

    return rows[0]?.barbershop_id || null;
  } catch (error) {
    logger.warn(
      {
        err: error,
        phone: normalizedPhone,
        lookupWindowMs,
      },
      'Falha ao resolver barbershop pelo contexto de sessao WhatsApp'
    );
    return null;
  }
};

/**
 * FIX Bug 3 — null-safe: retorna null se status ainda não foi sincronizado.
 * Evita que a guard self_target rejeite mensagens de terceiros durante startup.
 */
const resolveConnectedNumber = (instanceName: string | null = null): string | null => {
  // 1. Cache dedicado por instância (whatsappInstanceCache) — fonte principal
  const cached = getCachedConnectedNumber(instanceName);
  if (cached) return cached;

  // 2. Cache unificado (getConnectedNumberCached) — também acessa o cache dedicado
  //    mais o fallback para o estado legado waStateByInstance
  const unified = getConnectedNumberCached(instanceName);
  if (unified) return unified;

  // 3. Fallback: estado legado direto por instância
  const status = instanceName ? getWhatsAppStatusByInstance(instanceName) : getWhatsAppStatus();
  if ((status as { connectedNumber?: unknown })?.connectedNumber) {
    return normalizeWhatsAppNumber((status as { connectedNumber: unknown }).connectedNumber) || null;
  }

  // 4. Último fallback: variável de ambiente
  const envPhone = process.env.WHATSAPP_PHONE || process.env.EVOLUTION_PHONE;
  if (envPhone) {
    return normalizeWhatsAppNumber(envPhone) || null;
  }

  return null;
};

// ==================== UTILITÁRIOS DE DATA (FIX Bug 5) ====================

/**
 * Converte Date para "YYYY-MM-DD" usando fuso local.
 * new Date("YYYY-MM-DD") é UTC midnight — no Brasil (UTC-3) vira dia anterior.
 */
const localToDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const generateNextDays = (count = 7): string[] => {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return localToDateStr(date);
  });
};

/** Formata "YYYY-MM-DD" para pt-BR sem conversão UTC. */
const formatDateBR = (dateStr: string, options: Intl.DateTimeFormatOptions = {}): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toLocaleDateString('pt-BR', options);
};

// ==================== RESOLUÇÃO DE BARBERSHOP ====================

const resolveFlowBarbershopId = async (options: HandleIncomingMessageOptions = {}): Promise<string | null> => {
  const explicitBarbershopId = normalizeFlowBarbershopId(options?.barbershopId);

  if (explicitBarbershopId) {
    logger.info(
      {
        barbershopId: explicitBarbershopId,
        source: options?.source || 'explicit',
        simulationMode: Boolean(options?.simulationMode),
      },
      'Barbershop resolvido por contexto explicito no fluxo WhatsApp'
    );

    return explicitBarbershopId;
  }

  const instanceName = normalizeFlowInstanceName(options?.instanceName);
  const barbershopFromInstanceDb = await resolveBarbershopFromInstanceNameInDatabase(instanceName);

  if (barbershopFromInstanceDb?.barbershopId) {
    logger.info(
      {
        barbershopId: barbershopFromInstanceDb.barbershopId,
        instanceName,
        source: 'instance_db',
      },
      'Barbershop resolvido por mapeamento de instancia no banco'
    );
    return barbershopFromInstanceDb.barbershopId;
  }

  const barbershopFromInstanceMap = resolveBarbershopFromInstanceName(instanceName);

  if (barbershopFromInstanceMap) {
    logger.info(
      {
        barbershopId: barbershopFromInstanceMap,
        instanceName,
        source: 'instance_map_legacy_env',
        deprecated: true,
      },
      'Barbershop resolvido por mapeamento legado de instancia (.env deprecated)'
    );
    return barbershopFromInstanceMap;
  }

  if (instanceName) {
    logger.warn(
      {
        instanceName,
        source: 'instance_db',
        hasLegacyEnvMap: readInstanceBarbershopMapFromEnv().size > 0,
        legacyEnvFallbackTried: false,
        finalBarbershopId: null,
      },
      'Falha ao resolver barbershop por instanceName (fail closed)'
    );
    return null;
  }

  const connectedNumber = normalizeWhatsAppNumber(options?.connectedNumber) || resolveConnectedNumber();
  const knownInstanceNumbers = mergeKnownInstanceNumbers([
    connectedNumber,
    ...(Array.isArray(options?.knownInstanceNumbers) ? options.knownInstanceNumbers : []),
  ]);

  const barbershopFromKnownNumbers = await resolveBarbershopFromKnownNumbers(knownInstanceNumbers);

  if (barbershopFromKnownNumbers?.barbershopId) {
    logger.info(
      {
        barbershopId: barbershopFromKnownNumbers.barbershopId,
        matchedNumber: barbershopFromKnownNumbers.matchedNumber,
        knownInstanceNumbers,
        source: 'instance_numbers',
      },
      'Barbershop resolvido por numero conhecido da instancia'
    );
    return barbershopFromKnownNumbers.barbershopId;
  }

  const barbershopFromSession = await resolveBarbershopFromSessionContext(options?.phone);

  if (barbershopFromSession) {
    logger.info(
      {
        barbershopId: barbershopFromSession,
        phone: normalizeWhatsAppNumber(options?.phone),
        source: 'session_context',
      },
      'Barbershop resolvido por contexto de sessao ativa'
    );
    return barbershopFromSession;
  }

  const configuredId = process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID?.trim() || null;
  if (configuredId) return configuredId;

  logger.warn(
    {
      instanceName,
      knownInstanceNumbers,
      phone: normalizeWhatsAppNumber(options?.phone),
      connectedNumber,
      hasDefaultBarbershopId: Boolean(configuredId),
      hasInstanceMapConfig: readInstanceBarbershopMapFromEnv().size > 0,
    },
    'Falha ao resolver barbershop de forma segura; fallback automatico desativado'
  );

  return null;
};

// ==================== CONSTRUÇÃO DO MENU ====================

const getBarbershopName = async (barbershopId: string): Promise<string> => {
  if (!barbershopId) return 'EasyBarber';
  try {
    const barbershop = await prisma.barbershop.findFirst({
      where: { id: barbershopId },
      select: { name: true },
    });
    return barbershop?.name || 'EasyBarber';
  } catch {
    return 'EasyBarber';
  }
};

const buildFallbackWelcomeMessage = (barbershopName: string): string => [
  `Olá 👋 Bem-vindo à *${barbershopName}*!`, '',
  'Me chame de *EasyBarber Bot* 🤖 e estou aqui para agilizar seu atendimento.', '',
  'Como posso ajudar hoje?', '',
  '1️⃣ *Agendar um horário* 💈',
  '2️⃣ *Ver nossos serviços* 📋',
  '3️⃣ *Cancelar agendamento* ❌',
  '4️⃣ *Reagendamento* 🔄',
  '5️⃣ *Avaliação pós-atendimento* ⭐',
  '6️⃣ *Promoções* 🎉',
  '7️⃣ *Instagram* 📱',
  '8️⃣ *Falar com um humano* 👨‍💼',
  '9️⃣ *Encerrar atendimento* 🚪',
].join('\n');

const buildMenuMessage = async (barbershopId: string): Promise<string> => {
  const [config, options, barbershopName] = await Promise.all([
    getBotConfig(barbershopId),
    getMenuOptions(barbershopId),
    getBarbershopName(barbershopId),
  ]);
  if (!options?.length) return buildFallbackWelcomeMessage(barbershopName);
  return buildWelcomeMessage(
    config?.welcome_header || 'Olá 👋 Bem-vindo à {nome_barbearia}!\n\nComo posso ajudar hoje?',
    (options as MenuOptionRow[]).map((item) => ({ label: item.label, emoji: item.emoji })),
    barbershopName
  );
};

const buildOutOfHoursMessage = (businessSettings: BusinessSettings): string => (
  `Olá! Nosso horário de atendimento é das ${formatBusinessHoursRange(businessSettings)}. `
  + 'Sua mensagem foi recebida e retornaremos dentro do nosso expediente.'
);

const buildBusinessContextMessage = (businessSettings: BusinessSettings): string => {
  let message = `Olá! Posso te ajudar com seu agendamento. Hoje atendemos até as ${businessSettings.closingTime}.`;

  if (businessSettings.allowWalkins) {
    message += '\n\nTambem aceitamos encaixes durante o horario de atendimento.';
  }

  return message;
};

const buildContextualMenuMessage = async (barbershopId: string, businessSettings: BusinessSettings): Promise<string> => {
  const menuMessage = await buildMenuMessage(barbershopId);
  return `${buildBusinessContextMessage(businessSettings)}\n\n${menuMessage}`;
};

export const goBackToMainMenu = async (phone: string, barbershopId: string): Promise<{ message: string }> => {
  await deleteSession(phone, barbershopId);
  await createSession(phone, barbershopId);
  return { message: await buildMenuMessage(barbershopId) };
};

const logGreetingEvaluation = (
  baseContext: Record<string, unknown>,
  greetingEvaluation: { originalText: string; normalizedText: string; isGreeting: boolean; rule?: string; canonicalGreeting?: string },
  extras: Record<string, unknown> = {}
): void => {
  logger.info(
    {
      ...baseContext,
      originalText: greetingEvaluation.originalText,
      normalizedText: greetingEvaluation.normalizedText,
      greetingMatched: greetingEvaluation.isGreeting,
      greetingRule: greetingEvaluation.rule,
      greetingCanonical: greetingEvaluation.canonicalGreeting,
      ...extras,
    },
    greetingEvaluation.isGreeting
      ? 'Saudacao detectada no fluxo WhatsApp'
      : 'Saudacao nao detectada no fluxo WhatsApp'
  );
};

// ==================== HANDLERS DE STEPS ====================

const handleMenuStep = async (
  phone: string,
  text: string,
  barbershopId: string,
  config: BotConfig,
  sendContext: SendWhatsAppMessageContext
): Promise<{ ok: boolean }> => {
  const choice = normalizeChoice(text);

  if (!choice) {
    await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + await buildMenuMessage(barbershopId), sendContext);
    return { ok: true };
  }

  const options = await prisma.$queryRaw<MenuOptionRow[]>(
    Prisma.sql`
      SELECT * FROM whatsapp_menu_options
       WHERE active = true
         AND barbershop_id = ${barbershopId}::uuid
         AND option_order = ${choice}
       LIMIT 1
    `
  );

  if (!options.length) {
    await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + await buildMenuMessage(barbershopId), sendContext);
    return { ok: true };
  }

  const option = options[0];
  if (!option) {
    await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + await buildMenuMessage(barbershopId), sendContext);
    return { ok: true };
  }

  if (option.type === 'custom' && option.response_message) {
    await sendWhatsAppMessage(phone, option.response_message, sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  switch (option.handler) {
    case 'schedule': {
      const client = await prisma.client.findFirst({
        where: { phone, barbershopId },
        select: { id: true, name: true },
      });

      if (client) {
        const services = await prisma.service.findMany({
          where: { barbershopId, active: true },
          select: { id: true, name: true, price: true, durationMinutes: true },
          orderBy: { name: 'asc' },
        });

        if (!services.length) {
          await sendWhatsAppMessage(phone, 'Desculpe, não há serviços disponíveis no momento.', sendContext);
          await deleteSession(phone, barbershopId);
          return { ok: true };
        }

        let msg = '💈 *Escolha o serviço:*\n\n';
        services.forEach((s, i) => {
          msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.durationMinutes} min)\n`;
        });
        msg += '\n0️⃣ Voltar ao menu';

        /**
         * FIX Bug 4 — um único updateSession com todos os dados necessários.
         */
        await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {
          clientId: client.id,
          clientName: client.name,
          services: services.map((s) => ({
            id: s.id,
            name: s.name,
            price: s.price.toString(),
            duration_minutes: s.durationMinutes,
          })),
        });
        await sendWhatsAppMessage(phone, msg, sendContext);
      } else {
        await updateSession(phone, barbershopId, STEPS.ASK_NAME, {});
        await sendWhatsAppMessage(phone, config.ask_name_message, sendContext);
      }
      return { ok: true };
    }

    case 'view_services': {
      const services = await prisma.service.findMany({
        where: { barbershopId, active: true },
        select: { name: true, price: true, durationMinutes: true },
        orderBy: { name: 'asc' },
      });
      const msg = services.length
        ? '📋 *Nossos serviços:*\n\n' + services.map((s) =>
            `💈 *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.durationMinutes} min)`
          ).join('\n')
        : 'Não há serviços cadastrados no momento.';
      await sendWhatsAppMessage(phone, msg, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };
    }

    case 'cancel': {
      const result = await handleCancelAppointment(phone, barbershopId, config);
      await sendWhatsAppMessage(phone, result.message, sendContext);
      return { ok: true };
    }

    case 'reschedule': {
      const result = await handleRescheduleAppointment(phone, barbershopId, config);
      await sendWhatsAppMessage(phone, result.message, sendContext);
      return { ok: true };
    }

    case 'rating': {
      const result = await handlePostAttendanceEvaluation(phone, barbershopId, config);
      await sendWhatsAppMessage(phone, result.message, sendContext);
      return { ok: true };
    }

    case 'promotions':
      await sendWhatsAppMessage(phone, config.promotions_message, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };

    case 'instagram': {
      const barbershop = await prisma.barbershop.findFirst({
        where: { id: barbershopId },
        select: { instagramHandle: true },
      });
      const handle = barbershop?.instagramHandle || '@suabarbearia';
      await sendWhatsAppMessage(phone, config.instagram_message.replace('{instagram_handle}', handle), sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };
    }

    case 'attendant':
      await sendWhatsAppMessage(phone, config.attendant_message, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };

    case 'end_session':
      await sendWhatsAppMessage(phone, config.end_session_message, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };

    default: {
      await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + await buildMenuMessage(barbershopId), sendContext);
      return { ok: true };
    }
  }
};

const handleAskNameStep = async (
  phone: string,
  text: string,
  barbershopId: string,
  config: BotConfig,
  sendContext: SendWhatsAppMessageContext
): Promise<{ ok: boolean }> => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const result = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, result.message, sendContext);
    return { ok: true };
  }

  const name = text.trim();
  if (name.split(' ').length < 2 || name.length < 3) {
    await sendWhatsAppMessage(phone, config.name_validation_message, sendContext);
    return { ok: true };
  }

  const existing = await prisma.client.findFirst({
    where: { phone, barbershopId },
    select: { id: true },
  });

  let clientId: string;
  if (existing) {
    clientId = existing.id;
    await prisma.client.update({
      where: { id: clientId },
      data: { name },
    });
  } else {
    const nc = await prisma.client.create({
      data: { barbershopId, name, phone },
      select: { id: true },
    });
    clientId = nc.id;
  }

  const services = await prisma.service.findMany({
    where: { barbershopId, active: true },
    select: { id: true, name: true, price: true, durationMinutes: true },
    orderBy: { name: 'asc' },
  });

  if (!services.length) {
    await sendWhatsAppMessage(phone, 'Desculpe, não há serviços disponíveis no momento.', sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  let msg = `✅ Olá, *${name}*! Bem-vindo!\n\n💈 *Escolha o serviço:*\n\n`;
  services.forEach((s, i) => {
    msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.durationMinutes} min)\n`;
  });
  msg += '\n0️⃣ Voltar ao menu';

  await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {
    clientId,
    clientName: name,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price.toString(),
      duration_minutes: s.durationMinutes,
    })),
  });
  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseServiceStep = async (
  phone: string,
  text: string,
  barbershopId: string,
  sessionData: Record<string, unknown>,
  config: BotConfig,
  sendContext: SendWhatsAppMessageContext
): Promise<{ ok: boolean }> => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const services = (sessionData.services as ServiceRow[]) || [];

  if (!choice || choice < 1 || choice > services.length) {
    let msg = `${config.invalid_option_message}\n\n💈 *Escolha o serviço:*\n\n`;
    services.forEach((s, i) => {
      msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)\n`;
    });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const sel = services[choice - 1];
  if (!sel) {
    await sendWhatsAppMessage(phone, config.invalid_option_message, sendContext);
    return { ok: true };
  }

  const barbers = await prisma.barber.findMany({
    where: { barbershopId, active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (!barbers.length) {
    await sendWhatsAppMessage(phone, 'Desculpe, não há barbeiros disponíveis no momento.', sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  await updateSession(phone, barbershopId, STEPS.CHOOSE_BARBER, {
    ...sessionData,
    serviceId: sel.id,
    serviceName: sel.name,
    servicePrice: sel.price,
    serviceDuration: sel.duration_minutes,
    barbers: barbers.map((b) => ({ id: b.id, name: b.name })),
  });

  let msg = `✅ *${sel.name}* selecionado!\n\n👨‍🦱 *Escolha o barbeiro:*\n\n`;
  barbers.forEach((b, i) => { msg += `${i + 1}️⃣ *${b.name}*\n`; });
  msg += '\n0️⃣ Voltar ao menu';
  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseBarberStep = async (
  phone: string,
  text: string,
  barbershopId: string,
  sessionData: Record<string, unknown>,
  config: BotConfig,
  sendContext: SendWhatsAppMessageContext
): Promise<{ ok: boolean }> => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const barbers = (sessionData.barbers as BarberRow[]) || [];

  if (!choice || choice < 1 || choice > barbers.length) {
    let msg = `${config.invalid_option_message}\n\n👨‍🦱 *Escolha o barbeiro:*\n\n`;
    barbers.forEach((b, i) => { msg += `${i + 1}️⃣ *${b.name}*\n`; });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const sel = barbers[choice - 1];
  if (!sel) {
    await sendWhatsAppMessage(phone, config.invalid_option_message, sendContext);
    return { ok: true };
  }

  // FIX Bug 5: generateNextDays usa fuso local
  const availableDates = generateNextDays(7);

  await updateSession(phone, barbershopId, STEPS.CHOOSE_DATE, {
    ...sessionData,
    barberId: sel.id,
    barberName: sel.name,
    availableDates,
  });

  let msg = `✅ *${sel.name}* selecionado!\n\n📅 *Escolha a data:*\n\n`;
  availableDates.forEach((dateStr, index) => {
    // FIX Bug 5: formatDateBR usa construtor local
    msg += `${index + 1}️⃣ ${formatDateBR(dateStr, { weekday: 'long', day: '2-digit', month: '2-digit' })}\n`;
  });
  msg += '\n0️⃣ Voltar ao menu';
  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseDateStep = async (
  phone: string,
  text: string,
  barbershopId: string,
  sessionData: Record<string, unknown>,
  config: BotConfig,
  sendContext: SendWhatsAppMessageContext,
  businessSettings: BusinessSettings,
  options: { now?: Date } = {}
): Promise<{ ok: boolean }> => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const availableDates = (sessionData.availableDates as string[]) || [];

  if (!choice || choice < 1 || choice > availableDates.length) {
    let msg = `${config.invalid_option_message}\n\n📅 *Escolha a data:*\n\n`;
    availableDates.forEach((dateStr, index) => {
      msg += `${index + 1}️⃣ ${formatDateBR(dateStr, { weekday: 'long', day: '2-digit', month: '2-digit' })}\n`;
    });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const selectedDate = availableDates[choice - 1];
  if (!selectedDate) {
    await sendWhatsAppMessage(phone, config.invalid_option_message, sendContext);
    return { ok: true };
  }

  if (!isBusinessOpenOnDate(businessSettings, selectedDate)) {
    await sendWhatsAppMessage(phone, 'Hoje não estamos atendendo. Escolha outro dia.', sendContext);
    return { ok: true };
  }

  const barberId = sessionData.barberId as string;

  const bookedRows = await prisma.$queryRaw<Array<{ time: string }>>(
    Prisma.sql`
      SELECT time FROM appointments
       WHERE barbershop_id = ${barbershopId}::uuid
         AND barber_id = ${barberId}::uuid
         AND date = ${selectedDate}::date
         AND status != 'cancelado'
    `
  );
  const bookedTimes = bookedRows.map((row) => row.time.substring(0, 5));
  const serviceDuration = (sessionData.serviceDuration as number) || (businessSettings.slotIntervalMinutes ?? 30);

  const availableSlots = generateAvailableTimeSlots(
    businessSettings,
    selectedDate,
    {
      serviceDurationMinutes: serviceDuration,
      bookedTimes,
      currentDate: options?.now || new Date(),
    }
  );

  if (!availableSlots.length) {
    const noSlotsMessage = businessSettings.allowWalkins
      ? `${config.no_slots_message}\n\nℹ️ Tambem aceitamos encaixes durante o horario de atendimento.`
      : config.no_slots_message;

    await sendWhatsAppMessage(phone, noSlotsMessage, sendContext);
    return { ok: true };
  }

  await updateSession(phone, barbershopId, STEPS.CHOOSE_TIME, {
    ...sessionData,
    selectedDate,
    availableSlots,
  });

  // FIX Bug 5
  const dateFormatted = formatDateBR(selectedDate, { weekday: 'long', day: '2-digit', month: '2-digit' });

  let msg = `📅 *${dateFormatted}*\n\n⏰ *Horários disponíveis:*\n\n`;
  availableSlots.forEach((slot: string, index: number) => { msg += `${index + 1}️⃣ ${slot}\n`; });

  if (businessSettings.allowWalkins) {
    msg += '\nℹ️ Tambem aceitamos encaixes dentro do horario de atendimento.\n';
  }

  msg += '\n0️⃣ Voltar ao menu';
  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseTimeStep = async (
  phone: string,
  text: string,
  barbershopId: string,
  sessionData: Record<string, unknown>,
  config: BotConfig,
  sendContext: SendWhatsAppMessageContext,
  businessSettings: BusinessSettings
): Promise<{ ok: boolean }> => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const availableSlots = (sessionData.availableSlots as string[]) || [];

  if (!choice || choice < 1 || choice > availableSlots.length) {
    let msg = `${config.invalid_option_message}\n\n⏰ *Horários disponíveis:*\n\n`;
    availableSlots.forEach((slot, index) => { msg += `${index + 1}️⃣ ${slot}\n`; });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const selectedTime = availableSlots[choice - 1];
  if (!selectedTime) {
    await sendWhatsAppMessage(phone, config.invalid_option_message, sendContext);
    return { ok: true };
  }
  const selectedDate = sessionData.selectedDate as string;
  const barberId = sessionData.barberId as string;

  const conflictRows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT id FROM appointments
       WHERE barbershop_id = ${barbershopId}::uuid
         AND barber_id = ${barberId}::uuid
         AND date = ${selectedDate}::date
         AND time = ${(selectedTime + ':00')}::time
         AND status != 'cancelado'
    `
  );

  if (conflictRows.length > 0) {
    await sendWhatsAppMessage(phone, '⚠️ Este horário acabou de ser reservado. Por favor, escolha outro horário.', sendContext);

    const bookedRows = await prisma.$queryRaw<Array<{ time: string }>>(
      Prisma.sql`
        SELECT time FROM appointments
         WHERE barbershop_id = ${barbershopId}::uuid
           AND barber_id = ${barberId}::uuid
           AND date = ${selectedDate}::date
           AND status != 'cancelado'
      `
    );
    const bookedTimes = new Set(bookedRows.map((r) => r.time.substring(0, 5)));
    const newSlots = availableSlots.filter((s) => !bookedTimes.has(s));

    if (!newSlots.length) {
      const noSlotsMessage = businessSettings.allowWalkins
        ? `${config.no_slots_message}\n\nℹ️ Tambem aceitamos encaixes durante o horario de atendimento.`
        : config.no_slots_message;

      await sendWhatsAppMessage(phone, noSlotsMessage, sendContext);
      return { ok: true };
    }

    /**
     * FIX Bug 6 — persiste newSlots na sessão ANTES de retornar.
     */
    await updateSession(phone, barbershopId, STEPS.CHOOSE_TIME, {
      ...sessionData,
      availableSlots: newSlots,
    });

    let msg = `⏰ *Horários disponíveis:*\n\n`;
    newSlots.forEach((slot, index) => { msg += `${index + 1}️⃣ ${slot}\n`; });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const appointmentPayload = {
    clientId: sessionData.clientId as string,
    barberId,
    serviceId: sessionData.serviceId as string,
    date: selectedDate,
    time: selectedTime,
  };

  logger.info(
    {
      phone,
      barbershopId,
      autoConfirmAppointments: businessSettings.autoConfirmAppointments,
    },
    'Iniciando criacao de agendamento via WhatsApp bot'
  );

  logger.debug(
    {
      phone,
      barbershopId,
      appointmentPayload,
    },
    'Payload consolidado para criacao de agendamento via WhatsApp bot'
  );

  let createdAppointment: { id: string; status: string };
  try {
    createdAppointment = await appointmentService.create(barbershopId, appointmentPayload) as { id: string; status: string };
  } catch (error) {
    logger.error(
      {
        err: error,
        phone,
        barbershopId,
        appointmentPayload,
      },
      'Falha ao persistir agendamento via WhatsApp bot'
    );

    await sendWhatsAppMessage(
      phone,
      '⚠️ Nao consegui confirmar seu agendamento agora. Por favor, tente novamente em instantes.',
      sendContext
    );

    return { ok: true };
  }

  logger.info(
    {
      appointmentId: createdAppointment.id,
      appointmentStatus: createdAppointment.status,
      phone,
      barbershopId,
      clientId: appointmentPayload.clientId,
      barberId: appointmentPayload.barberId,
      serviceId: appointmentPayload.serviceId,
    },
    'Agendamento persistido via WhatsApp bot'
  );

  // FIX Bug 5
  const dateFormatted = formatDateBR(selectedDate, { day: '2-digit', month: '2-digit', year: 'numeric' });

  const confirmationMsg = config.confirmation_message
    .replace('{servico}', (sessionData.serviceName as string) || '')
    .replace('{barbeiro}', (sessionData.barberName as string) || '')
    .replace('{data}', dateFormatted)
    .replace('{horario}', selectedTime)
    .replace('{valor}', Number(sessionData.servicePrice).toFixed(2));

  const confirmationSent = await sendWhatsAppMessage(phone, confirmationMsg, sendContext);

  logger.info(
    {
      appointmentId: createdAppointment.id,
      phone,
      barbershopId,
      confirmationSent,
    },
    'Resultado do envio de confirmacao de agendamento via WhatsApp bot'
  );

  if (confirmationSent) {
    await deleteSession(phone, barbershopId);
  }

  return { ok: confirmationSent };
};

// ==================== HANDLER PRINCIPAL ====================

// PROBLEMA 3 — Deduplicação interna do fluxo: impede processar o mesmo messageId
// mais de uma vez, mesmo que o handler seja chamado por diferentes entry points.
const FLOW_PROCESSED_MESSAGES = new Map<string, number>();
const FLOW_DEDUPE_TTL_MS = 10 * 60 * 1000;
const FLOW_DEDUPE_MAX_KEYS = 5000;

const pruneFlowDedupeCache = (): void => {
  const now = Date.now();
  for (const [key, expiresAt] of FLOW_PROCESSED_MESSAGES.entries()) {
    if (expiresAt <= now) {
      FLOW_PROCESSED_MESSAGES.delete(key);
    }
  }
  if (FLOW_PROCESSED_MESSAGES.size > FLOW_DEDUPE_MAX_KEYS) {
    const overflow = FLOW_PROCESSED_MESSAGES.size - FLOW_DEDUPE_MAX_KEYS;
    let removed = 0;
    for (const key of FLOW_PROCESSED_MESSAGES.keys()) {
      FLOW_PROCESSED_MESSAGES.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
};

const resolveIncomingMessageInput = (
  phoneOrPayload: unknown,
  text: unknown,
  options: HandleIncomingMessageOptions = {}
): ResolveIncomingMessageResult => {
  const isPayloadInput = phoneOrPayload && typeof phoneOrPayload === 'object' && !Array.isArray(phoneOrPayload);
  const payload = isPayloadInput ? (phoneOrPayload as Record<string, unknown>) : {};
  const preExtractedPhone = normalizeWhatsAppNumber(options?.preExtractedPhone);
  const preExtractedText = normalizeText(options?.preExtractedText);
  const preExtractedInstanceName = normalizeFlowInstanceName(options?.preExtractedInstanceName);
  const preResolvedAuthorExtraction =
    options?.preResolvedAuthorExtraction &&
    typeof options.preResolvedAuthorExtraction === 'object'
      ? options.preResolvedAuthorExtraction
      : null;

  // BUG FIX: resolve instance name BEFORE resolving connected number
  const instanceNameCandidate = preExtractedInstanceName || (isPayloadInput ? extractWebhookInstanceName(payload) : null);
  const connectedNumber = resolveConnectedNumber(instanceNameCandidate);

  const preExtractedInstanceNumbers = Array.isArray(options?.preExtractedInstanceNumbers)
    ? options.preExtractedInstanceNumbers : [];

  const baseKnownInstanceNumbers = mergeKnownInstanceNumbers([connectedNumber, ...preExtractedInstanceNumbers]);

  if (!isPayloadInput) {
    return {
      normalizedPhone: normalizeWhatsAppNumber(phoneOrPayload),
      normalizedText: normalizeText(text),
      remoteJidOriginal: typeof phoneOrPayload === 'string' && (phoneOrPayload as string).includes('@') ? (phoneOrPayload as string).trim() : null,
      payloadSummary: null,
      phoneExtraction: null,
      knownInstanceNumbers: baseKnownInstanceNumbers,
      instanceName: preExtractedInstanceName,
    };
  }

  const rawExtraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
    connectedNumbers: baseKnownInstanceNumbers,
    messageText: preExtractedText || normalizeText(text),
  }) as unknown as PhoneExtraction;
  const extraction: PhoneExtraction =
    preResolvedAuthorExtraction?.phone && !rawExtraction?.phone
      ? preResolvedAuthorExtraction
      : rawExtraction;

  const payloadInstanceNumbers = extractWhatsAppInstanceNumbersFromWebhook(payload, {
    connectedNumbers: baseKnownInstanceNumbers,
  }) as string[];

  const knownInstanceNumbers = mergeKnownInstanceNumbers([
    ...baseKnownInstanceNumbers,
    ...payloadInstanceNumbers,
    ...(Array.isArray(extraction.instanceNumbers) ? extraction.instanceNumbers : []),
  ]);

  return {
    normalizedPhone: preExtractedPhone || extraction.phone,
    normalizedText: preExtractedText || extractTextFromWebhook(payload),
    remoteJidOriginal: extractWhatsAppRemoteJidFromWebhook(payload) as string | null,
    payloadSummary: buildWebhookPayloadSummary(payload),
    phoneExtraction: extraction,
    knownInstanceNumbers,
    instanceName: instanceNameCandidate,
  };
};

export const handleIncomingMessage = async (
  phoneOrPayload: unknown,
  text: unknown,
  options: HandleIncomingMessageOptions = {}
): Promise<FlowResult> => {
  const isPayloadInput = Boolean(phoneOrPayload && typeof phoneOrPayload === 'object' && !Array.isArray(phoneOrPayload));
  // Three-state: true=explicitly from bot, false=explicitly NOT from bot, undefined=field absent
  const payloadFromMeExplicit: boolean | undefined = isPayloadInput
    ? isFromMeExplicit(phoneOrPayload as Record<string, unknown>)
    : undefined;
  // Keep legacy boolean for backward-compat with isFromMe-based call at line below
  const payloadFromMe = payloadFromMeExplicit === true;

  const {
    normalizedPhone,
    normalizedText,
    remoteJidOriginal,
    payloadSummary,
    phoneExtraction,
    knownInstanceNumbers,
    instanceName,
  } = resolveIncomingMessageInput(phoneOrPayload, text, options);

  const normalizedEventName = normalizeWebhookEventName(
    options?.eventName ?? payloadSummary?.event ?? (payloadSummary as Record<string, unknown>)?.type ?? ''
  ) || null;

  const connectedNumber = resolveConnectedNumber(instanceName);
  const responseCollector: ((messageText: string) => void) | null = typeof options?.captureCollector === 'function'
    ? options.captureCollector
    : Array.isArray(options?.responseCollector)
      ? (messageText: string) => {
          options.responseCollector!.push(messageText);
        }
      : null;
  const allowLidDestination = Boolean(
    phoneExtraction?.sourcePath &&
    (
      phoneExtraction.sourcePath.includes('participant') ||
      phoneExtraction.resolutionRule === 'lid_from_fallback_promoted' ||
      phoneExtraction.resolutionRule === 'lid_cache' ||
      phoneExtraction.resolutionRule === 'lid_sender_fallback'
    )
  );
  const destinationSource = phoneExtraction?.sourcePath
    || (isPayloadInput ? 'payload_normalized_phone' : 'direct_input');

  logger.info(
    {
      phone: normalizedPhone || null,
      destinationCalculated: normalizedPhone || null,
      destinationSource,
      connectedNumber,
      rawPayloadSummary: payloadSummary,
      authorResolved: phoneExtraction
        ? {
            phone: phoneExtraction.phone,
            sourcePath: phoneExtraction.sourcePath,
            candidateType: phoneExtraction.candidateType,
            confidence: phoneExtraction.confidence,
            resolutionRule: phoneExtraction.resolutionRule,
            fromMe: phoneExtraction.fromMe,
            remoteJidOriginal: phoneExtraction.remoteJidOriginal,
          }
        : null,
      eventName: normalizedEventName,
      messageId: options?.messageId || null,
      dedupeKey: options?.dedupeKey || null,
    },
    'TRACE destino WhatsApp antes da decisao'
  );

  // FIX Evolution API v1 @lid
  const effectiveLidJid = options?.lidJid || phoneExtraction?.lidJid || null;
  const isLidDirectMode = Boolean(options?.allowLidDirect) || Boolean(phoneExtraction?.allowLidDirect);

  const sendContext: SendWhatsAppMessageContext = {
    ...(remoteJidOriginal ? { remoteJidOriginal } : {}),
    ...(effectiveLidJid ? { remoteJidOriginal: effectiveLidJid } : {}),
    ...(normalizedEventName ? { eventName: normalizedEventName } : {}),
    ...(instanceName ? { instanceName } : {}),
    ...(options?.dedupeKey ? { dedupeKey: options.dedupeKey } : {}),
    ...(options?.messageId ? { messageId: options.messageId } : {}),
    ...(responseCollector ? { captureCollector: responseCollector } : {}),
    ...(options?.simulationMode ? { simulate: true } : {}),
    ...(allowLidDestination || isLidDirectMode ? { allowLidDestination: true } : {}),
    ...(phoneExtraction ? { extraction: phoneExtraction } : {}),
    knownInstanceNumbers,
  };

  const flowDebugBase: Record<string, unknown> = {
    phone: normalizedPhone || null,
    remoteJidOriginal: remoteJidOriginal || null,
    eventName: normalizedEventName,
    dedupeKey: sendContext.dedupeKey,
    messageId: sendContext.messageId,
    instanceName: instanceName || null,
  };

  logger.debug(
    {
      ...flowDebugBase,
      normalizedTextLength: normalizedText ? normalizedText.length : 0,
      knownInstanceNumbers,
      payloadSummary,
      instanceName,
      authorResolution: phoneExtraction
        ? {
            phone: phoneExtraction.phone,
            sourcePath: phoneExtraction.sourcePath,
            candidateType: phoneExtraction.candidateType,
            confidence: phoneExtraction.confidence,
            resolutionRule: phoneExtraction.resolutionRule,
            rejections: phoneExtraction.rejections,
            instanceNumbers: phoneExtraction.instanceNumbers,
          }
        : null,
    },
    'Entrada normalizada do fluxo WhatsApp'
  );

  try {
    // Three-state fromMe: payload is primary source of truth; extraction is fallback for string inputs.
    // extractWebhookFromMe uses normalizeWebhookBoolean which returns false for absent fields —
    // can't distinguish absent vs explicit false. Only propagate extraction's true; treat false as uncertain.
    const fromMe: boolean | undefined =
      payloadFromMeExplicit !== undefined ? payloadFromMeExplicit
      : (phoneExtraction?.fromMe === true ? true : undefined);
    const authorPhone = normalizedPhone;

    // REGRA 1: Bloqueio por fromMe
    if (fromMe) {
      logger.info({ ...flowDebugBase, fromMe: true }, 'Mensagem ignorada: fromMe=true');
      return { ok: false, ignored: true, reason: 'from_me' };
    }

    // PROBLEMA 3 — Deduplicação interna do fluxo por messageId
    const flowMessageId = options?.messageId || options?.dedupeKey || null;
    if (flowMessageId) {
      pruneFlowDedupeCache();
      if (FLOW_PROCESSED_MESSAGES.has(flowMessageId)) {
        logger.info(
          { ...flowDebugBase, messageId: flowMessageId, reason: 'flow_dedupe' },
          'Mensagem ignorada por deduplicacao interna do fluxo'
        );
        return { ok: false, ignored: true, reason: 'flow_dedupe' };
      }
      FLOW_PROCESSED_MESSAGES.set(flowMessageId, Date.now() + FLOW_DEDUPE_TTL_MS);
    }

    // REGRA 1: Bloqueio por authorPhone ausente
    if (!authorPhone) {
      logger.warn({ ...flowDebugBase, payload: payloadSummary, knownInstanceNumbers, phoneExtraction },
        'Mensagem ignorada: telefone nao identificado');
      return { ok: false, ignored: true, reason: 'ambiguous_phone' };
    }

    // REGRA 1: Bloqueio de auto-resposta — heurística de número (skipped quando fromMe===false)
    // fromMe===false é sinal definitivo da Evolution API: mensagem NÃO veio do bot.
    // Só executar comparação de números quando fromMe é desconhecido (undefined) ou true.
    if (fromMe !== false) {
      if (connectedNumber && isSelfMessage({ authorPhone, connectedNumber })) {
        const normalizedAuth = normalizeWhatsAppNumber(authorPhone);
        const normalizedConn = normalizeWhatsAppNumber(connectedNumber);
        logger.warn(
          {
            ...flowDebugBase,
            fromMe,
            authorPhone,
            normalizedAuthor: normalizedAuth,
            connectedNumber,
            normalizedConnected: normalizedConn,
            remoteJid: remoteJidOriginal,
            reason: 'self_reply_blocked',
            decisionReason: 'phone_match_with_unknown_fromMe',
          },
          'Bloqueado: auto-resposta por comparação de número (fromMe desconhecido)'
        );
        return { ok: false, ignored: true, reason: 'self_reply_blocked' };
      }

      if (
        Array.isArray(knownInstanceNumbers) &&
        knownInstanceNumbers.some((n) => isSelfMessage({ authorPhone, connectedNumber: n }))
      ) {
        const normalizedAuth = normalizeWhatsAppNumber(authorPhone);
        logger.warn(
          {
            ...flowDebugBase,
            fromMe,
            authorPhone,
            normalizedAuthor: normalizedAuth,
            connectedNumber,
            knownInstanceNumbers,
            remoteJid: remoteJidOriginal,
            reason: 'self_reply_instance_number',
            decisionReason: 'instance_number_match_with_unknown_fromMe',
          },
          'Bloqueado: auto-resposta (authorPhone em knownInstanceNumbers)'
        );
        return { ok: false, ignored: true, reason: 'self_reply_blocked' };
      }
    } else {
      logger.debug(
        {
          ...flowDebugBase,
          fromMe,
          authorPhone,
          normalizedAuthor: normalizeWhatsAppNumber(authorPhone),
          connectedNumber,
          normalizedConnected: normalizeWhatsAppNumber(connectedNumber),
          remoteJid: remoteJidOriginal,
          decisionReason: 'from_me_false_heuristic_skipped',
        },
        'Auto-reply heuristic skipped: fromMe=false (Evolution API authoritative)'
      );
    }

    // REGRA 3: Sanitização do número — validar formato E.164
    const sanitizedPhone = authorPhone.replace(/\D/g, '');
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      logger.warn(
        {
          ...flowDebugBase,
          authorPhone,
          sanitizedPhone: sanitizedPhone || null,
          reason: 'invalid_phone_format',
        },
        'Numero invalido, envio cancelado'
      );
      return { ok: false, ignored: true, reason: 'invalid_phone_format' };
    }

    const destinationDecision = resolveSafeReplyDestination({
      phone: normalizedPhone,
      fromMe,
      remoteJidOriginal,
      connectedNumber,
      knownInstanceNumbers,
      extraction: phoneExtraction,
      allowLidDestination,
    }) as { ok: boolean; destination?: unknown; reason?: string; conversationKind?: string };

    if (!destinationDecision.ok) {
      logger.warn(
        {
          ...flowDebugBase,
          connectedNumber,
          knownInstanceNumbers,
          destination: destinationDecision.destination,
          destinationSource,
          destinationReason: destinationDecision.reason,
          destinationConversationKind: destinationDecision.conversationKind,
        },
        'Mensagem ignorada pela politica de destino'
      );

      return { ok: false, ignored: true, reason: destinationDecision.reason };
    }

    // REGRA 6: Log obrigatório antes de prosseguir com envio
    logger.info(
      {
        fromMe,
        authorPhone,
        connectedNumber,
        destination: sanitizedPhone,
        remoteJidOriginal: remoteJidOriginal || null,
        instanceName: instanceName || null,
      },
      'ENVIO VALIDADO'
    );

    if (!normalizedText) {
      logger.info({ ...flowDebugBase }, 'Mensagem ignorada: texto vazio');
      return { ok: false, ignored: true, reason: 'empty_text' };
    }

    const explicitBarbershopId = normalizeFlowBarbershopId(options?.barbershopId);
    const barbershopContextSource = explicitBarbershopId
      ? String(options?.barbershopContextSource || 'explicit_option')
      : null;

    const barbershopId = await resolveFlowBarbershopId({
      barbershopId: explicitBarbershopId ?? undefined,
      source: barbershopContextSource ?? undefined,
      simulationMode: Boolean(options?.simulationMode),
      connectedNumber: connectedNumber ?? undefined,
      knownInstanceNumbers,
      phone: normalizedPhone ?? undefined,
      instanceName: instanceName ?? undefined,
    });

    if (!barbershopId) {
      logger.warn(
        {
          ...flowDebugBase,
          explicitBarbershopId,
          barbershopContextSource,
          instanceName,
          knownInstanceNumbers,
        },
        'Mensagem ignorada: barbershop nao resolvido'
      );
      return { ok: false, ignored: true, reason: 'barbershop_not_resolved' };
    }

    logger.info({
      ...flowDebugBase,
      text: normalizedText,
      barbershopId,
    }, 'Processando mensagem no fluxo WhatsApp');

    logger.info(
      {
        ...flowDebugBase,
        text: normalizedText,
        barbershopId,
      },
      'FLUXO EXECUTADO'
    );

    const config = await getBotConfig(barbershopId);
    const businessSettings = await getBarbershopBusinessSettings(barbershopId) as unknown as BusinessSettings;
    const now = options?.now instanceof Date ? options.now : new Date();

    if (!isWithinBusinessHours(businessSettings, now)) {
      logger.info(
        {
          phone: normalizedPhone,
          barbershopId,
          openingTime: businessSettings.openingTime,
          closingTime: businessSettings.closingTime,
          timezone: businessSettings.timezone,
        },
        'Mensagem recebida fora do horario de atendimento'
      );

      const sent = await sendWhatsAppMessage(
        normalizedPhone!,
        buildOutOfHoursMessage(businessSettings),
        sendContext
      );

      logger.info(
        {
          ...flowDebugBase,
          barbershopId,
          decision: 'outside_business_hours',
          sent,
        },
        'Decisao de fluxo WhatsApp aplicada'
      );

      return { ok: sent, ignored: false, reason: sent ? null : 'send_failed' };
    }

    const greetingEvaluation = evaluateGreetingMessage(normalizedText) as {
      originalText: string;
      normalizedText: string;
      isGreeting: boolean;
      rule?: string;
      canonicalGreeting?: string;
    };
    let session: WhatsAppSession | null = await getSession(normalizedPhone!, barbershopId);
    const sessionExpired = Boolean(session && isSessionExpired(session));

    logGreetingEvaluation(
      {
        ...flowDebugBase,
        barbershopId,
      },
      greetingEvaluation,
      {
        sessionState: session
          ? (sessionExpired ? 'expired' : 'active')
          : 'missing',
      }
    );

    if (greetingEvaluation.isGreeting) {
      if (session) {
        await deleteSession(normalizedPhone!, barbershopId);
      }

      await createSession(normalizedPhone!, barbershopId);
      const sent = await sendWhatsAppMessage(
        normalizedPhone!,
        await buildContextualMenuMessage(barbershopId, businessSettings),
        sendContext
      );

      logger.info(
        {
          ...flowDebugBase,
          barbershopId,
          phone: normalizedPhone,
          originalText: greetingEvaluation.originalText,
          normalizedText: greetingEvaluation.normalizedText,
          greetingMatched: true,
          greetingRule: greetingEvaluation.rule,
          greetingCanonical: greetingEvaluation.canonicalGreeting,
          previousSessionState: session
            ? (sessionExpired ? 'expired' : 'active')
            : 'missing',
          decision: 'greeting_menu',
          sent,
        },
        'Decisao de fluxo WhatsApp aplicada'
      );

      return { ok: sent, ignored: false, reason: sent ? null : 'send_failed' };
    }

    if (!session || sessionExpired) {
      if (sessionExpired) {
        await deleteSession(normalizedPhone!, barbershopId);
      }

      // REGRA 5: Sem sessão ativa, menu SÓ dispara com saudação.
      logger.info(
        {
          ...flowDebugBase,
          barbershopId,
          originalText: greetingEvaluation.originalText,
          normalizedText: greetingEvaluation.normalizedText,
          greetingMatched: false,
          sessionState: sessionExpired ? 'expired' : 'missing',
          decision: 'ignored_no_greeting_no_session',
        },
        'Mensagem ignorada: sem sessao ativa e sem saudacao'
      );

      return { ok: false, ignored: true, reason: 'no_greeting_no_session' };
    }

    const currentStep = session.step;
    const sessionData = typeof session.data === 'object' && session.data !== null ? session.data : {};

    logger.info(
      {
        ...flowDebugBase,
        barbershopId,
        step: currentStep,
        sessionState: 'active',
        decision: 'continue_active_session',
      },
      'Sessao ativa mantida no fluxo WhatsApp'
    );

    logger.debug(
      {
        ...flowDebugBase,
        barbershopId,
        step: currentStep,
        text: normalizedText,
      },
      'Processando step'
    );

    let stepResult: { ok: boolean } = { ok: false };

    switch (currentStep) {
      case STEPS.MENU:
        stepResult = await handleMenuStep(normalizedPhone!, normalizedText, barbershopId, config, sendContext);
        break;
      case STEPS.ASK_NAME:
        stepResult = await handleAskNameStep(normalizedPhone!, normalizedText, barbershopId, config, sendContext);
        break;
      case STEPS.CHOOSE_SERVICE:
        stepResult = await handleChooseServiceStep(normalizedPhone!, normalizedText, barbershopId, sessionData, config, sendContext);
        break;
      case STEPS.CHOOSE_BARBER:
        stepResult = await handleChooseBarberStep(normalizedPhone!, normalizedText, barbershopId, sessionData, config, sendContext);
        break;
      case STEPS.CHOOSE_DATE:
        stepResult = await handleChooseDateStep(
          normalizedPhone!,
          normalizedText,
          barbershopId,
          sessionData,
          config,
          sendContext,
          businessSettings,
          { now }
        );
        break;
      case STEPS.CHOOSE_TIME:
        stepResult = await handleChooseTimeStep(
          normalizedPhone!,
          normalizedText,
          barbershopId,
          sessionData,
          config,
          sendContext,
          businessSettings
        );
        break;
      case STEPS.CONFIRM_CANCEL: {
        const r = await handleConfirmCancel(normalizedPhone!, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone!, r.message, sendContext);
        stepResult = { ok: true };
        break;
      }
      case STEPS.CONFIRM_RESCHEDULE: {
        const r = await handleConfirmReschedule(normalizedPhone!, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone!, r.message, sendContext);
        stepResult = { ok: true };
        break;
      }
      case STEPS.SEND_RATING: {
        const r = await handleSendRating(normalizedPhone!, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone!, r.message, sendContext);
        stepResult = { ok: true };
        break;
      }
      default: {
        logger.warn({ phone: normalizedPhone, step: currentStep }, 'Step desconhecido, resetando sessão');
        await deleteSession(normalizedPhone!, barbershopId);
        await createSession(normalizedPhone!, barbershopId);
        const sent = await sendWhatsAppMessage(
          normalizedPhone!,
          await buildContextualMenuMessage(barbershopId, businessSettings),
          sendContext
        );
        stepResult = { ok: sent };
        break;
      }
    }

    logger.info(
      {
        ...flowDebugBase,
        barbershopId,
        step: currentStep,
        processed: stepResult.ok,
      },
      'Resultado do fluxo WhatsApp'
    );

    return { ok: stepResult.ok, ignored: false, reason: stepResult.ok ? null : 'send_failed' };
  } catch (error) {
    logger.error(
      {
        err: error,
        ...flowDebugBase,
        text: normalizedText,
      },
      'Erro no fluxo WhatsApp'
    );
    return { ok: false, ignored: false, reason: 'flow_error', error: (error as Error)?.message };
  }
};

// ==================== WEBHOOK HANDLER ====================
// Nota: whatsapp.js (router) chama handleIncomingMessage diretamente.
// handleWebhook permanece exportado para integrações diretas sem passar pelo router.
export const handleWebhook = async (req: Request, res: Response): Promise<Response> => {
  try {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    if (isFromMe(payload)) {
      return res.status(200).json({ success: true, message: 'Evento ignorado: fromMe.' });
    }
    if (!isIncomingMessageEvent(payload)) {
      return res.status(200).json({ success: true, message: 'Evento ignorado: nao e mensagem de entrada.' });
    }

    const text = extractTextFromWebhook(payload);
    const eventName = normalizeWebhookEventName(
      payload?.event ?? (payload?.data as Record<string, unknown>)?.event ?? payload?.type ?? (payload?.data as Record<string, unknown>)?.type ?? ''
    );
    const instanceName = extractWebhookInstanceName(payload);
    const connectedNumber = resolveConnectedNumber(instanceName);
    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: mergeKnownInstanceNumbers([connectedNumber]),
      messageText: text,
    }) as unknown as PhoneExtraction;

    // Extrair messageId para deduplicação interna do fluxo
    const data = payload?.data as Record<string, unknown> | undefined;
    const dataMsgs = data?.messages as Record<string, unknown>[] | undefined;
    const payloadMsgs = payload?.messages as Record<string, unknown>[] | undefined;
    const messageId: string | null = (
      ((payload?.key as Record<string, unknown>)?.id)
      ?? ((data?.key as Record<string, unknown>)?.id)
      ?? ((dataMsgs?.[0]?.key as Record<string, unknown>)?.id)
      ?? ((payloadMsgs?.[0]?.key as Record<string, unknown>)?.id)
      ?? null
    ) as string | null;

    const result = await handleIncomingMessage(payload, text, {
      preExtractedPhone: extraction.phone ?? undefined,
      preExtractedText: text,
      preExtractedInstanceNumbers: extraction.instanceNumbers,
      preResolvedAuthorExtraction: extraction,
      eventName,
      messageId: messageId ?? undefined,
    });

    return res.status(200).json({ success: true, data: { phone: extraction.phone, text, result } });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao processar webhook WhatsApp');
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar webhook WhatsApp',
      error: { code: 'WHATSAPP_WEBHOOK_ERROR', message: (error as Error)?.message },
    });
  }
};
