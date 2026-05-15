export interface NormalizedQr {
  qrCode: string | null;
  pairingCode: string | null;
  expiresAt: Date | null;
  source: string;
}

const toBase64DataUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  return `data:image/png;base64,${trimmed}`;
};

const extractBase64 = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 50) return null;
  return toBase64DataUrl(s);
};

const extractPairingCode = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  // Pairing codes are short numeric/alphanumeric strings (e.g. "ABCD-1234")
  if (s.length > 0 && s.length <= 20 && !s.startsWith('data:') && !/^[A-Za-z0-9+/]{40,}={0,2}$/.test(s)) {
    return s;
  }
  return null;
};

/**
 * Normaliza qualquer payload de QR Code da Evolution API para formato canônico.
 *
 * Aceita formatos v1 e v2:
 *   - { base64 }
 *   - { data: { base64 } }
 *   - { data: { qrcode: { base64 } } }
 *   - { qrcode: { base64 } }
 *   - { code }            (base64 raw sem prefixo)
 *   - { pairingCode }     (código de emparelhamento numérico)
 */
export const normalizeEvolutionQrPayload = (raw: unknown, source: string): NormalizedQr => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const data = (p['data'] ?? {}) as Record<string, unknown>;
  const qrcode = ((data['qrcode'] ?? p['qrcode'] ?? {}) as Record<string, unknown>);

  const base64Candidates: unknown[] = [
    qrcode['base64'],
    data['base64'],
    p['base64'],
    qrcode['code'],
    p['code'],
  ];

  let qrCode: string | null = null;
  for (const c of base64Candidates) {
    const result = extractBase64(c);
    if (result) { qrCode = result; break; }
  }

  const pairingCandidates: unknown[] = [
    p['pairingCode'],
    data['pairingCode'],
    qrcode['pairingCode'],
  ];

  let pairingCode: string | null = null;
  for (const c of pairingCandidates) {
    const result = extractPairingCode(c);
    if (result) { pairingCode = result; break; }
  }

  // Evolution API QR codes expire after 60s by default
  const expiresAt = qrCode ? new Date(Date.now() + 60_000) : null;

  return { qrCode, pairingCode, expiresAt, source };
};
