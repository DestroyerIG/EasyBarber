import { describe, it, expect } from 'vitest';
import { normalizeEvolutionQrPayload } from '../services/whatsapp/utils/qrNormalizer.js';

const VALID_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // 1x1 PNG

describe('normalizeEvolutionQrPayload', () => {
  it('returns nulls for empty payload', () => {
    const result = normalizeEvolutionQrPayload({}, 'test');
    expect(result.qrCode).toBeNull();
    expect(result.pairingCode).toBeNull();
    expect(result.expiresAt).toBeNull();
    expect(result.source).toBe('test');
  });

  it('extracts base64 from top-level base64 field', () => {
    const result = normalizeEvolutionQrPayload({ base64: VALID_BASE64 }, 'test');
    expect(result.qrCode).toContain('data:image/png;base64,');
  });

  it('extracts base64 with data:image/ prefix unchanged', () => {
    const dataUrl = `data:image/png;base64,${VALID_BASE64}`;
    const result = normalizeEvolutionQrPayload({ base64: dataUrl }, 'test');
    expect(result.qrCode).toBe(dataUrl);
  });

  it('extracts from data.qrcode.base64 (Evolution API v2 webhook format)', () => {
    const payload = { data: { qrcode: { base64: VALID_BASE64 } } };
    const result = normalizeEvolutionQrPayload(payload, 'webhook');
    expect(result.qrCode).toContain(VALID_BASE64);
  });

  it('extracts from data.base64', () => {
    const payload = { data: { base64: VALID_BASE64 } };
    const result = normalizeEvolutionQrPayload(payload, 'direct_fetch');
    expect(result.qrCode).toContain(VALID_BASE64);
  });

  it('extracts from qrcode.base64 (flat format)', () => {
    const payload = { qrcode: { base64: VALID_BASE64 } };
    const result = normalizeEvolutionQrPayload(payload, 'test');
    expect(result.qrCode).toContain(VALID_BASE64);
  });

  it('extracts pairingCode from top-level pairingCode', () => {
    const payload = { pairingCode: 'ABCD-1234', base64: VALID_BASE64 };
    const result = normalizeEvolutionQrPayload(payload, 'test');
    expect(result.pairingCode).toBe('ABCD-1234');
  });

  it('ignores base64 strings shorter than 50 chars', () => {
    const result = normalizeEvolutionQrPayload({ base64: 'tooshort' }, 'test');
    expect(result.qrCode).toBeNull();
  });

  it('sets expiresAt when qrCode is found', () => {
    const before = Date.now();
    const result = normalizeEvolutionQrPayload({ base64: VALID_BASE64 }, 'test');
    expect(result.expiresAt).not.toBeNull();
    expect(result.expiresAt!.getTime()).toBeGreaterThan(before + 59_000);
  });

  it('preserves source field', () => {
    const result = normalizeEvolutionQrPayload({}, 'connect_response');
    expect(result.source).toBe('connect_response');
  });

  it('handles null payload gracefully', () => {
    const result = normalizeEvolutionQrPayload(null, 'test');
    expect(result.qrCode).toBeNull();
  });
});
