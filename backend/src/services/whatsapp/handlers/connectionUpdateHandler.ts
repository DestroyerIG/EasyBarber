/**
 * connectionUpdateHandler.ts — Handler para eventos connection-update da Evolution API.
 *
 * Estados tratados:
 *   open       → atualiza whatsapp (connectedNumber) no banco se mudou; invalida cache
 *   close      → invalida cache de tenant
 *   logout     → invalida cache de tenant
 *   connecting → log, sem ação
 */

import { Prisma } from '@prisma/client';
import logger from '../../../utils/logger.js';
import { prisma } from '../../../config/prisma.js';
import { invalidateTenant } from '../tenant/tenantCache.js';
import { stripToDigits } from '../utils/phoneUtils.js';
import { updateInstanceDirect } from '../whatsappInstanceCache.js';

// ── Extração do estado ────────────────────────────────────────────────────────

const extractState = (rawPayload: unknown): string | null => {
  const p = rawPayload as Record<string, unknown> | null;
  const data = (p?.data ?? p) as Record<string, unknown> | null;
  return (
    (data?.state as string | undefined)
    ?? (p?.state as string | undefined)
    ?? (data?.connection as string | undefined)
    ?? (p?.connection as string | undefined)
    ?? null
  );
};

// ── Extração do número conectado (sem HTTP) ───────────────────────────────────

const extractConnectedPhone = (rawPayload: unknown): string | null => {
  const p = rawPayload as Record<string, unknown> | null;
  const data = (p?.data ?? p) as Record<string, unknown> | null;
  const me = data?.me as Record<string, unknown> | undefined;
  const instance = data?.instance as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    me?.id,
    me?.wid,
    instance?.wid,
    instance?.owner,
    data?.owner,
    p?.owner,
  ];

  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    // Strip @s.whatsapp.net / @lid suffix then digits only
    const raw = c.includes('@') ? (c.split('@')[0] ?? '') : c;
    const digits = stripToDigits(raw);
    if (digits.length >= 10) return digits;
  }

  return null;
};

// ── Update no banco ───────────────────────────────────────────────────────────

const updateConnectedNumber = async (instanceName: string, phone: string): Promise<void> => {
  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE barbershops
         SET whatsapp = ${phone}
       WHERE lower(btrim(whatsapp_instance_name)) = ${instanceName.trim().toLowerCase()}
         AND active = true
         AND (whatsapp IS DISTINCT FROM ${phone})
    `);
  } catch (err) {
    logger.error({ err, instanceName }, 'connectionUpdateHandler: failed to update connectedNumber');
  }
};

// ── Handler principal ─────────────────────────────────────────────────────────

export interface ConnectionUpdateResult {
  ok: boolean;
  instanceName: string | null;
  state: string | null;
}

/**
 * @param rawPayload  Raw Evolution API connection-update body
 */
export const handleConnectionUpdate = async (rawPayload: unknown): Promise<ConnectionUpdateResult> => {
  try {
    const p = rawPayload as Record<string, unknown> | null;
    const data = p?.data as Record<string, unknown> | undefined;

    const instanceName = (
      (p?.instance as string | undefined)
      ?? (p?.instanceName as string | undefined)
      ?? (data?.instanceName as string | undefined)
      ?? null
    );

    const state = extractState(rawPayload);

    logger.info({ instanceName, state }, 'connectionUpdateHandler: received');

    if (!instanceName) {
      return { ok: false, instanceName: null, state };
    }

    if (state === 'connecting') {
      updateInstanceDirect(instanceName, { status: 'connecting' });
      logger.info({ instanceName }, 'connectionUpdateHandler: estado connecting — cache atualizado');
    }

    if (state === 'close' || state === 'logout') {
      invalidateTenant(instanceName);
      updateInstanceDirect(instanceName, { status: state });
      logger.info({ instanceName, state }, 'connectionUpdateHandler: tenant cache invalidated');
    }

    if (state === 'open') {
      updateInstanceDirect(instanceName, { status: 'open' });
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
