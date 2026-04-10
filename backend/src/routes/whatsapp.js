import crypto from 'crypto';
import express from 'express';
import { handleIncomingMessage } from '../services/whatsapp/index.js';
import {
  getWhatsAppStatus,
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppQrCode,
  sendWhatsAppText,
  refreshWhatsAppStatus,
  logoutWhatsApp,
  restartWhatsApp,
} from '../services/whatsappClient.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import pool from '../config/database.js';
import { sendSuccess, sendCreated, sendError } from '../utils/response.js';
import logger from '../utils/logger.js';
import {
  normalizeWhatsAppNumber,
  extractWhatsAppRemoteJidFromWebhook,
  extractWhatsAppPhoneFromWebhookDetailed,
} from '../utils/whatsapp.js';

const router = express.Router();
const waProtected = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

const WEBHOOK_MESSAGE_DEDUPE = new Map();
const WEBHOOK_DEDUPE_TTL_MS = 10 * 60 * 1000;
const WEBHOOK_FALLBACK_DEDUPE_TTL_MS = 15 * 1000;
const WEBHOOK_DEDUPE_MAX_KEYS = 10000;

const normalizeWebhookEventName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._\s]+/g, '-');

const INCOMING_WEBHOOK_EVENTS = new Set([
  'messages-upsert',
  'message-upsert',
  'messages',
  'message',
  'new-message',
  'incoming-message',
  'message-received',
]);

