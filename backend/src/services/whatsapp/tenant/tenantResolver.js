/**
 * tenantResolver.js — Resolve barbershop pelo instanceName da Evolution API.
 *
 * Fluxo:
 *   1. Consultar tenantCache
 *   2. Cache miss → query no banco (barbershops + subscription_status)
 *   3. Popular cache com TTL de 60s
 *   4. Retornar { barbershop, connectedNumber, subscriptionStatus } ou null
 *
 * Nunca lança exceção — retorna null em caso de erro ou não encontrado.
 */

import pool from '../../../config/database.js';
import logger from '../../../utils/logger.js';
import { getTenant, setTenant } from './tenantCache.js';

const QUERY = `
  SELECT id,
         name,
         whatsapp                AS connected_number,
         whatsapp_instance_name  AS instance_name,
         subscription_status
    FROM barbershops
   WHERE active = true
     AND NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
     AND lower(btrim(whatsapp_instance_name)) = $1
   LIMIT 1
`;

/**
 * Resolves the tenant (barbershop) associated with a WhatsApp instance.
 *
 * @param {string} instanceName  Raw instanceName from Evolution API webhook
 * @returns {Promise<{
 *   barbershop: { id: string, name: string, instanceName: string },
 *   connectedNumber: string|null,
 *   subscriptionStatus: string|null,
 * } | null>}
 */
export const resolveTenant = async (instanceName) => {
  if (!instanceName || typeof instanceName !== 'string') return null;

  const key = instanceName.trim().toLowerCase();
  if (!key) return null;

  // 1. Cache hit
  const cached = getTenant(key);
  if (cached !== undefined) return cached;

  // 2. Database query
  try {
    const result = await pool.query(QUERY, [key]);

    if (!result.rows.length) {
      logger.debug({ instanceName: key }, 'resolveTenant: barbershop not found');
      return null;
    }

    const row = result.rows[0];
    const tenant = {
      barbershop: {
        id: row.id,
        name: row.name,
        instanceName: row.instance_name,
      },
      connectedNumber: row.connected_number || null,
      subscriptionStatus: row.subscription_status || null,
    };

    setTenant(key, tenant);
    return tenant;
  } catch (err) {
    logger.error(
      { err, instanceName: key },
      'resolveTenant: database query failed',
    );
    return null;
  }
};
