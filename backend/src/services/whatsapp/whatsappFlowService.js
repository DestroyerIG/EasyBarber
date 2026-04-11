import logger from '../../utils/logger.js';
import pool from '../../config/database.js';
import { sendWhatsAppMessage, buildWelcomeMessage } from './whatsappMessageService.js';
import { getWhatsAppStatus } from '../whatsappClient.js';
import {
  normalizeWhatsAppNumber,
  extractWhatsAppPhoneFromWebhookDetailed,
  extractWhatsAppInstanceNumbersFromWebhook,
  extractWhatsAppRemoteJidFromWebhook,
} from '../../utils/whatsapp.js';

const normalizeText = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value).trim();
  }

  return '';
};

const normalizeWebhookEventName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._\s]+/g, '-');

const isWebhookBooleanTrue = (value) => {
  if (value === true) return true;
  if (value === 1) return true;

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const INCOMING_MESSAGE_EVENTS = new Set([
  'messages-upsert',
  'message-upsert',
  'messages',
  'message',
  'new-message',
  'incoming-message',
  'message-received',
  'messages-set',
  'messageset',
]);

const resolveFlowBarbershopId = async () => {
  const configuredBarbershopId =
    typeof process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID === 'string' &&
    process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID.trim()
      ? process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID.trim()
      : null;

  const connectedNumber = normalizeWhatsAppNumber(getWhatsAppStatus()?.connectedNumber);

  if (connectedNumber) {
    try {
      const result = await pool.query(
        `SELECT id
         FROM barbershops
         WHERE regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $1
         ORDER BY created_at ASC NULLS LAST, id ASC
         LIMIT 2`,
        [connectedNumber]
      );

      if (result.rows.length > 1) {
        logger.warn(
          {
            connectedNumber,
            matches: result.rows.length,
          },
          'Multiplas barbearias encontradas para o mesmo WhatsApp conectado; usando o primeiro match'
        );
      }

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    } catch (error) {
      logger.warn(
        {
          err: error,
          connectedNumber,
        },
        'Falha ao resolver barbershop pelo numero conectado do WhatsApp'
      );
    }
  }

  if (configuredBarbershopId) {
    return configuredBarbershopId;
  }

  try {
    const result = await pool.query(
      `SELECT id
       FROM barbershops
       ORDER BY id ASC
       LIMIT 1`
    );

    return result.rows[0]?.id || null;
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao resolver barbershop fallback no fluxo WhatsApp');
    return null;
  }
};

const normalizeChoice = (text) => {
  const cleaned = normalizeText(text).toLowerCase();

  if (!cleaned) return null;

  const numericMatch = cleaned.match(/^(\d{1,2})$/);
  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  const emojiMap = {
    '1️⃣': 1,
    '2️⃣': 2,
    '3️⃣': 3,
    '4️⃣': 4,
    '5️⃣': 5,
    '6️⃣': 6,
    '7️⃣': 7,
    '8️⃣': 8,
    '9️⃣': 9,
    '🔟': 10,
  };

  if (emojiMap[cleaned]) {
    return emojiMap[cleaned];
  }

  return null;
};

const isGreeting = (text) => {
  const normalized = normalizeText(text).toLowerCase();
  return [
    'oi',
    'ola',
    'olá',
    'menu',
    'inicio',
    'início',
    'bom dia',
    'boa tarde',
    'boa noite',
  ].includes(normalized);
};

const getBotConfig = async (barbershopId) => {
  if (!barbershopId) {
    return null;
  }

  try {
    const configResult = await pool.query(
      `
      SELECT *
      FROM whatsapp_bot_config
      WHERE barbershop_id = $1
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1
      `,
      [barbershopId]
    );

    return configResult.rows[0] || null;
  } catch (error) {
    logger.warn({ err: error, barbershopId }, 'Falha ao buscar configuracao do bot WhatsApp');
    return null;
  }
};

const getMenuOptions = async (barbershopId) => {
  if (!barbershopId) {
    return [];
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM whatsapp_menu_options
      WHERE active = true
        AND barbershop_id = $1
      ORDER BY option_order ASC
      `,
      [barbershopId]
    );

    return result.rows || [];
  } catch (error) {
    logger.warn({ err: error, barbershopId }, 'Falha ao buscar opcoes do menu WhatsApp');
    return [];
  }
};

const getBarbershopName = async (barbershopId) => {
  if (!barbershopId) {
    return 'EasyBarber';
  }

  try {
    const result = await pool.query(
      `
      SELECT name
      FROM barbershops
      WHERE id = $1
      LIMIT 1
      `,
      [barbershopId]
    );

    return result.rows[0]?.name || 'EasyBarber';
  } catch (error) {
    logger.warn({ err: error, barbershopId }, 'Falha ao buscar nome da barbearia');
    return 'EasyBarber';
  }
};

const buildFallbackWelcomeMessage = (barbershopName) => {
  return [
    `Olá 👋 Bem-vindo à ${barbershopName}!`,
    '',
    'Digite uma opção:',
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
};

const buildMenuMessage = async (barbershopId) => {
  const [config, options, barbershopName] = await Promise.all([
    getBotConfig(barbershopId),
    getMenuOptions(barbershopId),
    getBarbershopName(barbershopId),
  ]);

  if (!options.length) {
    return buildFallbackWelcomeMessage(barbershopName);
  }

  return buildWelcomeMessage(
    config?.welcome_header || 'Olá 👋 Bem-vindo!',
    options.map((item) => ({
      label: item.label,
      emoji: item.emoji,
    })),
    barbershopName
  );
};

const getMenuOptionByChoice = async (choice, barbershopId) => {
  if (!choice || !barbershopId) return null;

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM whatsapp_menu_options
      WHERE active = true
        AND barbershop_id = $2
        AND option_order = $1
      LIMIT 1
      `,
      [choice, barbershopId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.warn({ err: error, choice, barbershopId }, 'Falha ao buscar opcao de menu');
    return null;
  }
};

const buildSystemHandlerResponse = async (option, barbershopId) => {
  const config = await getBotConfig(barbershopId);

  switch (option.handler) {
    case 'schedule':
      return config?.ask_name_message || 'Perfeito. Para iniciar seu agendamento, envie seu nome completo.';

    case 'view_services':
      return option.response_message || 'Em breve vou listar nossos serviços disponíveis.';

    case 'cancel':
      return config?.cancel_list_message || 'Para cancelamento, envie seu nome completo para localizar seus agendamentos.';

    case 'reschedule':
      return config?.reschedule_list_message || 'Para reagendar, envie seu nome completo para localizar seus agendamentos.';

    case 'rating':
      return config?.rating_question_message || 'Como foi seu atendimento? Responda com uma nota de 1 a 5.';

    case 'promotions':
      return config?.promotions_message || 'No momento não há promoções ativas.';

    case 'instagram':
      return config?.instagram_message || 'Siga nosso Instagram para novidades.';

    case 'attendant':
      return config?.attendant_message || 'Certo. Vou encaminhar você para atendimento humano.';

    case 'end_session':
      return config?.end_session_message || 'Atendimento encerrado. Quando quiser, envie "oi" para começar novamente.';

    default:
      return option.response_message || 'Opção recebida com sucesso.';
  }
};

const buildInvalidOptionMessage = async (barbershopId) => {
  const config = await getBotConfig(barbershopId);
  const menuMessage = await buildMenuMessage(barbershopId);

  return [
    config?.invalid_option_message || 'Opção inválida. Escolha uma opção do menu.',
    '',
    menuMessage,
  ].join('\n');
};

const extractTextFromWebhook = (payload = {}) => {
  const candidates = [
    payload?.text,
    payload?.body,
    payload?.message,
    payload?.content,
    payload?.data?.text,
    payload?.data?.body,
    payload?.data?.message,
    payload?.data?.content,
    payload?.message?.text,
    payload?.message?.body,
    payload?.message?.conversation,
    payload?.message?.extendedTextMessage?.text,
    payload?.data?.message?.conversation,
    payload?.data?.message?.extendedTextMessage?.text,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const buildWebhookPayloadSummary = (payload = {}) => ({
  event:
    payload?.event ||
    payload?.type ||
    payload?.data?.event ||
    payload?.data?.type ||
    null,
  keyRemoteJid: payload?.key?.remoteJid || payload?.data?.key?.remoteJid || null,
  messageKeyRemoteJid: payload?.message?.key?.remoteJid || null,
  sender: payload?.sender || payload?.data?.sender || null,
  participant:
    payload?.key?.participant ||
    payload?.data?.key?.participant ||
    payload?.message?.key?.participant ||
    payload?.data?.participant ||
    null,
  from: payload?.from || payload?.data?.from || null,
  fromMe:
    payload?.fromMe ||
    payload?.key?.fromMe ||
    payload?.data?.fromMe ||
    payload?.data?.key?.fromMe ||
    null,
});

const mergeKnownInstanceNumbers = (values = []) => {
  const normalized = new Set();

  for (const value of values) {
    const phone = normalizeWhatsAppNumber(value);
    if (phone) {
      normalized.add(phone);
    }
  }

  return Array.from(normalized);
};

const resolveConnectedNumber = () =>
  normalizeWhatsAppNumber(getWhatsAppStatus()?.connectedNumber);

const resolveIncomingMessageInput = (phoneOrPayload, text, options = {}) => {
  const isPayloadInput =
    phoneOrPayload && typeof phoneOrPayload === 'object' && !Array.isArray(phoneOrPayload);
  const preExtractedPhone = normalizeWhatsAppNumber(options?.preExtractedPhone);
  const preExtractedText = normalizeText(options?.preExtractedText);
  const connectedNumber = resolveConnectedNumber();
  const preExtractedInstanceNumbers = Array.isArray(options?.preExtractedInstanceNumbers)
    ? options.preExtractedInstanceNumbers
    : [];

  const baseKnownInstanceNumbers = mergeKnownInstanceNumbers([
    connectedNumber,
    ...preExtractedInstanceNumbers,
  ]);

  if (!isPayloadInput) {
    const normalizedPhone = normalizeWhatsAppNumber(phoneOrPayload);

    return {
      normalizedPhone,
      normalizedText: normalizeText(text),
      remoteJidOriginal:
        typeof phoneOrPayload === 'string' && phoneOrPayload.includes('@')
          ? phoneOrPayload.trim()
          : null,
      payloadSummary: null,
      phoneExtraction: null,
      knownInstanceNumbers: baseKnownInstanceNumbers,
      sources: {
        phone: 'direct_input',
        text: 'direct_input',
      },
    };
  }

  const extraction = extractWhatsAppPhoneFromWebhookDetailed(phoneOrPayload, {
    connectedNumbers: baseKnownInstanceNumbers,
  });

  const payloadInstanceNumbers = extractWhatsAppInstanceNumbersFromWebhook(phoneOrPayload, {
    connectedNumbers: baseKnownInstanceNumbers,
  });
  const knownInstanceNumbers = mergeKnownInstanceNumbers([
    ...baseKnownInstanceNumbers,
    ...payloadInstanceNumbers,
    ...(Array.isArray(extraction.instanceNumbers) ? extraction.instanceNumbers : []),
  ]);

  const normalizedPhone = preExtractedPhone || extraction.phone;
  const normalizedText = preExtractedText || extractTextFromWebhook(phoneOrPayload);

  return {
    normalizedPhone,
    normalizedText,
    remoteJidOriginal: extractWhatsAppRemoteJidFromWebhook(phoneOrPayload),
    payloadSummary: buildWebhookPayloadSummary(phoneOrPayload),
    phoneExtraction: extraction,
    knownInstanceNumbers,
    sources: {
      phone: preExtractedPhone
        ? 'pre_extracted'
        : extraction.phone
          ? 'payload_extractor'
          : 'payload_extractor_ambiguous',
      text: preExtractedText ? 'pre_extracted' : 'payload_extractor',
    },
  };
};

const isIncomingMessageEvent = (payload = {}) => {
  const eventName = normalizeWebhookEventName(
    payload?.event ||
      payload?.type ||
      payload?.data?.event ||
      payload?.data?.type ||
      ''
  );

  if (!eventName) {
    return true;
  }

  return INCOMING_MESSAGE_EVENTS.has(eventName);
};

const isFromMe = (payload = {}) => {
  const candidates = [
    payload?.fromMe,
    payload?.key?.fromMe,
    payload?.data?.fromMe,
    payload?.data?.key?.fromMe,
    payload?.data?.messages?.[0]?.key?.fromMe,
    payload?.messages?.[0]?.key?.fromMe,
  ];

  return candidates.some((value) => isWebhookBooleanTrue(value));
};

export const handleIncomingMessage = async (phoneOrPayload, text, options = {}) => {
  const payloadFromMe =
    phoneOrPayload &&
    typeof phoneOrPayload === 'object' &&
    !Array.isArray(phoneOrPayload) &&
    isFromMe(phoneOrPayload);

  const {
    normalizedPhone,
    normalizedText,
    remoteJidOriginal,
    payloadSummary,
    phoneExtraction,
    knownInstanceNumbers,
    sources,
  } = resolveIncomingMessageInput(phoneOrPayload, text, options);
  const sendContext = remoteJidOriginal ? { remoteJidOriginal } : {};

  try {
    if (payloadFromMe) {
      logger.debug(
        {
          remoteJid: remoteJidOriginal,
          eventName: options?.eventName || null,
        },
        'Mensagem recebida ignorada: payload marcado como fromMe'
      );
      return { ok: false, ignored: true, reason: 'self_target' };
    }

    if (!normalizedPhone) {
      const invalidPhoneReason = payloadSummary ? 'ambiguous_phone' : 'invalid_phone';

      logger.warn(
        {
          phone: !payloadSummary ? phoneOrPayload : null,
          authorPhone: null,
          sourcePath: phoneExtraction?.sourcePath || options?.preExtractedSourcePath || null,
          confidence: phoneExtraction?.confidence || options?.preExtractedConfidence || null,
          remoteJid: remoteJidOriginal,
          payload: payloadSummary,
          sender: phoneExtraction?.sender || payloadSummary?.sender || null,
          participant: phoneExtraction?.participant || payloadSummary?.participant || null,
          fromMe: phoneExtraction?.fromMe ?? payloadFromMe,
          phoneExtraction,
          knownInstanceNumbers,
          sources,
          text: normalizedText || null,
          eventName: options?.eventName || null,
        },
        'Mensagem recebida ignorada: telefone nao confiavel para resposta'
      );
      return { ok: false, ignored: true, reason: invalidPhoneReason };
    }

    if (!normalizedText) {
      logger.debug(
        {
          phone: normalizedPhone,
          eventName: options?.eventName || null,
          sources,
        },
        'Mensagem recebida ignorada: texto vazio'
      );
      return { ok: false, ignored: true, reason: 'empty_text' };
    }

    if (knownInstanceNumbers.includes(normalizedPhone)) {
      logger.warn(
        {
          phone: normalizedPhone,
          knownInstanceNumbers,
          remoteJid: remoteJidOriginal,
          eventName: options?.eventName || null,
        },
        'Mensagem recebida ignorada: destino resolve para numero da instancia'
      );
      return { ok: false, ignored: true, reason: 'self_target' };
    }

    const barbershopId = await resolveFlowBarbershopId();
    if (!barbershopId) {
      logger.warn(
        {
          phone: normalizedPhone,
          eventName: options?.eventName || null,
        },
        'Mensagem recebida ignorada: barbershop nao resolvido para o fluxo WhatsApp'
      );
      return { ok: false, ignored: true, reason: 'barbershop_not_resolved' };
    }

    logger.info(
      {
        phone: normalizedPhone,
        authorPhone: normalizedPhone,
        text: normalizedText,
        sourcePath: phoneExtraction?.sourcePath || options?.preExtractedSourcePath || null,
        confidence: phoneExtraction?.confidence || options?.preExtractedConfidence || null,
        remoteJidOriginal,
        sender: phoneExtraction?.sender || payloadSummary?.sender || null,
        participant: phoneExtraction?.participant || payloadSummary?.participant || null,
        fromMe: phoneExtraction?.fromMe ?? payloadFromMe,
        barbershopId,
        eventName: options?.eventName || null,
        dedupeKey: options?.dedupeKey || null,
        messageId: options?.messageId || null,
      },
      'Processando mensagem recebida no fluxo WhatsApp'
    );

    if (isGreeting(normalizedText)) {
      const menuMessage = await buildMenuMessage(barbershopId);
      const sent = await sendWhatsAppMessage(normalizedPhone, menuMessage, sendContext);

      return {
        ok: sent,
        ignored: false,
        reason: sent ? null : 'send_failed',
      };
    }

    const choice = normalizeChoice(normalizedText);

    if (!choice) {
      const invalidMessage = await buildInvalidOptionMessage(barbershopId);
      const sent = await sendWhatsAppMessage(normalizedPhone, invalidMessage, sendContext);

      return {
        ok: sent,
        ignored: false,
        reason: sent ? null : 'send_failed',
      };
    }

    const option = await getMenuOptionByChoice(choice, barbershopId);

    if (!option) {
      const invalidMessage = await buildInvalidOptionMessage(barbershopId);
      const sent = await sendWhatsAppMessage(normalizedPhone, invalidMessage, sendContext);

      return {
        ok: sent,
        ignored: false,
        reason: sent ? null : 'send_failed',
      };
    }

    let reply = null;

    if (option.type === 'custom') {
      reply = option.response_message || 'Opção personalizada recebida.';
    } else {
      reply = await buildSystemHandlerResponse(option, barbershopId);
    }

    if (!reply || !String(reply).trim()) {
      logger.warn(
        {
          phone: normalizedPhone,
          barbershopId,
          optionOrder: option.option_order,
          handler: option.handler,
        },
        'Resposta do fluxo WhatsApp vazia'
      );

      return { ok: false, ignored: true, reason: 'empty_reply' };
    }

    const sent = await sendWhatsAppMessage(normalizedPhone, reply, sendContext);

    if (!sent) {
      logger.warn(
        {
          phone: normalizedPhone,
          barbershopId,
        },
        'Mensagem nao enviada pelo provider WhatsApp'
      );
      return { ok: false, ignored: false, reason: 'send_failed' };
    }

    logger.info(
      {
        phone: normalizedPhone,
        barbershopId,
        optionOrder: option.option_order,
        handler: option.handler,
      },
      'Resposta enviada com sucesso no fluxo WhatsApp'
    );

    return {
      ok: true,
      ignored: false,
      reason: null,
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        phone: normalizedPhone,
        remoteJid: remoteJidOriginal,
        payload: payloadSummary,
        text: normalizedText,
      },
      'Erro ao processar fluxo de mensagem WhatsApp'
    );

    return {
      ok: false,
      ignored: false,
      reason: 'flow_error',
      error: error?.message || 'Erro interno no fluxo WhatsApp',
    };
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const payload = req.body ?? {};
    const payloadSummary = buildWebhookPayloadSummary(payload);

    logger.info({ payload: payloadSummary }, 'Webhook WhatsApp recebido');

    if (isFromMe(payload)) {
      return res.status(200).json({
        success: true,
        message: 'Evento ignorado: mensagem enviada pela própria instância.',
      });
    }

    if (!isIncomingMessageEvent(payload)) {
      return res.status(200).json({
        success: true,
        message: 'Evento ignorado: não é mensagem de entrada.',
      });
    }

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: mergeKnownInstanceNumbers([resolveConnectedNumber()]),
    });
    const phone = extraction.phone;
    const text = extractTextFromWebhook(payload);
    const eventName = normalizeWebhookEventName(
      payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || ''
    );
    const result = await handleIncomingMessage(payload, text, {
      preExtractedPhone: phone,
      preExtractedText: text,
      preExtractedInstanceNumbers: extraction.instanceNumbers,
      preExtractedSourcePath: extraction.sourcePath,
      preExtractedConfidence: extraction.confidence,
      eventName,
    });

    return res.status(200).json({
      success: true,
      data: {
        phone,
        text,
        result,
      },
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        payload: buildWebhookPayloadSummary(req.body ?? {}),
      },
      'Erro ao processar webhook WhatsApp'
    );

    return res.status(500).json({
      success: false,
      message: 'Erro ao processar webhook WhatsApp',
      error: {
        code: 'WHATSAPP_WEBHOOK_ERROR',
        message: error?.message || 'Erro interno no webhook WhatsApp',
      },
    });
  }
};