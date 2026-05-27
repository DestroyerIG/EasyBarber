/**
 * metaWhatsappService.ts — Transport layer for the official Meta WhatsApp
 * Cloud API (Graph API). Replaces the Evolution API integration.
 *
 * Each barbershop is a separate tenant with its own phone number and access
 * token (manual credentials model). Outbound goes to
 * POST /{phone_number_id}/messages; inbound arrives on a single app webhook
 * and is routed back to the barbershop by phone_number_id.
 */

import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';

const GRAPH_BASE = 'https://graph.facebook.com';
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v23.0';
const TIMEOUT_MS = 15_000;

export interface MetaCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string | null;
}

/** Strips everything but digits — Meta wants the recipient in E.164 without '+'. */
const toRecipient = (phone: string): string => String(phone ?? '').replace(/\D/g, '');

/**
 * Returns the Meta credentials for a barbershop, or null when it has not been
 * configured for the Meta provider (no phone_number_id / token).
 */
export const getMetaCredentials = async (
  barbershopId: string,
): Promise<MetaCredentials | null> => {
  if (!barbershopId) return null;
  try {
    const row = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        whatsappPhoneNumberId: true,
        whatsappAccessToken: true,
        whatsappWabaId: true,
      },
    });
    if (!row?.whatsappPhoneNumberId || !row.whatsappAccessToken) return null;
    return {
      phoneNumberId: row.whatsappPhoneNumberId,
      accessToken: row.whatsappAccessToken,
      wabaId: row.whatsappWabaId ?? null,
    };
  } catch (err) {
    logger.error({ err, barbershopId }, 'metaWhatsapp: falha ao buscar credenciais');
    return null;
  }
};

/**
 * Resolves the barbershop that owns a given Meta phone_number_id. Used by the
 * inbound webhook to route a message to the correct tenant.
 */
export const resolveBarbershopByPhoneNumberId = async (
  phoneNumberId: string,
): Promise<{ id: string; name: string; subscriptionStatus: string | null; displayNumber: string | null } | null> => {
  if (!phoneNumberId) return null;
  try {
    const row = await prisma.barbershop.findFirst({
      where: { whatsappPhoneNumberId: phoneNumberId, active: true },
      select: { id: true, name: true, subscriptionStatus: true, whatsapp: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      subscriptionStatus: row.subscriptionStatus ?? null,
      displayNumber: row.whatsapp ?? null,
    };
  } catch (err) {
    logger.error({ err, phoneNumberId }, 'metaWhatsapp: falha ao resolver tenant por phone_number_id');
    return null;
  }
};

/** Masks a phone_number_id for display (keeps last 4). */
const maskId = (id: string | null): string | null =>
  id ? `${'•'.repeat(Math.max(id.length - 4, 0))}${id.slice(-4)}` : null;

export interface MetaConfigStatus {
  configured: boolean;
  phoneNumberIdMasked: string | null;
  wabaId: string | null;
  displayNumber: string | null;
}

/** Read-only config snapshot for the credentials screen (never returns the token). */
export const getMetaConfigStatus = async (barbershopId: string): Promise<MetaConfigStatus> => {
  const row = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { whatsappPhoneNumberId: true, whatsappWabaId: true, whatsappAccessToken: true, whatsapp: true },
  });
  return {
    configured: Boolean(row?.whatsappPhoneNumberId && row?.whatsappAccessToken),
    phoneNumberIdMasked: maskId(row?.whatsappPhoneNumberId ?? null),
    wabaId: row?.whatsappWabaId ?? null,
    displayNumber: row?.whatsapp ?? null,
  };
};

/** Persists Meta credentials for a barbershop. */
export const saveMetaCredentials = async (
  barbershopId: string,
  input: { phoneNumberId: string; accessToken: string; wabaId?: string | null; displayNumber?: string | null },
): Promise<void> => {
  await prisma.barbershop.update({
    where: { id: barbershopId },
    data: {
      whatsappPhoneNumberId: input.phoneNumberId,
      whatsappAccessToken: input.accessToken,
      whatsappWabaId: input.wabaId ?? null,
      ...(input.displayNumber ? { whatsapp: input.displayNumber } : {}),
    },
  });
  logger.info({ barbershopId, phoneNumberId: input.phoneNumberId }, 'metaWhatsapp: credenciais salvas');
};

/** Clears Meta credentials (disconnect). */
export const clearMetaCredentials = async (barbershopId: string): Promise<void> => {
  await prisma.barbershop.update({
    where: { id: barbershopId },
    data: { whatsappPhoneNumberId: null, whatsappAccessToken: null, whatsappWabaId: null },
  });
  logger.info({ barbershopId }, 'metaWhatsapp: credenciais removidas');
};

interface GraphResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function graphRequest(
  method: string,
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<GraphResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${GRAPH_BASE}/${API_VERSION}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a plain text message to a user. Returns true on success.
 *
 * Meta only allows free-form text inside the 24h customer-service window
 * (i.e. after the user has messaged the business). Since our bot only ever
 * replies to inbound messages, we are always inside that window.
 */
export const sendMetaText = async (
  creds: MetaCredentials,
  toPhone: string,
  text: string,
): Promise<boolean> => {
  const to = toRecipient(toPhone);
  const body = String(text ?? '').trim();
  if (!to || !body) {
    logger.warn({ toLast4: to.slice(-4), hasText: Boolean(body) }, 'metaWhatsapp: envio ignorado (destino ou texto vazio)');
    return false;
  }

  try {
    const result = await graphRequest('POST', `/${creds.phoneNumberId}/messages`, creds.accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    });

    if (!result.ok) {
      logger.error(
        { status: result.status, body: result.body, phoneNumberId: creds.phoneNumberId, toLast4: to.slice(-4) },
        'metaWhatsapp: Graph API rejeitou envio',
      );
      return false;
    }

    logger.info(
      { phoneNumberId: creds.phoneNumberId, toLast4: to.slice(-4), messageLength: body.length },
      'metaWhatsapp: mensagem enviada',
    );
    return true;
  } catch (err) {
    logger.error({ err, phoneNumberId: creds.phoneNumberId, toLast4: to.slice(-4) }, 'metaWhatsapp: erro de rede ao enviar');
    return false;
  }
};

/**
 * Validates a set of credentials by reading the phone number node. Returns the
 * verified display number + name when valid, else null. Used by the
 * credentials form to confirm the token/phone_number_id work.
 */
export const verifyMetaCredentials = async (
  creds: MetaCredentials,
): Promise<{ ok: boolean; displayPhoneNumber: string | null; verifiedName: string | null; error: string | null }> => {
  try {
    const result = await graphRequest(
      'GET',
      `/${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      creds.accessToken,
    );
    if (!result.ok) {
      const body = result.body as { error?: { message?: string } } | null;
      return { ok: false, displayPhoneNumber: null, verifiedName: null, error: body?.error?.message ?? `HTTP ${result.status}` };
    }
    const body = result.body as { display_phone_number?: string; verified_name?: string } | null;
    return {
      ok: true,
      displayPhoneNumber: body?.display_phone_number ?? null,
      verifiedName: body?.verified_name ?? null,
      error: null,
    };
  } catch (err) {
    return { ok: false, displayPhoneNumber: null, verifiedName: null, error: err instanceof Error ? err.message : String(err) };
  }
};
