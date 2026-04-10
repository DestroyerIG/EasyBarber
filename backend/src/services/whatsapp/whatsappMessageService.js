/**
 * Envio de mensagens, formatação de templates e construção de menus.
 */

import { sendWhatsAppText } from '../whatsappClient.js';
import logger from '../../utils/logger.js';

/**
 * Envia mensagem via provider configurado (Evolution API).
 */
export const sendWhatsAppMessage = async (phone, message, context = {}) => {
  try {
    const sent = await sendWhatsAppText(phone, message, context);
    if (!sent) {
      logger.warn(
        {
          phone,
          remoteJidOriginal: context?.remoteJidOriginal || null,
        },
        'Mensagem nao enviada pelo provider WhatsApp'
      );
      return false;
    }

    logger.debug(
      {
        phone,
        remoteJidOriginal: context?.remoteJidOriginal || null,
      },
      'Mensagem enviada'
    );
    return true;
  } catch (error) {
    logger.error(
      {
        err: error,
        phone,
        remoteJidOriginal: context?.remoteJidOriginal || null,
      },
      'Erro ao enviar mensagem WhatsApp'
    );
    return false;
  }
};

/**
 * Substitui placeholders nas mensagens.
 */
export const formatMessage = (template, data = {}) => {
  if (!template) return '';

  let message = template;
  const placeholders = {
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
export const buildWelcomeMessage = (welcomeHeader, menuOptions, barbershopName) => {
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
