/**
 * whatsappFlowService.js — CORRIGIDO
 *
 * BUGS CORRIGIDOS:
 * Bug 2: INCOMING_MESSAGE_EVENTS sincronizado com whatsapp.js
 * Bug 3: resolveConnectedNumber() com null-safe fallback
 * Bug 4: updateSession uma única vez com todos os dados antes do send
 * Bug 5: parse de datas via localToDateStr/formatDateBR sem UTC
 * Bug 6: updateSession com newSlots salvo antes de retornar no race condition
 */

import logger from '../../utils/logger.js';
import pool from '../../config/database.js';
import { sendWhatsAppMessage, buildWelcomeMessage } from './whatsappMessageService.js';
import { getWhatsAppStatus } from '../whatsappClient.js';
import {
  normalizeWhatsAppNumber,
  extractWhatsAppPhoneFromWebhookDetailed,
  extractWhatsAppInstanceNumbersFromWebhook,
  extractWhatsAppRemoteJidFromWebhook,
  resolveSafeReplyDestination,
} from '../../utils/whatsapp.js';
import {
  getSession,
  isSessionExpired,
  createSession,
  updateSession,
  deleteSession,
} from './whatsappSessionService.js';
import { getBotConfig, getMenuOptions } from './whatsappConfigService.js';
import { STEPS } from './whatsappConstants.js';
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
  generateAvailableTimeSlots,
  formatBusinessHoursRange,
} from '../barbershopBusinessSettingsService.js';

// ==================== HELPERS INTERNOS ====================

const normalizeText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
};

const normalizeWebhookEventName = (value) =>
  String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

const isWebhookBooleanTrue = (value) => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase() === 'true' || value.trim().toLowerCase() === '1';
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

const isGreeting = (text) => {
  const n = normalizeText(text).toLowerCase();
  return ['oi','ola','olá','menu','inicio','início','bom dia','boa tarde','boa noite'].includes(n);
};

const normalizeChoice = (text) => {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned) return null;
  const numericMatch = cleaned.match(/^(\d{1,2})$/);
  if (numericMatch) return Number(numericMatch[1]);
  const emojiMap = {
    '1️⃣':1,'2️⃣':2,'3️⃣':3,'4️⃣':4,'5️⃣':5,
    '6️⃣':6,'7️⃣':7,'8️⃣':8,'9️⃣':9,'🔟':10,
  };
  return emojiMap[cleaned] || null;
};

const isFromMe = (payload = {}) => {
  const candidates = [
    payload?.fromMe, payload?.key?.fromMe, payload?.data?.fromMe,
    payload?.data?.key?.fromMe, payload?.data?.messages?.[0]?.key?.fromMe,
    payload?.messages?.[0]?.key?.fromMe,
  ];
  return candidates.some((v) => isWebhookBooleanTrue(v));
};

