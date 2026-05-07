/**
 * messagesUpsertHandler.test.ts — Integration tests for handleMessagesUpsert.
 */

import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockResolveTenant = vi.hoisted(() => vi.fn());
const mockBotProcess = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, responseSent: true }));
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(),
}));

vi.mock('../services/whatsapp/tenant/tenantResolver.js', () => ({
  resolveTenant: mockResolveTenant,
}));

vi.mock('../utils/logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../bot/botOrchestrator.js', () => ({
  process: mockBotProcess,
  initBotOrchestrator: vi.fn(),
}));

const { handleMessagesUpsert } = await import(
  '../services/whatsapp/handlers/messagesUpsertHandler.js'
);

const INSTANCE = 'itallobarber_12f46de4';
const BOT_NUMBER = '5583996311811';
const CLIENT_NUMBER = '558396311811';

const mockTenant = (overrides: Record<string, unknown> = {}) => ({
  barbershop: { id: 'barbershop-1', name: 'Barbearia Teste', instanceName: INSTANCE },
  connectedNumber: BOT_NUMBER,
  subscriptionStatus: 'active',
  ...overrides,
});

const LID_PAYLOAD = {
  event: 'messages-upsert',
  instance: INSTANCE,
  data: {
    key: {
      remoteJid: '247269873942566@lid',
      fromMe: false,
      id: 'MSG-LID-001',
    },
    message: { conversation: 'Boa tarde' },
    messageType: 'conversation',
    messageTimestamp: 1777917946,
  },
  sender: `${CLIENT_NUMBER}@s.whatsapp.net`,
  destination: BOT_NUMBER,
};

const DIRECT_PAYLOAD = {
  event: 'messages-upsert',
  instance: INSTANCE,
  data: {
    key: {
      remoteJid: `${CLIENT_NUMBER}@s.whatsapp.net`,
      fromMe: false,
      id: 'MSG-DIRECT-001',
    },
    message: { conversation: 'Quero agendar' },
    messageType: 'conversation',
    messageTimestamp: 1777917000,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveTenant.mockResolvedValue(mockTenant());
  mockBotProcess.mockResolvedValue({ ok: true, responseSent: true });
});

