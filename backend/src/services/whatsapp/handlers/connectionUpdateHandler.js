/**
 * connectionUpdateHandler.js — Handler para eventos connection-update da Evolution API.
 *
 * Estados tratados:
 *   open       → atualiza whatsapp (connectedNumber) no banco se mudou; invalida cache
 *   close      → invalida cache de tenant
 *   logout     → invalida cache de tenant
 *   connecting → log, sem ação
 */

import pool from '../../../config/database.js';
import logger from '../../../utils/logger.js';
import { invalidateTenant } from '../tenant/tenantCache.js';
import { stripToDigits } from '../utils/phoneUtils.js';

// ── Extração do estado ────────────────────────────────────────────────────────

const extractState = (rawPayload) => {
  const data = rawPayload?.data ?? rawPayload;
  return (
    data?.state
    ?? rawPayload?.state
    ?? data?.connection
    ?? rawPayload?.connection
    ?? null
  );
};

// ── Extração do número conectado (sem HTTP) ───────────────────────────────────

const extractConnectedPhone = (rawPayload) => {
  const data = rawPayload?.data ?? rawPayload;

  const candidates = [
    data?.me?.id,
    data?.me?.wid,
    data?.instance?.wid,
    data?.instance?.owner,
    data?.owner,
    rawPayload?.owner,
  ];

  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    // Strip @s.whatsapp.net / @lid suffix then digits only
    const raw = c.includes('@') ? c.split('@')[0] : c;
    const digits = stripToDigits(raw);
    if (digits.length >= 10) return digits;
  }

  return null;
};

// ── Update no banco ───────────────────────────────────────────────────────────

const updateConnectedNumber = async (instanceName, phone) => {
  try {
    await pool.query(
      `UPDATE barbershops
          SET whatsapp = $1
        WHERE lower(btrim(whatsapp_instance_name)) = $2
          AND active = true
          AND (whatsapp IS DISTINCT FROM $1)`,
      [phone, instanceName.trim().toLowerCase()],
    );
  } catch (err) {
    logger.error({ err, instanceName }, 'connectionUpdateHandler: failed to update connectedNumber');
  }
};

// ── Handler principal ─────────────────────────────────────────────────────────

/**
 * @param {object} rawPayload  Raw Evolution API connection-update body
 * @returns {Promise<{ ok: boolean, instanceName: string|null, state: string|null }>}
 */
export const handleConnectionUpdate = async (rawPayload) => {
  try {
    const instanceName = (
      rawPayload?.instance
      ?? rawPayload?.instanceName
      ?? rawPayload?.data?.instanceName
      ?? null
    );

    const state = extractState(rawPayload);

    logger.info({ instanceName, state }, 'connectionUpdateHandler: received');

    if (!instanceName) {
      return { ok: false, instanceName: null, state };
    }

    if (state === 'close' || state === 'logout') {
      invalidateTenant(instanceName);
      logger.info({ instanceName, state }, 'connectionUpdateHandler: tenant cache invalidated');
    }

    if (state === 'open') {
      const phone = extractConnectedPhone(rawPayload);
      if (phone) {
        await updateConnectedNumber(instanceName, phone);
        logger.info(
          { instanceName, phoneLast4: phone.slice(-4) },
          'connectionUpdateHandler: connectedNumber updated',
        );
      }
      // Always invalidate so next resolveTenant re-fetches fresh data from DB
      invalidateTenant(instanceName);
    }

    return { ok: true, instanceName, state };
  } catch (err) {
    logger.error({ err }, 'connectionUpdateHandler: unexpected error');
    return { ok: false, instanceName: null, state: null };
  }
};
