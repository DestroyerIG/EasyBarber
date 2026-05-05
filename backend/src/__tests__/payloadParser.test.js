/**
 * payloadParser.test.js
 */

import { parseEvolutionWebhook } from '../services/whatsapp/utils/payloadParser.js';

// ── Fixture: payload real Evolution API v1 com @lid ──────────────────────────

const LID_PAYLOAD = {
  event: 'messages-upsert',
  instance: 'itallobarber_12f46de4',
  data: {
    key: {
      remoteJid: '247269873942566@lid',
      fromMe: false,
      id: 'ACCC752295081680F6CC2418A3504074',
      participant: null,
    },
    pushName: 'Lucas Barros',
    message: { conversation: 'Boa tarde' },
    messageType: 'conversation',
    messageTimestamp: 1777917946,
  },
  sender: '558396311811@s.whatsapp.net',
  destination: '5583996311811',
};

// ── Fixture: payload com @s.whatsapp.net direto ───────────────────────────────

const DIRECT_PAYLOAD = {
  event: 'messages-upsert',
  instance: 'barber_abc',
  data: {
    key: {
      remoteJid: '5511999887766@s.whatsapp.net',
      fromMe: false,
      id: 'MSG001',
    },
    message: { conversation: 'Quero agendar' },
    messageType: 'conversation',
    messageTimestamp: 1777917000,
  },
  sender: '5511999887766@s.whatsapp.net',
  destination: '5583996311811',
};

// ── Fixture: fromMe=true ──────────────────────────────────────────────────────

const FROM_ME_PAYLOAD = {
  event: 'messages-upsert',
  instance: 'barber_abc',
  data: {
    key: {
      remoteJid: '5511999887766@s.whatsapp.net',
      fromMe: true,
      id: 'BOT_MSG',
    },
    message: { conversation: 'Olá! Como posso ajudar?' },
    messageType: 'conversation',
    messageTimestamp: 1777917001,
  },
};

// ── parseEvolutionWebhook ─────────────────────────────────────────────────────

describe('parseEvolutionWebhook', () => {
  describe('payload @lid (real production)', () => {
    let parsed;
    beforeEach(() => { parsed = parseEvolutionWebhook(LID_PAYLOAD); });

    it('retorna objeto não-nulo', () => expect(parsed).not.toBeNull());
    it('event = messages-upsert', () => expect(parsed.event).toBe('messages-upsert'));
    it('instanceName correto', () => expect(parsed.instanceName).toBe('itallobarber_12f46de4'));
    it('messageId correto', () => expect(parsed.messageId).toBe('ACCC752295081680F6CC2418A3504074'));
    it('remoteJid = @lid', () => expect(parsed.remoteJid).toBe('247269873942566@lid'));
    it('fromMe = false', () => expect(parsed.fromMe).toBe(false));
    it('sender preservado', () => expect(parsed.sender).toBe('558396311811@s.whatsapp.net'));
    it('destination preservado', () => expect(parsed.destination).toBe('5583996311811'));
    it('text extraído de message.conversation', () => expect(parsed.text).toBe('Boa tarde'));
    it('messageType correto', () => expect(parsed.messageType).toBe('conversation'));
    it('timestamp numérico', () => expect(parsed.timestamp).toBe(1777917946));
    it('raw referencia o payload original', () => expect(parsed.raw).toBe(LID_PAYLOAD));
  });

  describe('payload @s.whatsapp.net direto', () => {
    let parsed;
    beforeEach(() => { parsed = parseEvolutionWebhook(DIRECT_PAYLOAD); });

    it('remoteJid @s.whatsapp.net', () => {
      expect(parsed.remoteJid).toBe('5511999887766@s.whatsapp.net');
    });
    it('text correto', () => expect(parsed.text).toBe('Quero agendar'));
  });

  describe('fromMe=true payload', () => {
    it('fromMe = true', () => {
      const p = parseEvolutionWebhook(FROM_ME_PAYLOAD);
      expect(p.fromMe).toBe(true);
    });
  });

  describe('tipos de mensagem', () => {
    it('extrai texto de extendedTextMessage', () => {
      const p = parseEvolutionWebhook({
        ...DIRECT_PAYLOAD,
        data: {
          ...DIRECT_PAYLOAD.data,
          message: { extendedTextMessage: { text: 'Oi do extended' } },
        },
      });
      expect(p.text).toBe('Oi do extended');
    });

    it('extrai caption de imageMessage', () => {
      const p = parseEvolutionWebhook({
        ...DIRECT_PAYLOAD,
        data: {
          ...DIRECT_PAYLOAD.data,
          message: { imageMessage: { caption: 'Foto com legenda' } },
        },
      });
      expect(p.text).toBe('Foto com legenda');
    });

    it('text = null quando não há conteúdo textual', () => {
      const p = parseEvolutionWebhook({
        ...DIRECT_PAYLOAD,
        data: { ...DIRECT_PAYLOAD.data, message: { audioMessage: {} } },
      });
      expect(p.text).toBeNull();
    });
  });

  describe('connection-update payload', () => {
    it('parseia evento connection-update', () => {
      const p = parseEvolutionWebhook({
        event: 'connection-update',
        instance: 'barber_abc',
        data: { state: 'open' },
      });
      expect(p).not.toBeNull();
      expect(p.event).toBe('connection-update');
      expect(p.instanceName).toBe('barber_abc');
    });
  });

  describe('payloads inválidos', () => {
    it('retorna null para null', () => expect(parseEvolutionWebhook(null)).toBeNull());
    it('retorna null para string', () => expect(parseEvolutionWebhook('texto')).toBeNull());
    it('retorna null sem event', () => {
      expect(parseEvolutionWebhook({ instance: 'x', data: {} })).toBeNull();
    });
    it('retorna null sem instanceName', () => {
      expect(parseEvolutionWebhook({ event: 'messages-upsert', data: {} })).toBeNull();
    });
    it('nunca lança exceção', () => {
      expect(() => parseEvolutionWebhook(undefined)).not.toThrow();
      expect(() => parseEvolutionWebhook(42)).not.toThrow();
      expect(() => parseEvolutionWebhook({ event: null })).not.toThrow();
    });
  });
});