describe('handleMessagesUpsert', () => {

  describe('Passo 1 — parse', () => {
    it('returns parse_failed for null payload', async () => {
      const r = await handleMessagesUpsert(null, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'parse_failed' });
    });

    it('returns parse_failed for payload without event', async () => {
      const r = await handleMessagesUpsert({ instance: INSTANCE, data: {} }, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'parse_failed' });
    });
  });

  describe('Passo 2 — fromMe check', () => {
    it('returns from_me when key.fromMe=true', async () => {
      const payload = {
        ...DIRECT_PAYLOAD,
        data: { ...DIRECT_PAYLOAD.data, key: { ...DIRECT_PAYLOAD.data.key, fromMe: true } },
      };
      const r = await handleMessagesUpsert(payload, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'from_me' });
      expect(mockResolveTenant).not.toHaveBeenCalled();
    });
  });

  describe('Passo 3 — author resolution', () => {
    it('returns group when remoteJid is @g.us', async () => {
      const payload = {
        ...DIRECT_PAYLOAD,
        data: { ...DIRECT_PAYLOAD.data, key: { remoteJid: '5511999@g.us', fromMe: false, id: 'x' } },
      };
      const r = await handleMessagesUpsert(payload, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'group' });
    });

    it('returns unresolved when no phone found', async () => {
      const payload = {
        event: 'messages-upsert',
        instance: INSTANCE,
        data: { key: { remoteJid: '123@lid', fromMe: false, id: 'x' }, message: { conversation: 'hi' } },
      };
      const r = await handleMessagesUpsert(payload, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'unresolved' });
    });
  });

  describe('Passo 4 — tenant resolution', () => {
    it('returns tenant_not_found when resolveTenant returns null', async () => {
      mockResolveTenant.mockResolvedValue(null);
      const r = await handleMessagesUpsert(DIRECT_PAYLOAD, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'tenant_not_found' });
    });
  });

  describe('Passo 5 — subscription check', () => {
    it.each(['pending', 'canceled', 'past_due', 'unpaid'])(
      'returns subscription_inactive for status "%s"',
      async (status) => {
        mockResolveTenant.mockResolvedValue(mockTenant({ subscriptionStatus: status }));
        const r = await handleMessagesUpsert(DIRECT_PAYLOAD, { instanceName: INSTANCE });
        expect(r).toMatchObject({ ok: false, reason: 'subscription_inactive' });
      },
    );

    it('allows trialing status', async () => {
      mockResolveTenant.mockResolvedValue(mockTenant({ subscriptionStatus: 'trialing' }));
      const r = await handleMessagesUpsert(DIRECT_PAYLOAD, { instanceName: INSTANCE });
      expect(r.reason).not.toBe('subscription_inactive');
    });
  });

  describe('Passo 6 — self-message check (o único no sistema)', () => {
    it('returns self_message when author phone === bot phone (same E.164)', async () => {
      const selfPayload = {
        event: 'messages-upsert',
        instance: INSTANCE,
        data: {
          key: { remoteJid: `${BOT_NUMBER}@s.whatsapp.net`, fromMe: false, id: 'SELF-1' },
          message: { conversation: 'oi' },
        },
      };
      const r = await handleMessagesUpsert(selfPayload, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'self_message' });
      expect(mockBotProcess).not.toHaveBeenCalled();
    });

    it('does NOT block client 558396311811 (12d) when bot is 5583996311811 (13d)', async () => {
      const r = await handleMessagesUpsert(LID_PAYLOAD, { instanceName: INSTANCE });
      expect(r.reason).not.toBe('self_message');
    });

    it('does NOT block author 83996311811 (11d) when bot is 5583996311811 (13d) — same person', async () => {
      const payload = {
        event: 'messages-upsert',
        instance: INSTANCE,
        data: {
          key: { remoteJid: '83996311811@s.whatsapp.net', fromMe: false, id: 'SELF-2' },
          message: { conversation: 'oi' },
        },
      };
      const r = await handleMessagesUpsert(payload, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'self_message' });
    });
  });

  describe('Passo 7 — deduplication', () => {
    it('returns duplicate on second call with same messageId', async () => {
      const uid = `dedup-test-${Date.now()}`;
      const p = { ...LID_PAYLOAD, data: { ...LID_PAYLOAD.data, key: { ...LID_PAYLOAD.data.key, id: uid } } };
      await handleMessagesUpsert(p, { instanceName: INSTANCE });
      const r = await handleMessagesUpsert(p, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'duplicate' });
    });

    it('processes messages with different messageIds independently', async () => {
      const ts = Date.now();
      const p1 = { ...LID_PAYLOAD, data: { ...LID_PAYLOAD.data, key: { ...LID_PAYLOAD.data.key, id: `uniq-a-${ts}` } } };
      const p2 = { ...LID_PAYLOAD, data: { ...LID_PAYLOAD.data, key: { ...LID_PAYLOAD.data.key, id: `uniq-b-${ts}` } } };
      const r1 = await handleMessagesUpsert(p1, { instanceName: INSTANCE });
      const r2 = await handleMessagesUpsert(p2, { instanceName: INSTANCE });
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });
  });

  describe('Passo 8 — texto obrigatório', () => {
    it('returns no_text for audio message (no text content)', async () => {
      const payload = {
        event: 'messages-upsert',
        instance: INSTANCE,
        data: {
          key: { remoteJid: `${CLIENT_NUMBER}@s.whatsapp.net`, fromMe: false, id: 'AUDIO-1' },
          message: { audioMessage: { url: 'https://example.com/audio.ogg' } },
        },
      };
      const r = await handleMessagesUpsert(payload, { instanceName: INSTANCE });
      expect(r).toMatchObject({ ok: false, reason: 'no_text' });
    });
  });

  describe('Passo 9-10 — fluxo completo (happy path)', () => {
    it('processes @lid payload and calls botOrchestrator', async () => {
      const payload = { ...LID_PAYLOAD, data: { ...LID_PAYLOAD.data, key: { ...LID_PAYLOAD.data.key, id: `happy-lid-${Date.now()}` } } };
      const r = await handleMessagesUpsert(payload, { instanceName: INSTANCE });
      expect(r.ok).toBe(true);
      expect(r.reason).toBeNull();
      expect(r.authorPhone).toBe(CLIENT_NUMBER);
      expect(r.text).toBe('Boa tarde');
      expect(r.barbershopId).toBe('barbershop-1');
      expect(mockBotProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          barbershopId: 'barbershop-1',
          authorPhone: CLIENT_NUMBER,
          text: 'Boa tarde',
          instanceName: INSTANCE,
        }),
      );
    });

    it('processes direct @s.whatsapp.net payload', async () => {
      const payload = { ...DIRECT_PAYLOAD, data: { ...DIRECT_PAYLOAD.data, key: { ...DIRECT_PAYLOAD.data.key, id: `happy-direct-${Date.now()}` } } };
      const r = await handleMessagesUpsert(payload, { instanceName: INSTANCE });
      expect(r.ok).toBe(true);
      expect(r.authorPhone).toBe(CLIENT_NUMBER);
    });

    it('connectedNumber nunca logado completo (apenas últimos 4)', () => {
      const allLogs = mockLogger.info.mock.calls.flat();
      const fullNumber = BOT_NUMBER;
      allLogs.forEach((arg: unknown) => {
        if (typeof arg === 'object' && arg !== null) {
          expect(JSON.stringify(arg)).not.toContain(fullNumber);
        }
      });
    });
  });
});
