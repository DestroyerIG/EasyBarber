/**
 * Gerenciamento de sessões do bot WhatsApp.
 * Cada sessão representa uma conversa ativa entre o bot e um número de phone.
 */

import pool from '../../config/database.js';
import logger from '../../utils/logger.js';
import { SESSION_TIMEOUT_MS, STEPS } from './whatsappConstants.js';

/**
 * Busca sessão ativa para o phone/barbershop.
 * Retorna null se não encontrada.
 */
export const getSession = async (phone, barbershopId) => {
  const result = await pool.query(
    'SELECT * FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2 ORDER BY updated_at DESC LIMIT 1',
    [phone, barbershopId]
  );
  return result.rows?.[0] || null;
};

/**
 * Verifica se a sessão expirou (30 min de inatividade por padrão).
 */
export const isSessionExpired = (session) => {
  if (!session) return true;
  return (Date.now() - new Date(session.updated_at).getTime()) > SESSION_TIMEOUT_MS;
};

/**
 * Cria sessão nova no step 'menu' com data vazia.
 */
export const createSession = async (phone, barbershopId) => {
  await pool.query(
    `INSERT INTO whatsapp_sessions (phone, barbershop_id, step, data) VALUES ($1, $2, $3, '{}')`,
    [phone, barbershopId, STEPS.MENU]
  );
};

/**
 * Atualiza step e data da sessão.
 */
export const updateSession = async (phone, barbershopId, step, data) => {
  await pool.query(
    `UPDATE whatsapp_sessions 
     SET step = $1, data = $2, updated_at = CURRENT_TIMESTAMP
     WHERE phone = $3 AND barbershop_id = $4`,
    [step, JSON.stringify(data), phone, barbershopId]
  );
};

/**
 * Remove sessões do phone/barbershop.
 */
export const deleteSession = async (phone, barbershopId) => {
  await pool.query(
    'DELETE FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2',
    [phone, barbershopId]
  );
};
