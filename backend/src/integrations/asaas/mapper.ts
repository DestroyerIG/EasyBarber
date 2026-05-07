import crypto from 'crypto';
import { mapAsaasStatusToInternalStatus } from '../../services/billing/statusMapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InternalSubscriptionStatus =
  | 'trialing'
  | 'pending'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete';

export interface AsaasWebhookPayment {
  id?: string | null;
  status?: string | null;
  subscription?: string | null;
  customer?: string | null;
  externalReference?: string | null;
  value?: number | null;
  dueDate?: string | null;
  confirmedDate?: string | null;
  clientPaymentDate?: string | null;
  paymentDate?: string | null;
  dateCreated?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface AsaasWebhookPayload {
  id?: string | null;
  event?: string | null;
  payment?: AsaasWebhookPayment;
  [key: string]: unknown;
}

export interface AsaasPixQrCodePayload {
  encodedImage?: string | null;
  qrCode?: string | null;
  qrCodeImage?: string | null;
  image?: string | null;
  payload?: string | null;
  pixCopyAndPaste?: string | null;
  copyPaste?: string | null;
  brCode?: string | null;
  expirationDate?: string | null;
  [key: string]: unknown;
}

export interface AsaasPixData {
  qrCode: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
  dueDate: string | null;
  confirmedDate: string | null;
}

export interface NormalizedAsaasWebhookPayload {
  eventId: string;
  eventType: string;
  externalStatus: string | null;
  internalStatus: InternalSubscriptionStatus;
  paymentId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  externalReference: string | null;
  barbershopId: string | null;
  amount: number | null;
  dueDate: string | null;
  confirmedDate: string | null;
  payment: AsaasWebhookPayment;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }

    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnly.test(value)) {
      const parsedDateOnly = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(parsedDateOnly.getTime()) ? null : parsedDateOnly;
    }
  }

  return null;
};

const toIso = (value: unknown): string | null => {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
};

const sanitizeUuidLike = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed) ? trimmed : null;
};

export const extractBarbershopIdFromExternalReference = (
  externalReference: unknown
): string | null => {
  if (typeof externalReference !== 'string' || externalReference.trim().length === 0) {
    return null;
  }

  const trimmed = externalReference.trim();

  const directMatch = sanitizeUuidLike(trimmed);
  if (directMatch) {
    return directMatch;
  }

  const prefixedMatch = trimmed.match(/barbershop:([0-9a-f-]{36})/i);
  if (prefixedMatch?.[1]) {
    return sanitizeUuidLike(prefixedMatch[1]);
  }

  return null;
};

export const buildAsaasWebhookEventId = (payload: AsaasWebhookPayload = {}): string => {
  const rawId = payload?.id;
  if (typeof rawId === 'string' && rawId.trim().length > 0) {
    return rawId.trim();
  }

  const payment = payload?.payment || {};
  const fingerprintSource = [
    payload?.event || 'UNKNOWN_EVENT',
    payment?.id || 'UNKNOWN_PAYMENT',
    payment?.status || 'UNKNOWN_STATUS',
    payment?.dateCreated || payment?.updatedAt || payment?.dueDate || 'UNKNOWN_DATE',
    payment?.value || 'UNKNOWN_VALUE',
  ].join('|');

  return `evt_${crypto.createHash('sha256').update(fingerprintSource).digest('hex')}`;
};

const resolvePixQrCode = (qrCodePayload: AsaasPixQrCodePayload | null | undefined): string | null => {
  if (!qrCodePayload || typeof qrCodePayload !== 'object') {
    return null;
  }

  const encodedImage =
    qrCodePayload.encodedImage ||
    qrCodePayload.qrCode ||
    qrCodePayload.qrCodeImage ||
    qrCodePayload.image ||
    null;

  if (typeof encodedImage !== 'string' || encodedImage.trim().length === 0) {
    return null;
  }

  if (
    encodedImage.startsWith('http://') ||
    encodedImage.startsWith('https://') ||
    encodedImage.startsWith('data:')
  ) {
    return encodedImage;
  }

  return `data:image/png;base64,${encodedImage}`;
};

const resolvePixCopyPaste = (
  qrCodePayload: AsaasPixQrCodePayload | null | undefined
): string | null => {
  if (!qrCodePayload || typeof qrCodePayload !== 'object') {
    return null;
  }

  const candidate =
    qrCodePayload.payload ||
    qrCodePayload.pixCopyAndPaste ||
    qrCodePayload.copyPaste ||
    qrCodePayload.brCode ||
    null;

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
};

export const mapAsaasPaymentToPixData = (
  payment: AsaasWebhookPayment = {},
  qrCodePayload: AsaasPixQrCodePayload | null = null
): AsaasPixData => {
  return {
    qrCode: resolvePixQrCode(qrCodePayload),
    pixCopyPaste: resolvePixCopyPaste(qrCodePayload),
    expiresAt: toIso(qrCodePayload?.expirationDate || payment?.dueDate),
    dueDate: toIso(payment?.dueDate),
    confirmedDate: toIso(
      payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate
    ),
  };
};

export const normalizeAsaasWebhookPayload = (
  payload: AsaasWebhookPayload = {}
): NormalizedAsaasWebhookPayload => {
  const payment: AsaasWebhookPayment = payload?.payment || {};
  const externalStatus = payment?.status || null;
  const eventType = payload?.event || 'UNKNOWN_EVENT';

  return {
    eventId: buildAsaasWebhookEventId(payload),
    eventType,
    externalStatus,
    internalStatus: mapAsaasStatusToInternalStatus(externalStatus) as InternalSubscriptionStatus,
    paymentId: payment?.id || null,
    subscriptionId: payment?.subscription || null,
    customerId: payment?.customer || null,
    externalReference: payment?.externalReference || null,
    barbershopId: extractBarbershopIdFromExternalReference(payment?.externalReference),
    amount: typeof payment?.value === 'number' ? payment.value : null,
    dueDate: toIso(payment?.dueDate),
    confirmedDate: toIso(
      payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate
    ),
    payment,
  };
};

export const asaasMapper = {
  buildAsaasWebhookEventId,
  extractBarbershopIdFromExternalReference,
  mapAsaasPaymentToPixData,
  normalizeAsaasWebhookPayload,
};
