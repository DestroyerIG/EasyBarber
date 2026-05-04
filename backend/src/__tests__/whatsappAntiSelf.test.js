import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { isSelfMessage, normalizePhone, extractWhatsAppPhoneFromWebhookDetailed } from '../utils/whatsapp.js';
import {
  getConnectedNumber,
  updateInstanceDirect,
  clearInstanceNumber,
} from '../services/whatsapp/whatsappInstanceCache.js';

describe('normalizePhone BR / E164', () => {
  it('prefixa 55 em número nacional 11 dígitos', () => {
    expect(normalizePhone('11999887766')).toBe('5511999887766');
  });

  it('remove zero à esquerda antes de normalizar', () => {
    expect(normalizePhone('05511999887766')).toBe('5511999887766');
  });
});

describe('isSelfMessage', () => {
  it('fail-open quando connectedNumber é null', () => {
    expect(isSelfMessage({ authorPhone: '5511999887766', connectedNumber: null })).toBe(false);
  });

  it('detecta igualdade com variante móvel BR (com/sem 9)', () => {
    expect(
      isSelfMessage({
        authorPhone: '551199887766',
        connectedNumber: '5511999887766',
      })
    ).toBe(true);
  });

  it('retorna false para números distintos', () => {
    expect(
      isSelfMessage({
        authorPhone: '5511999887766',
        connectedNumber: '5583987654321',
      })
    ).toBe(false);
  });
});

describe('@lid + destination Evolution (Render)', () => {
  it('não usa lid_sender_fallback quando sender = destination (cache connected vazio)', () => {
    const payload = {
      event: 'messages-upsert',
      instanceName: 'itallobarber_12f46de4',
      destination: '558396311811@s.whatsapp.net',
      key: { remoteJid: '268796367515747@lid', fromMe: false },
      sender: '558396311811@s.whatsapp.net',
      message: { conversation: 'Oi' },
    };
    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, { messageText: 'Oi' });
    expect(extraction.phone).not.toBe('558396311811');
    expect(extraction.phone).toBeNull();
  });
});

describe('whatsappInstanceCache multi-tenant + ENV', () => {
  const prevWa = process.env.WHATSAPP_PHONE;
  const prevEv = process.env.EVOLUTION_PHONE;

  beforeEach(() => {
    clearInstanceNumber('easybarber_test_tenant');
    clearInstanceNumber(null);
    delete process.env.WHATSAPP_PHONE;
    delete process.env.EVOLUTION_PHONE;
  });

  afterEach(() => {
    clearInstanceNumber('easybarber_test_tenant');
    clearInstanceNumber(null);
    if (prevWa !== undefined) process.env.WHATSAPP_PHONE = prevWa;
    else delete process.env.WHATSAPP_PHONE;
    if (prevEv !== undefined) process.env.EVOLUTION_PHONE = prevEv;
    else delete process.env.EVOLUTION_PHONE;
  });

  it('não aplica ENV em instância nomeada sem número em cache', () => {
    process.env.WHATSAPP_PHONE = '5511999887766';
    expect(getConnectedNumber('easybarber_test_tenant')).toBeNull();
  });

  it('aplica ENV apenas para instância default', () => {
    process.env.WHATSAPP_PHONE = '5511999887766';
    expect(getConnectedNumber(null)).toBe('5511999887766');
  });

  it('updateInstanceDirect não apaga número válido com patch null', () => {
    updateInstanceDirect('easybarber_test_tenant', { connectedNumber: '5583987654321', status: 'connected' });
    updateInstanceDirect('easybarber_test_tenant', { connectedNumber: null, status: 'disconnected' });
    expect(getConnectedNumber('easybarber_test_tenant')).toBe('5583987654321');
  });
});