const isIncomingMessageEvent = (payload = {}) => {
  const eventName = normalizeWebhookEventName(
    payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || ''
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
];

const extractTextFromMessageContent = (messageContent, depth = 0) => {
  if (!messageContent || typeof messageContent !== 'object' || depth > 8) {
    return '';
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

  return '';
};

const extractTextFromWebhook = (payload = {}) => {
  const candidates = [
    payload?.text, payload?.body, payload?.message, payload?.content,
    payload?.data?.text, payload?.data?.body, payload?.data?.message,
    payload?.message?.conversation, payload?.message?.extendedTextMessage?.text,
    payload?.data?.message?.conversation, payload?.data?.message?.extendedTextMessage?.text,
    payload?.data?.messages?.[0]?.message?.conversation,
    payload?.data?.messages?.[0]?.message?.extendedTextMessage?.text,
    payload?.messages?.[0]?.message?.conversation,
    payload?.messages?.[0]?.message?.extendedTextMessage?.text,
  ];
  for (const c of candidates) {
    const n = normalizeText(c);
    if (n) return n;
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

  return '';
};

const buildWebhookPayloadSummary = (payload = {}) => ({
  event: payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || null,
  keyRemoteJid: payload?.key?.remoteJid || payload?.data?.key?.remoteJid || null,
  sender: payload?.sender || payload?.data?.sender || null,
  fromMe: payload?.fromMe || payload?.key?.fromMe || payload?.data?.fromMe || null,
});

const mergeKnownInstanceNumbers = (values = []) => {
  const s = new Set();
  for (const v of values) {
    const p = normalizeWhatsAppNumber(v);
    if (p) s.add(p);
  }
  return Array.from(s);
};

/**
 * FIX Bug 3 — null-safe: retorna null se status ainda não foi sincronizado.
 * Evita que a guard self_target rejeite mensagens de terceiros durante startup.
 */
const resolveConnectedNumber = () => {
  const status = getWhatsAppStatus();
  if (!status || !status.connectedNumber) return null;
  return normalizeWhatsAppNumber(status.connectedNumber) || null;
};

// ==================== UTILITÁRIOS DE DATA (FIX Bug 5) ====================

/**
 * Converte Date para "YYYY-MM-DD" usando fuso local.
 * new Date("YYYY-MM-DD") é UTC midnight — no Brasil (UTC-3) vira dia anterior.
 */
const localToDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const generateNextDays = (count = 7) => {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return localToDateStr(date);
  });
};

/** Formata "YYYY-MM-DD" para pt-BR sem conversão UTC. */
const formatDateBR = (dateStr, options = {}) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', options);
};

// ==================== RESOLUÇÃO DE BARBERSHOP ====================

