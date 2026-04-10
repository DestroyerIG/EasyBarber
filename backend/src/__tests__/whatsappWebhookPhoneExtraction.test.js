import { describe, it, expect } from '@jest/globals';
import {
  extractWhatsAppPhoneFromWebhook,
  extractWhatsAppPhoneFromWebhookDetailed,
  extractWhatsAppInstanceNumbersFromWebhook,
} from '../utils/whatsapp.js';

describe('whatsapp webhook phone extraction', () => {
  it('extracts customer phone from direct remoteJid with metadata', () => {
    const payload = {
      key: {
        remoteJid: '5511999999999@s.whatsapp.net',
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBe('5511999999999');
    expect(extraction.sourcePath).toBe('key.remoteJid');
    expect(extraction.candidateType).toBe('direct_jid');
    expect(extraction.rejections).toEqual([]);
    expect(extractWhatsAppPhoneFromWebhook(payload)).toBe('5511999999999');
  });

  it('blocks @lid payloads and does not fallback to numeric fields', () => {
    const payload = {
      key: {
        remoteJid: '5511991111111@lid',
      },
      senderPn: '5511888888888',
      data: {
        messages: [
          {
            senderPn: '5511777777777',
          },
        ],
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['5511888888888'],
    });

    expect(extraction.phone).toBeNull();
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'blocked_conversation_jid' }),
      ])
    );
  });

  it('rejects any candidate that resolves to instance number', () => {
    const payload = {
      key: {
        remoteJid: '5511888888888@s.whatsapp.net',
      },
      senderPn: '5511888888888',
      data: {
        instance: {
          phone: '5511888888888@s.whatsapp.net',
        },
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['5511888888888'],
    });

    expect(extraction.phone).toBeNull();
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'instance_number' }),
      ])
    );
  });

  it('blocks group conversations from @g.us', () => {
    const payload = {
      key: {
        remoteJid: '120363012345678901@g.us',
      },
      senderPn: '5511666666666',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBeNull();
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'blocked_conversation_jid' }),
      ])
    );
  });

  it('uses senderPn fallback only when strict jid is not available and payload is not blocked', () => {
    const payload = {
      senderPn: '5511777777777',
      data: {
        senderPn: '5511777777777',
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['5511888888888'],
    });

    expect(extraction.phone).toBe('5511777777777');
    expect(extraction.sourcePath).toBe('senderPn');
    expect(extraction.candidateType).toBe('numeric_fallback');
  });

  it('collects known instance numbers from webhook payload and options', () => {
    const payload = {
      instance: {
        phone: '5511333333333@s.whatsapp.net',
      },
      data: {
        instance: {
          ownerJid: '5511444444444@s.whatsapp.net',
        },
      },
    };

    const numbers = extractWhatsAppInstanceNumbersFromWebhook(payload, {
      connectedNumbers: ['5511555555555'],
    });

    expect(numbers).toEqual(
      expect.arrayContaining(['5511333333333', '5511444444444', '5511555555555'])
    );
  });
});
