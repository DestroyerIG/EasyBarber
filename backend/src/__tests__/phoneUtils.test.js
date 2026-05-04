/**
 * phoneUtils.test.js
 *
 * Testes unitários para src/services/whatsapp/utils/phoneUtils.js
 */

import {
  extractPhoneFromJid,
  normalizePhone,
  isSelfMessage,
  resolveAuthorPhone,
} from '../services/whatsapp/utils/phoneUtils.js';

// ── extractPhoneFromJid ───────────────────────────────────────────────────────

describe('extractPhoneFromJid', () => {
  it('extrai número de JID @s.whatsapp.net', () => {
    expect(extractPhoneFromJid('5583996311811@s.whatsapp.net')).toBe('5583996311811');
  });

  it('extrai número de JID @c.us (formato legado)', () => {
    expect(extractPhoneFromJid('5583996311811@c.us')).toBe('5583996311811');
  });

  it('retorna null para JID @lid', () => {
    expect(extractPhoneFromJid('247269873942566@lid')).toBeNull();
  });

  it('retorna null para input null/undefined', () => {
    expect(extractPhoneFromJid(null)).toBeNull();
    expect(extractPhoneFromJid(undefined)).toBeNull();
    expect(extractPhoneFromJid('')).toBeNull();
  });

  it('retorna null se sem @', () => {
    expect(extractPhoneFromJid('5583996311811')).toBeNull();
  });
});

// ── normalizePhone ────────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  it('remove country code 55 de número E.164 de 13 dígitos', () => {
    expect(normalizePhone('5583996311811')).toBe('83996311811');
  });

  it('remove country code 55 de número E.164 de 12 dígitos', () => {
    expect(normalizePhone('558396311811')).toBe('8396311811');
  });

  it('mantém número já sem 55 (11 dígitos)', () => {
    expect(normalizePhone('83996311811')).toBe('83996311811');
  });

  it('remove formatação (espaços, traços, parênteses)', () => {
    expect(normalizePhone('+55 (83) 9963-11811')).toBe('83996311811');
  });

  it('retorna null para input vazio ou inválido', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });

  it('NÃO adiciona nem remove o 9 do número', () => {
    // Preserva o número como chegou — sem manipular o 9
    expect(normalizePhone('558396311811')).toBe('8396311811');    // sem 9
    expect(normalizePhone('5583996311811')).toBe('83996311811');  // com 9
  });
});

// ── isSelfMessage ─────────────────────────────────────────────────────────────

describe('isSelfMessage', () => {
  // Caso central: números que diferem apenas pelo "9" obrigatório NÃO são self
  // 558396311811  (12d, sem 9 após DDD) vs 5583996311811 (13d, com 9 após DDD)
  it('558396311811 (sem 9) vs 5583996311811 (com 9) → NÃO é self', () => {
    expect(isSelfMessage('558396311811', '5583996311811')).toBe(false);
  });

  it('mesmo número E.164 completo → é self', () => {
    expect(isSelfMessage('5583996311811', '5583996311811')).toBe(true);
  });

  it('mesmo número sem 55 em ambos → é self', () => {
    expect(isSelfMessage('83996311811', '83996311811')).toBe(true);
  });

  it('com 55 vs sem 55, mesmo número → é self', () => {
    expect(isSelfMessage('5583996311811', '83996311811')).toBe(true);
  });

  it('números completamente diferentes → não é self', () => {
    expect(isSelfMessage('5583996311811', '5511999887766')).toBe(false);
  });

  it('retorna false se um dos argumentos for nulo/undefined', () => {
    expect(isSelfMessage(null, '5583996311811')).toBe(false);
    expect(isSelfMessage('5583996311811', null)).toBe(false);
    expect(isSelfMessage(null, null)).toBe(false);
  });

  it('retorna false para strings vazias', () => {
    expect(isSelfMessage('', '5583996311811')).toBe(false);
    expect(isSelfMessage('5583996311811', '')).toBe(false);
  });

  // Variante: mesmo número base, ambos com 10 dígitos sem 55 → canonical iguais → self
  it('dois números 10 dígitos idênticos (sem 55) → é self', () => {
    expect(isSelfMessage('8396311811', '8396311811')).toBe(true);
  });

  // Variante: ambos com 9, 11 dígitos sem 55 → idênticos → self
  it('dois números 11 dígitos idênticos (sem 55) → é self', () => {
    expect(isSelfMessage('83996311811', '83996311811')).toBe(true);
  });

  // JID completo nos inputs
  it('aceita JID @s.whatsapp.net como input (extrai dígitos)', () => {
    expect(isSelfMessage('5583996311811@s.whatsapp.net', '5583996311811')).toBe(true);
  });
});

// ── resolveAuthorPhone ────────────────────────────────────────────────────────

describe('resolveAuthorPhone', () => {
  it('retorna isFromMe=true para key.fromMe=true, phone=null', () => {
    const payload = {
      data: { key: { remoteJid: '5583996311811@s.whatsapp.net', fromMe: true } },
    };
    const result = resolveAuthorPhone(payload);
    expect(result.isFromMe).toBe(true);
    expect(result.phone).toBeNull();
    expect(result.source).toBe('fromMe');
  });

  it('extrai número de remoteJid @s.whatsapp.net', () => {
    const payload = {
      data: {
        key: { remoteJid: '558396311811@s.whatsapp.net', fromMe: false },
      },
    };
    const result = resolveAuthorPhone(payload);
    expect(result.phone).toBe('558396311811');
    expect(result.source).toBe('remoteJid');
    expect(result.isFromMe).toBe(false);
  });

  it('usa sender quando remoteJid é @lid', () => {
    const payload = {
      sender: '558396311811@s.whatsapp.net',
      data: {
        key: {
          remoteJid: '247269873942566@lid',
          fromMe: false,
          id: 'ACCC752295081680F6CC2418A3504074',
        },
        pushName: 'Lucas Barros',
        message: { conversation: 'Boa tarde' },
      },
    };
    const result = resolveAuthorPhone(payload);
    expect(result.phone).toBe('558396311811');
    expect(result.source).toBe('sender_lid');
    expect(result.isFromMe).toBe(false);
  });

  it('usa participant em mensagens de grupo', () => {
    const payload = {
      data: {
        key: {
          remoteJid: '5511999999999@g.us',
          participant: '558396311811@s.whatsapp.net',
          fromMe: false,
        },
      },
    };
    const result = resolveAuthorPhone(payload);
    expect(result.phone).toBe('558396311811');
    expect(result.source).toBe('participant');
  });

  it('retorna phone=null se não houver fonte identificável', () => {
    const payload = { data: { key: { fromMe: false } } };
    const result = resolveAuthorPhone(payload);
    expect(result.phone).toBeNull();
    expect(result.source).toBe('unresolved');
  });

  // Payload Evolution API real do exemplo do usuário
  it('processa payload Evolution API v1 com @lid (exemplo real)', () => {
    const payload = {
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

    const result = resolveAuthorPhone(payload);
    expect(result.phone).toBe('558396311811');
    expect(result.source).toBe('sender_lid');
    expect(result.isFromMe).toBe(false);

    // Verificar que com connectedNumber = destination, NÃO é self-message
    expect(isSelfMessage(result.phone, '5583996311811')).toBe(false);
  });
});
