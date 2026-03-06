/**
 * Configuração do bot — busca e seed de config e menu options no banco.
 */

import pool from '../../config/database.js';
import logger from '../../utils/logger.js';
import { DEFAULT_BOT_CONFIG, FALLBACK_BOT_CONFIG, DEFAULT_MENU_OPTIONS } from './whatsappConstants.js';

/**
 * Busca configuração de mensagens do bot (todas as mensagens configuráveis).
 */
export const getBotConfig = async (barbershopId) => {
  try {
    const result = await pool.query(
      'SELECT * FROM whatsapp_bot_config WHERE barbershop_id = $1',
      [barbershopId]
    );

    if (result.rows.length > 0) {
      const dbConfig = result.rows[0];
      const merged = {};
      for (const [key, defaultValue] of Object.entries(DEFAULT_BOT_CONFIG)) {
        merged[key] = dbConfig[key] || defaultValue;
      }
      return merged;
    }

    return DEFAULT_BOT_CONFIG;
  } catch (error) {
    logger.error({ err: error, barbershopId }, 'Erro ao buscar config do bot');
    return FALLBACK_BOT_CONFIG;
  }
};

/**
 * Busca opções do menu dinâmico do bot.
 */
export const getMenuOptions = async (barbershopId) => {
  try {
    const result = await pool.query(
      `SELECT * FROM whatsapp_menu_options 
       WHERE barbershop_id = $1 AND active = true 
       ORDER BY option_order ASC`,
      [barbershopId]
    );

    if (result.rows.length > 0) {
      return result.rows;
    }

    await seedDefaultMenuOptions(barbershopId);
    const seeded = await pool.query(
      `SELECT * FROM whatsapp_menu_options 
       WHERE barbershop_id = $1 AND active = true 
       ORDER BY option_order ASC`,
      [barbershopId]
    );
    return seeded.rows;
  } catch (error) {
    logger.error({ err: error, barbershopId }, 'Erro ao buscar opções do menu');
    return [];
  }
};

/**
 * Seed de opções padrão do menu para uma barbearia.
 */
export const seedDefaultMenuOptions = async (barbershopId) => {
  for (const opt of DEFAULT_MENU_OPTIONS) {
    await pool.query(
      `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
       VALUES ($1, $2, $3, $4, 'system', $5, true)
       ON CONFLICT (barbershop_id, option_order) DO NOTHING`,
      [barbershopId, opt.order, opt.label, opt.emoji, opt.handler]
    );
  }
};