const resolveFlowBarbershopId = async () => {
  const connectedNumber = resolveConnectedNumber();

  if (connectedNumber) {
    try {
      const result = await pool.query(
        `SELECT id FROM barbershops
         WHERE regexp_replace(COALESCE(whatsapp,''),'\\D','','g')=$1
            OR regexp_replace(COALESCE(whatsapp,''),'\\D','','g')=$2
         ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 2`,
        [connectedNumber, connectedNumber.replace(/^55/, '')]
      );
      if (result.rows.length > 1) {
        logger.warn({ connectedNumber, matches: result.rows.length },
          'Multiplas barbearias encontradas; usando o primeiro match');
      }
      if (result.rows.length > 0) return result.rows[0].id;
    } catch (error) {
      logger.warn({ err: error, connectedNumber }, 'Falha ao resolver barbershop pelo numero conectado');
    }
  }

  const configuredId = process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID?.trim() || null;
  if (configuredId) return configuredId;

  try {
    const result = await pool.query(
      `SELECT id FROM barbershops WHERE active=true ORDER BY id ASC LIMIT 1`
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao resolver barbershop fallback');
    return null;
  }
};

// ==================== CONSTRUÇÃO DO MENU ====================

const getBarbershopName = async (barbershopId) => {
  if (!barbershopId) return 'EasyBarber';
  try {
    const result = await pool.query(`SELECT name FROM barbershops WHERE id=$1 LIMIT 1`, [barbershopId]);
    return result.rows[0]?.name || 'EasyBarber';
  } catch {
    return 'EasyBarber';
  }
};

const buildFallbackWelcomeMessage = (barbershopName) => [
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

const buildMenuMessage = async (barbershopId) => {
  const [config, options, barbershopName] = await Promise.all([
    getBotConfig(barbershopId),
    getMenuOptions(barbershopId),
    getBarbershopName(barbershopId),
  ]);
  if (!options?.length) return buildFallbackWelcomeMessage(barbershopName);
  return buildWelcomeMessage(
    config?.welcome_header || 'Olá 👋 Bem-vindo à {nome_barbearia}!\n\nComo posso ajudar hoje?',
    options.map((item) => ({ label: item.label, emoji: item.emoji })),
    barbershopName
  );
};

const buildOutOfHoursMessage = (businessSettings) => (
  `Olá! Nosso horário de atendimento é das ${formatBusinessHoursRange(businessSettings)}. `
  + 'Sua mensagem foi recebida e retornaremos dentro do nosso expediente.'
);

const buildBusinessContextMessage = (businessSettings) => {
  let message = `Olá! Posso te ajudar com seu agendamento. Hoje atendemos até as ${businessSettings.closingTime}.`;

  if (businessSettings.allowWalkins) {
    message += '\n\nTambem aceitamos encaixes durante o horario de atendimento.';
  }

  return message;
};

const buildContextualMenuMessage = async (barbershopId, businessSettings) => {
  const menuMessage = await buildMenuMessage(barbershopId);
  return `${buildBusinessContextMessage(businessSettings)}\n\n${menuMessage}`;
};

export const goBackToMainMenu = async (phone, barbershopId) => {
  await deleteSession(phone, barbershopId);
  await createSession(phone, barbershopId);
  return { message: await buildMenuMessage(barbershopId) };
};

// ==================== HANDLERS DE STEPS ====================

const handleMenuStep = async (phone, text, barbershopId, config, sendContext) => {
  const choice = normalizeChoice(text);

  if (!choice) {
    await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + await buildMenuMessage(barbershopId), sendContext);
    return { ok: true };
  }

  const optionResult = await pool.query(
    `SELECT * FROM whatsapp_menu_options WHERE active=true AND barbershop_id=$1 AND option_order=$2 LIMIT 1`,
    [barbershopId, choice]
  );

  if (!optionResult.rows.length) {
    await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + await buildMenuMessage(barbershopId), sendContext);
    return { ok: true };
  }

  const option = optionResult.rows[0];

  if (option.type === 'custom' && option.response_message) {
    await sendWhatsAppMessage(phone, option.response_message, sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  switch (option.handler) {
    case 'schedule': {
      const clientResult = await pool.query(
        `SELECT id, name FROM clients WHERE phone=$1 AND barbershop_id=$2 LIMIT 1`,
        [phone, barbershopId]
      );

      if (clientResult.rows.length > 0) {
        const client = clientResult.rows[0];
        const services = await pool.query(
          `SELECT id, name, price, duration_minutes FROM services WHERE barbershop_id=$1 AND active=true ORDER BY name`,
          [barbershopId]
        );

        if (!services.rows.length) {
          await sendWhatsAppMessage(phone, 'Desculpe, não há serviços disponíveis no momento.', sendContext);
          await deleteSession(phone, barbershopId);
          return { ok: true };
        }

        let msg = '💈 *Escolha o serviço:*\n\n';
        services.rows.forEach((s, i) => {
          msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)\n`;
        });
        msg += '\n0️⃣ Voltar ao menu';

        /**
         * FIX Bug 4 — um único updateSession com todos os dados necessários.
         * Antes: dois updateSession consecutivos; o segundo podia sobrescrever
         * o primeiro sem services[], travando handleChooseServiceStep.
         */
        await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {
          clientId: client.id,
          clientName: client.name,
          services: services.rows,
        });
        await sendWhatsAppMessage(phone, msg, sendContext);
      } else {
        await updateSession(phone, barbershopId, STEPS.ASK_NAME, {});
        await sendWhatsAppMessage(phone, config.ask_name_message, sendContext);
      }
      return { ok: true };
    }

    case 'view_services': {
      const services = await pool.query(
        `SELECT name, price, duration_minutes FROM services WHERE barbershop_id=$1 AND active=true ORDER BY name`,
        [barbershopId]
      );
      let msg = services.rows.length
        ? '📋 *Nossos serviços:*\n\n' + services.rows.map(s =>
            `💈 *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)`
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
      const br = await pool.query(`SELECT instagram_handle FROM barbershops WHERE id=$1 LIMIT 1`, [barbershopId]);
      const handle = br.rows[0]?.instagram_handle || '@suabarbearia';
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

const handleAskNameStep = async (phone, text, barbershopId, config, sendContext) => {
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

  const existing = await pool.query(
    `SELECT id FROM clients WHERE phone=$1 AND barbershop_id=$2 LIMIT 1`, [phone, barbershopId]
  );
  let clientId;
  if (existing.rows.length > 0) {
    clientId = existing.rows[0].id;
    await pool.query(`UPDATE clients SET name=$1 WHERE id=$2`, [name, clientId]);
  } else {
    const nc = await pool.query(
      `INSERT INTO clients (barbershop_id, name, phone) VALUES ($1,$2,$3) RETURNING id`,
      [barbershopId, name, phone]
    );
    clientId = nc.rows[0].id;
  }

  const services = await pool.query(
    `SELECT id, name, price, duration_minutes FROM services WHERE barbershop_id=$1 AND active=true ORDER BY name`,
    [barbershopId]
  );

  if (!services.rows.length) {
    await sendWhatsAppMessage(phone, 'Desculpe, não há serviços disponíveis no momento.', sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  let msg = `✅ Olá, *${name}*! Bem-vindo!\n\n💈 *Escolha o serviço:*\n\n`;
  services.rows.forEach((s, i) => {
    msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)\n`;
  });
  msg += '\n0️⃣ Voltar ao menu';

  await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {
    clientId, clientName: name, services: services.rows,
  });
  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseServiceStep = async (phone, text, barbershopId, sessionData, config, sendContext) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const services = sessionData.services || [];

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
  const barbers = await pool.query(
    `SELECT id, name FROM barbers WHERE barbershop_id=$1 AND active=true ORDER BY name`, [barbershopId]
  );

  if (!barbers.rows.length) {
    await sendWhatsAppMessage(phone, 'Desculpe, não há barbeiros disponíveis no momento.', sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  await updateSession(phone, barbershopId, STEPS.CHOOSE_BARBER, {
    ...sessionData,
    serviceId: sel.id, serviceName: sel.name,
    servicePrice: sel.price, serviceDuration: sel.duration_minutes,
    barbers: barbers.rows,
  });

  let msg = `✅ *${sel.name}* selecionado!\n\n👨‍🦱 *Escolha o barbeiro:*\n\n`;
  barbers.rows.forEach((b, i) => { msg += `${i + 1}️⃣ *${b.name}*\n`; });
  msg += '\n0️⃣ Voltar ao menu';
  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseBarberStep = async (phone, text, barbershopId, sessionData, config, sendContext) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const barbers = sessionData.barbers || [];

  if (!choice || choice < 1 || choice > barbers.length) {
    let msg = `${config.invalid_option_message}\n\n👨‍🦱 *Escolha o barbeiro:*\n\n`;
    barbers.forEach((b, i) => { msg += `${i + 1}️⃣ *${b.name}*\n`; });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const sel = barbers[choice - 1];

  // FIX Bug 5: generateNextDays usa fuso local
  const availableDates = generateNextDays(7);

  await updateSession(phone, barbershopId, STEPS.CHOOSE_DATE, {
    ...sessionData,
    barberId: sel.id, barberName: sel.name,
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

const handleChooseDateStep = async (phone, text, barbershopId, sessionData, config, sendContext, businessSettings, options = {}) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const availableDates = sessionData.availableDates || [];

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

  const bookedResult = await pool.query(
    `SELECT time FROM appointments WHERE barbershop_id=$1 AND barber_id=$2 AND date=$3 AND status!='cancelado'`,
    [barbershopId, sessionData.barberId, selectedDate]
  );
  const bookedTimes = bookedResult.rows.map((row) => row.time.substring(0, 5));
  const serviceDuration = sessionData.serviceDuration || businessSettings.slotIntervalMinutes;

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
    ...sessionData, selectedDate, availableSlots,
  });

  // FIX Bug 5
  const dateFormatted = formatDateBR(selectedDate, { weekday: 'long', day: '2-digit', month: '2-digit' });

  let msg = `📅 *${dateFormatted}*\n\n⏰ *Horários disponíveis:*\n\n`;
  availableSlots.forEach((slot, index) => { msg += `${index + 1}️⃣ ${slot}\n`; });

  if (businessSettings.allowWalkins) {
    msg += '\nℹ️ Tambem aceitamos encaixes dentro do horario de atendimento.\n';
  }

  msg += '\n0️⃣ Voltar ao menu';
  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseTimeStep = async (phone, text, barbershopId, sessionData, config, sendContext, businessSettings) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const r = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, r.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const availableSlots = sessionData.availableSlots || [];

  if (!choice || choice < 1 || choice > availableSlots.length) {
    let msg = `${config.invalid_option_message}\n\n⏰ *Horários disponíveis:*\n\n`;
    availableSlots.forEach((slot, index) => { msg += `${index + 1}️⃣ ${slot}\n`; });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const selectedTime = availableSlots[choice - 1];
  const selectedDate = sessionData.selectedDate;

  const conflictCheck = await pool.query(
    `SELECT id FROM appointments WHERE barbershop_id=$1 AND barber_id=$2 AND date=$3 AND time=$4 AND status!='cancelado'`,
    [barbershopId, sessionData.barberId, selectedDate, selectedTime + ':00']
  );

  if (conflictCheck.rows.length > 0) {
    await sendWhatsAppMessage(phone, '⚠️ Este horário acabou de ser reservado. Por favor, escolha outro horário.', sendContext);

    const bookedResult = await pool.query(
      `SELECT time FROM appointments WHERE barbershop_id=$1 AND barber_id=$2 AND date=$3 AND status!='cancelado'`,
      [barbershopId, sessionData.barberId, selectedDate]
    );
    const bookedTimes = new Set(bookedResult.rows.map((r) => r.time.substring(0, 5)));
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
     * Sem isso, na próxima mensagem sessionData.availableSlots ainda continha
     * o slot conflitado e o bot entrava em loop tentando inserir o mesmo horário.
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

  const appointmentStatus = businessSettings.autoConfirmAppointments ? 'confirmado' : 'pendente';

  const newAppointment = await pool.query(
    `INSERT INTO appointments (barbershop_id, client_id, barber_id, service_id, date, time, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, status`,
    [barbershopId, sessionData.clientId, sessionData.barberId, sessionData.serviceId, selectedDate, selectedTime + ':00', appointmentStatus]
  );

  logger.info(
    {
      appointmentId: newAppointment.rows[0].id,
      phone,
      barbershopId,
      appointmentStatus,
      autoConfirmAppointments: businessSettings.autoConfirmAppointments,
    },
    'Agendamento criado via WhatsApp bot'
  );

  // FIX Bug 5
  const dateFormatted = formatDateBR(selectedDate, { day: '2-digit', month: '2-digit', year: 'numeric' });

  const confirmationMsg = businessSettings.autoConfirmAppointments
    ? config.confirmation_message
      .replace('{servico}', sessionData.serviceName || '')
      .replace('{barbeiro}', sessionData.barberName || '')
      .replace('{data}', dateFormatted)
      .replace('{horario}', selectedTime)
      .replace('{valor}', Number(sessionData.servicePrice).toFixed(2))
    : [
      '✅ Recebemos sua solicitacao de agendamento! 💈',
      '',
      `📋 Servico: ${sessionData.serviceName || ''}`,
      `👨‍🦱 Barbeiro: ${sessionData.barberName || ''}`,
      `📅 Data: ${dateFormatted}`,
      `⏰ Horario: ${selectedTime}`,
      `💰 Valor: R$ ${Number(sessionData.servicePrice).toFixed(2)}`,
      '',
      '🕒 Status: aguardando confirmacao da equipe.',
    ].join('\n');

  await sendWhatsAppMessage(phone, confirmationMsg, sendContext);
  await deleteSession(phone, barbershopId);
  return { ok: true };
};

// ==================== HANDLER PRINCIPAL ====================

const resolveIncomingMessageInput = (phoneOrPayload, text, options = {}) => {
  const isPayloadInput = phoneOrPayload && typeof phoneOrPayload === 'object' && !Array.isArray(phoneOrPayload);
  const preExtractedPhone = normalizeWhatsAppNumber(options?.preExtractedPhone);
  const preExtractedText = normalizeText(options?.preExtractedText);
  const connectedNumber = resolveConnectedNumber();
  const preExtractedInstanceNumbers = Array.isArray(options?.preExtractedInstanceNumbers)
    ? options.preExtractedInstanceNumbers : [];

  const baseKnownInstanceNumbers = mergeKnownInstanceNumbers([connectedNumber, ...preExtractedInstanceNumbers]);

  if (!isPayloadInput) {
    return {
      normalizedPhone: normalizeWhatsAppNumber(phoneOrPayload),
      normalizedText: normalizeText(text),
      remoteJidOriginal: typeof phoneOrPayload === 'string' && phoneOrPayload.includes('@') ? phoneOrPayload.trim() : null,
      payloadSummary: null,
      phoneExtraction: null,
      knownInstanceNumbers: baseKnownInstanceNumbers,
    };
  }

  const extraction = extractWhatsAppPhoneFromWebhookDetailed(phoneOrPayload, {
    connectedNumbers: baseKnownInstanceNumbers,
    messageText: preExtractedText || normalizeText(text),
  });

  const payloadInstanceNumbers = extractWhatsAppInstanceNumbersFromWebhook(phoneOrPayload, {
    connectedNumbers: baseKnownInstanceNumbers,
  });

  const knownInstanceNumbers = mergeKnownInstanceNumbers([
    ...baseKnownInstanceNumbers,
    ...payloadInstanceNumbers,
    ...(Array.isArray(extraction.instanceNumbers) ? extraction.instanceNumbers : []),
  ]);

  return {
    normalizedPhone: preExtractedPhone || extraction.phone,
    normalizedText: preExtractedText || extractTextFromWebhook(phoneOrPayload),
    remoteJidOriginal: extractWhatsAppRemoteJidFromWebhook(phoneOrPayload),
    payloadSummary: buildWebhookPayloadSummary(phoneOrPayload),
    phoneExtraction: extraction,
    knownInstanceNumbers,
  };
};

export const handleIncomingMessage = async (phoneOrPayload, text, options = {}) => {
  const payloadFromMe = phoneOrPayload && typeof phoneOrPayload === 'object' && !Array.isArray(phoneOrPayload) && isFromMe(phoneOrPayload);
  const isPayloadInput = phoneOrPayload && typeof phoneOrPayload === 'object' && !Array.isArray(phoneOrPayload);

  const {
    normalizedPhone,
    normalizedText,
    remoteJidOriginal,
    payloadSummary,
    phoneExtraction,
    knownInstanceNumbers,
  } =
    resolveIncomingMessageInput(phoneOrPayload, text, options);

  const normalizedEventName = normalizeWebhookEventName(
    options?.eventName || payloadSummary?.event || payloadSummary?.type || ''
  ) || null;

  const connectedNumber = resolveConnectedNumber();
  const responseCollector = typeof options?.captureCollector === 'function'
    ? options.captureCollector
    : Array.isArray(options?.responseCollector)
      ? (messageText) => {
          options.responseCollector.push(messageText);
        }
      : null;
  const allowLidDestination = Boolean(
    phoneExtraction?.sourcePath && phoneExtraction.sourcePath.includes('participant')
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

  const sendContext = {
    ...(remoteJidOriginal ? { remoteJidOriginal } : {}),
    ...(normalizedEventName ? { eventName: normalizedEventName } : {}),
    ...(options?.dedupeKey ? { dedupeKey: options.dedupeKey } : {}),
    ...(options?.messageId ? { messageId: options.messageId } : {}),
    ...(responseCollector ? { captureCollector: responseCollector } : {}),
    ...(options?.simulationMode ? { simulate: true } : {}),
    ...(allowLidDestination ? { allowLidDestination: true } : {}),
    knownInstanceNumbers,
  };

  const flowDebugBase = {
    phone: normalizedPhone || null,
    remoteJidOriginal: remoteJidOriginal || null,
    eventName: normalizedEventName,
    dedupeKey: sendContext.dedupeKey,
    messageId: sendContext.messageId,
  };

  logger.debug(
    {
      ...flowDebugBase,
      normalizedTextLength: normalizedText ? normalizedText.length : 0,
      knownInstanceNumbers,
      payloadSummary,
      authorResolution: phoneExtraction
        ? {
            phone: phoneExtraction.phone,
            sourcePath: phoneExtraction.sourcePath,
            candidateType: phoneExtraction.candidateType,
            confidence: phoneExtraction.confidence,
            rejections: phoneExtraction.rejections,
            instanceNumbers: phoneExtraction.instanceNumbers,
          }
        : null,
    },
    'Entrada normalizada do fluxo WhatsApp'
  );

  try {
    if (payloadFromMe) {
      logger.info({ ...flowDebugBase }, 'Mensagem ignorada: fromMe');
      return { ok: false, ignored: true, reason: 'from_me' };
    }

    if (!normalizedPhone) {
      logger.warn({ ...flowDebugBase, payload: payloadSummary, knownInstanceNumbers, phoneExtraction },
        'Mensagem ignorada: telefone nao identificado');
      return { ok: false, ignored: true, reason: 'ambiguous_phone' };
    }

    const destinationDecision = resolveSafeReplyDestination({
      phone: normalizedPhone,
      fromMe: payloadFromMe || phoneExtraction?.fromMe,
      remoteJidOriginal,
      connectedNumber,
      knownInstanceNumbers,
      extraction: phoneExtraction,
      allowLidDestination,
    });

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

    if (!normalizedText) {
      logger.info({ ...flowDebugBase }, 'Mensagem ignorada: texto vazio');
      return { ok: false, ignored: true, reason: 'empty_text' };
    }

    const barbershopId = await resolveFlowBarbershopId();
    if (!barbershopId) {
      logger.warn({ ...flowDebugBase }, 'Mensagem ignorada: barbershop nao resolvido');
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
    const businessSettings = await getBarbershopBusinessSettings(barbershopId);
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
        normalizedPhone,
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

    if (isGreeting(normalizedText)) {
      await deleteSession(normalizedPhone, barbershopId);
      await createSession(normalizedPhone, barbershopId);
      const sent = await sendWhatsAppMessage(
        normalizedPhone,
        await buildContextualMenuMessage(barbershopId, businessSettings),
        sendContext
      );

      logger.info(
        {
          ...flowDebugBase,
          barbershopId,
          decision: 'greeting_menu',
          sent,
        },
        'Decisao de fluxo WhatsApp aplicada'
      );

      return { ok: sent, ignored: false, reason: sent ? null : 'send_failed' };
    }

    let session = await getSession(normalizedPhone, barbershopId);

    if (!session || isSessionExpired(session)) {
      if (session) {
        await deleteSession(normalizedPhone, barbershopId);
        await sendWhatsAppMessage(normalizedPhone,
          config.session_expired_message || '⏰ Sua sessão expirou. Digite qualquer coisa para começar novamente.',
          sendContext);
      }
      await createSession(normalizedPhone, barbershopId);
      const sent = await sendWhatsAppMessage(
        normalizedPhone,
        await buildContextualMenuMessage(barbershopId, businessSettings),
        sendContext
      );

      logger.info(
        {
          ...flowDebugBase,
          barbershopId,
          decision: session ? 'session_expired_restarted' : 'session_created',
          sent,
        },
        'Decisao de fluxo WhatsApp aplicada'
      );

      return { ok: sent, ignored: false, reason: sent ? null : 'send_failed' };
    }

    const currentStep = session.step;
    const sessionData = typeof session.data === 'object' ? session.data : {};

    logger.debug(
      {
        ...flowDebugBase,
        barbershopId,
        step: currentStep,
        text: normalizedText,
      },
      'Processando step'
    );

    let stepResult = { ok: false };

    switch (currentStep) {
      case STEPS.MENU:
        stepResult = await handleMenuStep(normalizedPhone, normalizedText, barbershopId, config, sendContext);
        break;
      case STEPS.ASK_NAME:
        stepResult = await handleAskNameStep(normalizedPhone, normalizedText, barbershopId, config, sendContext);
        break;
      case STEPS.CHOOSE_SERVICE:
        stepResult = await handleChooseServiceStep(normalizedPhone, normalizedText, barbershopId, sessionData, config, sendContext);
        break;
      case STEPS.CHOOSE_BARBER:
        stepResult = await handleChooseBarberStep(normalizedPhone, normalizedText, barbershopId, sessionData, config, sendContext);
        break;
      case STEPS.CHOOSE_DATE:
        stepResult = await handleChooseDateStep(
          normalizedPhone,
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
          normalizedPhone,
          normalizedText,
          barbershopId,
          sessionData,
          config,
          sendContext,
          businessSettings
        );
        break;
      case STEPS.CONFIRM_CANCEL: {
        const r = await handleConfirmCancel(normalizedPhone, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone, r.message, sendContext);
        stepResult = { ok: true };
        break;
      }
      case STEPS.CONFIRM_RESCHEDULE: {
        const r = await handleConfirmReschedule(normalizedPhone, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone, r.message, sendContext);
        stepResult = { ok: true };
        break;
      }
      case STEPS.SEND_RATING: {
        const r = await handleSendRating(normalizedPhone, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone, r.message, sendContext);
        stepResult = { ok: true };
        break;
      }
      default: {
        logger.warn({ phone: normalizedPhone, step: currentStep }, 'Step desconhecido, resetando sessão');
        await deleteSession(normalizedPhone, barbershopId);
        await createSession(normalizedPhone, barbershopId);
        const sent = await sendWhatsAppMessage(
          normalizedPhone,
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
    return { ok: false, ignored: false, reason: 'flow_error', error: error?.message };
  }
};

// ==================== WEBHOOK HANDLER ====================
// Nota: whatsapp.js (router) chama handleIncomingMessage diretamente.
// handleWebhook permanece exportado para integrações diretas sem passar pelo router.
export const handleWebhook = async (req, res) => {
  try {
    const payload = req.body ?? {};
    if (isFromMe(payload)) {
      return res.status(200).json({ success: true, message: 'Evento ignorado: fromMe.' });
    }
    if (!isIncomingMessageEvent(payload)) {
      return res.status(200).json({ success: true, message: 'Evento ignorado: nao e mensagem de entrada.' });
    }

    const text = extractTextFromWebhook(payload);
    const connectedNumber = resolveConnectedNumber();
    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: mergeKnownInstanceNumbers([connectedNumber]),
      messageText: text,
    });
    const eventName = normalizeWebhookEventName(
      payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || ''
    );

    const result = await handleIncomingMessage(payload, text, {
      preExtractedPhone: extraction.phone,
      preExtractedText: text,
      preExtractedInstanceNumbers: extraction.instanceNumbers,
      eventName,
    });

    return res.status(200).json({ success: true, data: { phone: extraction.phone, text, result } });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao processar webhook WhatsApp');
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar webhook WhatsApp',
      error: { code: 'WHATSAPP_WEBHOOK_ERROR', message: error?.message },
    });
  }
};