/**
 * Envio de mensagens, formatação de templates e construção de menus.
 */

import { sendWhatsAppText } from '../whatsappClient.js';
import logger from '../../utils/logger.js';

export interface SendWhatsAppMessageContext {
  remoteJidOriginal?: string | null;
  eventName?: string | null;
  dedupeKey?: string | null;
  messageId?: string | null;
  captureCollector?: (message: string) => void;
  simulate?: boolean;
  instanceName?: string | null;
  barbershopId?: string | null;
  [key: string]: unknown;
}

export interface FormatMessageData {
  barbershopName?: string;
  serviceName?: string;
  barberName?: string;
  dateFormatted?: string;
  time?: string;
  servicePrice?: string;
  clientName?: string;
  ratingText?: string;
  instagramHandle?: string;
}

export interface MenuOption {
  label: string;
  emoji?: string;
}

/**
 * Envia mensagem via provider configurado (Evolution API).
 */
export const sendWhatsAppMessage = async (
  phone: string | number,
  message: string | number,
  context: SendWhatsAppMessageContext = {},
): Promise<boolean> => {
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : String(phone || '').trim();
  const normalizedMessage = typeof message === 'string' ? message.trim() : String(message || '').trim();
  const logContext = {
    phone: normalizedPhone || null,
    remoteJidOriginal: context?.remoteJidOriginal || null,
    eventName: context?.eventName || null,
    dedupeKey: context?.dedupeKey || null,
    messageId: context?.messageId || null,
    messageLength: normalizedMessage.length,
  };

  if (!normalizedPhone) {
    logger.warn(logContext, 'Mensagem nao enviada: telefone ausente');
    return false;
  }

  if (!normalizedMessage) {
    logger.warn(logContext, 'Mensagem nao enviada: texto vazio');
    return false;
  }

  try {
    if (typeof context?.captureCollector === 'function') {
      context.captureCollector(normalizedMessage);
    }

    if (context?.simulate === true) {
      logger.info(logContext, 'ENVIO DISPARADO (SIMULADOR)');
      return true;
    }

    logger.info(logContext, 'ENVIO DISPARADO');
    logger.debug(logContext, 'Solicitacao de envio WhatsApp ao provider');

    const sent = await sendWhatsAppText(normalizedPhone, normalizedMessage, context);

    if (!sent) {
      logger.warn(logContext, 'Mensagem nao enviada pelo provider WhatsApp');
      return false;
    }

    logger.info(logContext, 'Mensagem enviada via provider WhatsApp');
    return true;
  } catch (error) {
    logger.error({ err: error, ...logContext }, 'Erro ao enviar mensagem WhatsApp');
    return false;
  }
};

/**
 * Substitui placeholders nas mensagens.
 */
export const formatMessage = (template: string, data: FormatMessageData = {}): string => {
  if (!template) return '';

  let message = template;
  const placeholders: Record<string, string> = {
    '{nome_barbearia}': data.barbershopName || '',
    '{servico}': data.serviceName || '',
    '{barbeiro}': data.barberName || '',
    '{data}': data.dateFormatted || '',
    '{horario}': data.time || '',
    '{valor}': data.servicePrice || '',
    '{nome_cliente}': data.clientName || '',
    '{avaliacao}': data.ratingText || '',
    '{instagram_handle}': data.instagramHandle || '',
  };

  for (const [key, value] of Object.entries(placeholders)) {
    message = message.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value || '');
  }

  return message;
};

/**
 * Gera a welcome message a partir do header + opções do menu.
 */
export const buildWelcomeMessage = (
  welcomeHeader: string | null | undefined,
  menuOptions: MenuOption[],
  barbershopName: string,
): string => {
  const header = formatMessage(welcomeHeader || 'Olá 👋 Bem-vindo!', { barbershopName });

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  let menuText = '';
  menuOptions.forEach((opt, index) => {
    const num = index < 10 ? numberEmojis[index] : `${index + 1}.`;
    const emoji = opt.emoji ? ` ${opt.emoji}` : '';
    menuText += `\n${num} *${opt.label}*${emoji}`;
  });

  return header + '\n' + menuText;
};
