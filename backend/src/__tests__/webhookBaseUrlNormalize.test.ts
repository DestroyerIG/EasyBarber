import { describe, it, expect } from 'vitest';
import {
  buildWebhookUrl,
  normalizeWebhookBaseUrl,
} from '../modules/whatsapp/whatsapp.service.js';

const BACKEND = 'https://easybarber-backend.onrender.com/api/v1/whatsapp/webhook';

describe('normalizeWebhookBaseUrl', () => {
  it('returns canonical backend base unchanged', () => {
    expect(normalizeWebhookBaseUrl(BACKEND)).toBe(BACKEND);
  });

  it('strips a trailing slash', () => {
    expect(normalizeWebhookBaseUrl(`${BACKEND}/`)).toBe(BACKEND);
  });

  it('strips an accidental event suffix (bug 1: prevents Evolution duplicating /connection-update)', () => {
    expect(
      normalizeWebhookBaseUrl(`${BACKEND}/connection-update`),
    ).toBe(BACKEND);
  });

  it('strips chained duplicated event suffixes', () => {
    expect(
      normalizeWebhookBaseUrl(
        `${BACKEND}/connection-update/connection-update`,
      ),
    ).toBe(BACKEND);
  });

  it.each([
    '/qrcode-updated',
    '/messages-upsert',
    '/messages-update',
    '/send-message',
  ])('strips suffix %s', (suffix) => {
    expect(normalizeWebhookBaseUrl(`${BACKEND}${suffix}`)).toBe(BACKEND);
  });

  it('rejects Vercel frontend hosts (bug 2: webhook must hit backend, not Vercel)', () => {
    expect(() =>
      normalizeWebhookBaseUrl(
        'https://barberpro-saas-2-0.vercel.app/api/v1/whatsapp/webhook',
      ),
    ).toThrow(/frontend/i);
  });

  it('rejects any *.vercel.app host', () => {
    expect(() =>
      normalizeWebhookBaseUrl('https://anything.vercel.app/api/v1/whatsapp/webhook'),
    ).toThrow(/frontend/i);
  });

  it('returns empty string for empty input (callers throw with their own message)', () => {
    expect(normalizeWebhookBaseUrl('')).toBe('');
    expect(normalizeWebhookBaseUrl(null)).toBe('');
    expect(normalizeWebhookBaseUrl(undefined)).toBe('');
  });

  it('throws on syntactically invalid URLs', () => {
    expect(() => normalizeWebhookBaseUrl('not-a-url')).toThrow(/inválida/i);
  });
});

describe('buildWebhookUrl', () => {
  it('appends the event slug to a clean base', () => {
    expect(buildWebhookUrl(BACKEND, 'connection-update')).toBe(
      `${BACKEND}/connection-update`,
    );
  });

  it('normalizes camelCase events to kebab-case', () => {
    expect(buildWebhookUrl(BACKEND, 'CONNECTION_UPDATE')).toBe(
      `${BACKEND}/connection-update`,
    );
    expect(buildWebhookUrl(BACKEND, 'qrcodeUpdated')).toBe(
      `${BACKEND}/qrcode-updated`,
    );
  });

  it('does not double-append when base already carries the event', () => {
    expect(
      buildWebhookUrl(`${BACKEND}/connection-update`, 'connection-update'),
    ).toBe(`${BACKEND}/connection-update`);
  });
});
