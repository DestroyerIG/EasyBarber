/**
 * whatsappConfigService.ts — Configuração do bot — busca e seed de config e menu options no banco.
 */

import { Prisma } from '@prisma/client';
import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { DEFAULT_BOT_CONFIG, FALLBACK_BOT_CONFIG, DEFAULT_MENU_OPTIONS, BotConfig, MenuOption } from './whatsappConstants.js';

// ── Menu option row shape returned by the DB ──────────────────────────────────

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

/**
 * Busca configuração de mensagens do bot (todas as mensagens configuráveis).
 */
export const getBotConfig = async (barbershopId: string): Promise<BotConfig> => {
  try {
    const dbConfig = await prisma.whatsappBotConfig.findFirst({
      where: { barbershopId },
    });

    if (dbConfig) {
      return {
        welcome_header:                    dbConfig.welcomeHeader                   ?? DEFAULT_BOT_CONFIG.welcome_header,
        ask_name_message:                  dbConfig.askNameMessage                  ?? DEFAULT_BOT_CONFIG.ask_name_message,
        attendant_message:                 dbConfig.attendantMessage                ?? DEFAULT_BOT_CONFIG.attendant_message,
        confirmation_message:              dbConfig.confirmationMessage             ?? DEFAULT_BOT_CONFIG.confirmation_message,
        reminder_message:                  dbConfig.reminderMessage                 ?? DEFAULT_BOT_CONFIG.reminder_message,
        invalid_option_message:            dbConfig.invalidOptionMessage            ?? DEFAULT_BOT_CONFIG.invalid_option_message,
        session_expired_message:           dbConfig.sessionExpiredMessage           ?? DEFAULT_BOT_CONFIG.session_expired_message,
        end_session_message:               dbConfig.endSessionMessage               ?? DEFAULT_BOT_CONFIG.end_session_message,
        name_validation_message:           dbConfig.nameValidationMessage           ?? DEFAULT_BOT_CONFIG.name_validation_message,
        no_slots_message:                  dbConfig.noSlotsMessage                  ?? DEFAULT_BOT_CONFIG.no_slots_message,
        cancel_no_appointments_message:    dbConfig.cancelNoAppointmentsMessage     ?? DEFAULT_BOT_CONFIG.cancel_no_appointments_message,
        cancel_list_message:               dbConfig.cancelListMessage               ?? DEFAULT_BOT_CONFIG.cancel_list_message,
        cancel_success_message:            dbConfig.cancelSuccessMessage            ?? DEFAULT_BOT_CONFIG.cancel_success_message,
        reschedule_no_appointments_message: dbConfig.rescheduleNoAppointmentsMessage ?? DEFAULT_BOT_CONFIG.reschedule_no_appointments_message,
        reschedule_list_message:           dbConfig.rescheduleListMessage           ?? DEFAULT_BOT_CONFIG.reschedule_list_message,
        no_previous_appointments_message:  dbConfig.noPreviousAppointmentsMessage   ?? DEFAULT_BOT_CONFIG.no_previous_appointments_message,
        rating_question_message:           dbConfig.ratingQuestionMessage           ?? DEFAULT_BOT_CONFIG.rating_question_message,
        rating_confirmation_message:       dbConfig.ratingConfirmationMessage       ?? DEFAULT_BOT_CONFIG.rating_confirmation_message,
        promotions_message:                dbConfig.promotionsMessage               ?? DEFAULT_BOT_CONFIG.promotions_message,
        instagram_message:                 dbConfig.instagramMessage                ?? DEFAULT_BOT_CONFIG.instagram_message,
      };
    }

    return DEFAULT_BOT_CONFIG;
  } catch (error) {
    logger.error({ err: error, barbershopId }, 'Erro ao buscar config do bot');
    return DEFAULT_BOT_CONFIG;
  }
};

/**
 * Busca opções do menu dinâmico do bot.
 * Nota: whatsapp_menu_options não está no schema Prisma — usa $queryRaw.
 */
export const getMenuOptions = async (barbershopId: string): Promise<MenuOptionRow[]> => {
  try {
    const rows = await prisma.$queryRaw<MenuOptionRow[]>(Prisma.sql`
      SELECT * FROM whatsapp_menu_options
       WHERE barbershop_id = ${barbershopId}::uuid AND active = true
       ORDER BY option_order ASC
    `);

    if (rows.length > 0) {
      return rows;
    }

    await seedDefaultMenuOptions(barbershopId);
    return prisma.$queryRaw<MenuOptionRow[]>(Prisma.sql`
      SELECT * FROM whatsapp_menu_options
       WHERE barbershop_id = ${barbershopId}::uuid AND active = true
       ORDER BY option_order ASC
    `);
  } catch (error) {
    logger.error({ err: error, barbershopId }, 'Erro ao buscar opções do menu');
    return [];
  }
};

/**
 * Seed de opções padrão do menu para uma barbearia.
 */
export const seedDefaultMenuOptions = async (barbershopId: string): Promise<void> => {
  for (const opt of DEFAULT_MENU_OPTIONS as MenuOption[]) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
      VALUES (${barbershopId}::uuid, ${opt.order}, ${opt.label}, ${opt.emoji}, 'system', ${opt.handler}, true)
      ON CONFLICT (barbershop_id, option_order) DO NOTHING
    `);
  }
};
