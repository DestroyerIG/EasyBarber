import logger from '../../../utils/logger.js';

const QR_TTL_MS = 60_000;

interface QrEntry {
  qrCode: string;
  expiresAt: number;
}

const qrCache = new Map<string, QrEntry>();

export const getQrCacheSize = (): number => qrCache.size;

export const getCachedQrCode = (instanceName: string): string | null => {
  const entry = qrCache.get(instanceName.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    qrCache.delete(instanceName.toLowerCase());
    return null;
  }
  return entry.qrCode;
};

const extractQrBase64 = (rawPayload: unknown): string | null => {
  const p = rawPayload as Record<string, unknown> | null;
  const data = p?.data as Record<string, unknown> | undefined;
  const qrcode = (data?.qrcode ?? p?.qrcode) as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    qrcode?.base64,
    qrcode?.code,
    data?.base64,
    p?.base64,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 50) {
      const trimmed = c.trim();
      if (trimmed.startsWith('data:image/')) return trimmed;
      return `data:image/png;base64,${trimmed}`;
    }
  }
  return null;
};

const extractInstanceName = (rawPayload: unknown): string | null => {
  const p = rawPayload as Record<string, unknown> | null;
  const v = p?.instance ?? p?.instanceName ?? (p?.data as Record<string, unknown>)?.instanceName;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

export const handleQrcodeUpdated = (rawPayload: unknown): void => {
  try {
    const instanceName = extractInstanceName(rawPayload);
    const qrCode = extractQrBase64(rawPayload);

    if (!instanceName || !qrCode) {
      logger.debug({ payloadKeys: Object.keys((rawPayload as Record<string, unknown>) ?? {}) }, 'qrcodeUpdatedHandler: sem qr extraivel');
      return;
    }

    qrCache.set(instanceName.toLowerCase(), { qrCode, expiresAt: Date.now() + QR_TTL_MS });
    logger.info({ instanceName }, 'qrcodeUpdatedHandler: QR Code cacheado');
  } catch (err) {
    logger.error({ err }, 'qrcodeUpdatedHandler: unexpected error');
  }
};
