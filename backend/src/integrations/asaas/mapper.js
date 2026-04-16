import crypto from 'crypto';
import { mapAsaasStatusToInternalStatus } from '../../services/billing/statusMapper.js';

const parseDate = (value) => {
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

const toIso = (value) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
};

const sanitizeUuidLike = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed) ? trimmed : null;
};

export const extractBarbershopIdFromExternalReference = (externalReference) => {
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

export const buildAsaasWebhookEventId = (payload = {}) => {
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

const resolvePixQrCode = (qrCodePayload) => {
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

  if (encodedImage.startsWith('http://') || encodedImage.startsWith('https://') || encodedImage.startsWith('data:')) {
    return encodedImage;
  }

  return `data:image/png;base64,${encodedImage}`;
};

const resolvePixCopyPaste = (qrCodePayload) => {
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

export const mapAsaasPaymentToPixData = (payment = {}, qrCodePayload = null) => {
  return {
    qrCode: resolvePixQrCode(qrCodePayload),
    pixCopyPaste: resolvePixCopyPaste(qrCodePayload),
    expiresAt: toIso(qrCodePayload?.expirationDate || payment?.dueDate),
    dueDate: toIso(payment?.dueDate),
    confirmedDate: toIso(payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate),
  };
};

export const normalizeAsaasWebhookPayload = (payload = {}) => {
  const payment = payload?.payment || {};
  const externalStatus = payment?.status || null;
  const eventType = payload?.event || 'UNKNOWN_EVENT';

  return {
    eventId: buildAsaasWebhookEventId(payload),
    eventType,
    externalStatus,
    internalStatus: mapAsaasStatusToInternalStatus(externalStatus),
    paymentId: payment?.id || null,
    subscriptionId: payment?.subscription || null,
    customerId: payment?.customer || null,
    externalReference: payment?.externalReference || null,
    barbershopId: extractBarbershopIdFromExternalReference(payment?.externalReference),
    amount: typeof payment?.value === 'number' ? payment.value : null,
    dueDate: toIso(payment?.dueDate),
    confirmedDate: toIso(payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate),
    payment,
  };
};

export const asaasMapper = {
  buildAsaasWebhookEventId,
  extractBarbershopIdFromExternalReference,
  mapAsaasPaymentToPixData,
  normalizeAsaasWebhookPayload,
};
