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

  it('prefers key.participant over senderPn when remoteJid is @lid', () => {
    const payload = {
      key: {
        remoteJid: '236197968359561@lid',
        participant: '5511991111111@s.whatsapp.net',
      },
      senderPn: '5511888888888',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBe('5511991111111');
    expect(extraction.sourcePath).toBe('key.participant');
    expect(extraction.candidateType).toBe('participant_jid');
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourcePath: 'key.remoteJid', reason: 'blocked_jid_suffix' }),
      ])
    );
  });

  it('falls back to senderPn before nested participant candidates for @lid payloads', () => {
    const payload = {
      key: {
        remoteJid: '236197968359561@lid',
      },
      senderPn: '5511777777777',
      data: {
        messages: [
          {
            key: {
              participant: '5511666666666@s.whatsapp.net',
            },
          },
        ],
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['5511888888888'],
    });

    expect(extraction.phone).toBe('5511777777777');
    expect(extraction.sourcePath).toBe('senderPn');
    expect(extraction.candidateType).toBe('numeric_fallback');
  });

  it('uses data.messages[0].key.participant when remoteJid is @lid and senderPn is unavailable', () => {
    const payload = {
      key: {
        remoteJid: '236197968359561@lid',
      },
      data: {
        messages: [
          {
            key: {
              participant: '5511666666666@s.whatsapp.net',
            },
          },
        ],
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBe('5511666666666');
    expect(extraction.sourcePath).toBe('data.messages[0].key.participant');
    expect(extraction.candidateType).toBe('participant_jid');
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