const isIncomingWebhookEvent = (eventName, { allowEmpty = true } = {}) => {
  const normalized = normalizeWebhookEventName(eventName);

  if (!normalized) {
    return allowEmpty;
  }

  return INCOMING_WEBHOOK_EVENTS.has(normalized);
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

  return directText ? directText.trim() : null;
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
    messageNode?.key ||
    payload?.key ||
    payload?.message?.key ||
    dataNode?.key ||
    null;

  const message =
    messageNode?.message ||
    payload?.message ||
    dataNode?.message ||
    null;

  return {
    ...payload,
    ...(dataNode || {}),
    ...(messageNode || {}),
    key: key || undefined,
    message: message || undefined,
    sender: payload?.sender || dataNode?.sender || messageNode?.sender || null,
    from: payload?.from || dataNode?.from || messageNode?.from || null,
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

const extractWebhookFromMe = (payload) => {
  const candidates = [
    payload?.fromMe,
    payload?.key?.fromMe,
    payload?.data?.fromMe,
    payload?.data?.key?.fromMe,
    payload?.data?.messages?.[0]?.key?.fromMe,
    payload?.messages?.[0]?.key?.fromMe,
  ];

  return candidates.find((value) => typeof value === 'boolean') ?? false;
};

const buildWebhookPhoneExtractionOptions = () => {
  const connectedNumber = normalizeWhatsAppNumber(getWhatsAppStatus()?.connectedNumber);

  if (!connectedNumber) {
    return {};
  }

  return {
    connectedNumbers: [connectedNumber],
  };
};

const mapWebhookIncomingMessage = (payload) => {
  const normalizedPayload = normalizeWebhookEventPayload(payload);
  const eventName = normalizeWebhookEventName(normalizedPayload?.event || normalizedPayload?.type || '');

  if (!isIncomingWebhookEvent(eventName)) {
    return null;
  }

  const fromMe = extractWebhookFromMe(normalizedPayload);
  if (fromMe) {
    return null;
  }

  const extraction = extractWhatsAppPhoneFromWebhookDetailed(
    normalizedPayload,
    buildWebhookPhoneExtractionOptions()
  );
  const extractedPhone = extraction.phone;

  if (!extractedPhone) {
    logger.warn(
      {
        event: eventName,
        keyRemoteJid: normalizedPayload?.key?.remoteJid || null,
        messageKeyRemoteJid: normalizedPayload?.message?.key?.remoteJid || null,
        sender: normalizedPayload?.sender || null,
        from: normalizedPayload?.from || null,
        extractionRejections: extraction.rejections,
        instanceNumbers: extraction.instanceNumbers,
      },
      'Webhook ignorado: messages-upsert sem telefone extraivel'
    );
    return null;
  }

  const text = extractWebhookText(normalizedPayload);

  if (!text) {
    return null;
  }

  return {
    payload: normalizedPayload,
    eventName,
    extractedPhone,
    extractedText: text,
    extraction,
  };
};

const buildWebhookDebugFields = (payload, extraction = null) => {
  const resolvedExtraction =
    extraction ||
    extractWhatsAppPhoneFromWebhookDetailed(payload, buildWebhookPhoneExtractionOptions());

  return {
    keyRemoteJid: payload?.key?.remoteJid || null,
    messageKeyRemoteJid: payload?.message?.key?.remoteJid || null,
    sender: payload?.sender || null,
    from: payload?.from || null,
    extractedPhone: resolvedExtraction.phone,
    extractionSourcePath: resolvedExtraction.sourcePath,
    extractionCandidateType: resolvedExtraction.candidateType,
    extractionRejections: resolvedExtraction.rejections,
    instanceNumbers: resolvedExtraction.instanceNumbers,
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
    const payload = req.body || {};

    logger.warn(
      {
        route: '/api/v1/whatsapp/webhook',
      },
      'Webhook legado recebido. Recomenda-se migrar para /api/v1/whatsapp/webhook/messages-upsert'
    );

    const incoming = mapWebhookIncomingMessage(payload);

    if (!incoming) {
      const normalizedPayload = normalizeWebhookEventPayload(payload);

      logger.debug(
        {
          event: normalizedPayload?.event || normalizedPayload?.type,
          fromMe: extractWebhookFromMe(normalizedPayload),
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
        phone: debugFields.extractedPhone,
        event: incoming.eventName,
        dedupeKey: dedupe.dedupeKey,
        messageId: dedupe.messageId,
        processed: result?.ok,
        ignored: result?.ignored,
        reason: result?.reason,
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
    const payload = req.body || {};
    const eventName = normalizeWebhookEventName(req.params.event || '');

    logger.debug(
      {
        event: eventName,
        payloadKeys: Object.keys(payload),
      },
      'Webhook Evolution sub-rota recebida'
    );

    if (!isIncomingWebhookEvent(eventName, { allowEmpty: false })) {
      logger.debug({ event: eventName }, 'Webhook Evolution sub-rota ignorada (nao e mensagem)');
      return sendSuccess(res, { received: true, processed: false });
    }

    const incoming = mapWebhookIncomingMessage({
      ...payload,
      event: eventName,
    });

    if (!incoming) {
      const normalizedPayload = normalizeWebhookEventPayload(payload, eventName);

      logger.debug(
        {
          event: eventName,
          fromMe: extractWebhookFromMe(normalizedPayload),
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

// ==================== STATUS E CONEXÃO ====================

router.get('/status', ...waProtected, async (req, res, next) => {
  try {
    await refreshWhatsAppStatus();
    return sendSuccess(res, getWhatsAppStatus());
  } catch (error) {
    return next(error);
  }
});

router.post('/connect', ...waProtected, async (req, res, next) => {
  try {
    const connected = await connectWhatsApp();
    const status = getWhatsAppStatus();

    if (!connected && status.status === 'unavailable') {
      return sendError(
        res,
        503,
        'WHATSAPP_PROVIDER_UNAVAILABLE',
        status.error || 'Evolution API indisponivel'
      );
    }

    return sendSuccess(res, status);
  } catch (error) {
    return next(error);
  }
});

router.get('/qrcode', ...waProtected, async (req, res, next) => {
  try {
    const status = getWhatsAppStatus();

    if (status.status === 'unavailable') {
      return sendSuccess(res, {
        status: 'unavailable',
        qrCode: null,
        message: status.error || 'Evolution API indisponivel',
      });
    }

    const qrCode = await getWhatsAppQrCode();
    const refreshed = getWhatsAppStatus();

    if (!qrCode) {
      return sendSuccess(res, {
        status: refreshed.status,
        qrCode: null,
        message:
          refreshed.status === 'connected'
            ? 'Instancia ja conectada'
            : 'QR Code ainda nao disponivel',
      });
    }

    return sendSuccess(res, {
      status: refreshed.status,
      qrCode,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/disconnect', ...waProtected, async (req, res, next) => {
  try {
    const success = await disconnectWhatsApp();

    if (success) {
      return sendSuccess(res, {
        message: 'WhatsApp desconectado com sucesso',
        status: getWhatsAppStatus(),
      });
    }

    return sendError(res, 502, 'WHATSAPP_DISCONNECT_FAILED', 'Nao foi possivel desconectar');
  } catch (error) {
    return next(error);
  }
});

router.post('/send', ...waProtected, async (req, res, next) => {
  try {
    const { phone, message } = req.body || {};
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    const normalizedMessage = String(message || '').trim();

    if (!normalizedPhone || !normalizedMessage) {
      return sendError(
        res,
        400,
        'WHATSAPP_SEND_INVALID_PAYLOAD',
        'Campos phone valido e message sao obrigatorios'
      );
    }

    const sent = await sendWhatsAppText(normalizedPhone, normalizedMessage);

    if (!sent) {
      const status = getWhatsAppStatus();
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

// ==================== ALIASES LEGADOS ====================

router.get('/qr', ...waProtected, async (req, res, next) => {
  try {
    const status = getWhatsAppStatus();

    if (status.status === 'unavailable') {
      return sendSuccess(res, {
        status: 'unavailable',
        qrCode: null,
        message: status.error || 'Evolution API indisponivel',
      });
    }

    const qrCode = await getWhatsAppQrCode();
    const refreshed = getWhatsAppStatus();

    return sendSuccess(res, {
      status: refreshed.status,
      qrCode: qrCode || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', ...waProtected, async (req, res, next) => {
  try {
    const success = await logoutWhatsApp();

    if (success) {
      return sendSuccess(res, {
        message: 'WhatsApp desconectado com sucesso',
        status: getWhatsAppStatus(),
      });
    }

    return sendError(res, 502, 'WHATSAPP_LOGOUT_FAILED', 'Nao foi possivel desconectar');
  } catch (error) {
    return next(error);
  }
});

router.post('/restart', ...waProtected, async (req, res, next) => {
  try {
    await restartWhatsApp();
    return sendSuccess(res, getWhatsAppStatus());
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