import { describe, it, expect } from '@jest/globals';
import {
  extractPhoneFromPayload,
  extractWhatsAppPhoneFromWebhook,
  extractWhatsAppPhoneFromWebhookDetailed,
  extractWhatsAppInstanceNumbersFromWebhook,
  isInvalidJidContext,
  isValidPhone,
  normalizePhone,
  normalizePhoneForSend,
  resolveIncomingAuthor,
  resolveReplyDestination,
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
    expect(extractPhoneFromPayload(payload)).toBe('5511999999999');
  });

  it('prefers participant over senderPn when remoteJid is @lid', () => {
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
    expect(extraction.confidence).toBe('high');
  });

  it('prefers nested participant over senderPn for @lid payloads', () => {
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

    expect(extraction.phone).toBe('5511666666666');
    expect(extraction.sourcePath).toBe('data.messages[0].key.participant');
    expect(extraction.candidateType).toBe('participant_jid');
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

  it('treats sender-only @lid payload as ambiguous author', () => {
    const payload = {
      key: {
        remoteJid: '236197968359561@lid',
      },
      sender: '5511888888888@s.whatsapp.net',
      from: '5511777777777@s.whatsapp.net',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBeNull();
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'low_confidence_author' }),
      ])
    );
  });

  it('does not trust sender-only messages.upsert payload when remoteJid is @lid', () => {
    const payload = {
      event: 'messages.upsert',
      sender: '558396311811@s.whatsapp.net',
      data: {
        key: {
          remoteJid: '236197968359561@lid',
          fromMe: false,
        },
        message: {
          conversation: 'Olá',
        },
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBeNull();
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'low_confidence_author' }),
      ])
    );
  });

  it('resolves direct remoteJid as real author even when sender diverges', () => {
    const payload = {
      key: {
        remoteJid: '5511999999999@s.whatsapp.net',
      },
      sender: '5511888888888@s.whatsapp.net',
      data: {
        key: {
          fromMe: false,
        },
      },
    };

    const author = resolveIncomingAuthor(payload);

    expect(author.authorPhone).toBe('5511999999999');
    expect(author.sourcePath).toBe('key.remoteJid');
    expect(author.confidence).toBe('high');
    expect(author.remoteJidOriginal).toBe('5511999999999@s.whatsapp.net');
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

  it('normalizes phone by removing suffixes and non-numeric chars', () => {
    expect(normalizePhone(' +55 (83) 96311-811@s.whatsapp.net ')).toBe('558396311811');
    expect(normalizePhone('558396311811@c.us')).toBe('558396311811');
    expect(normalizePhone('236197968359561@lid')).toBeNull();
  });

  it('normalizes destination for send payloads', () => {
    expect(normalizePhoneForSend(' +55 (83) 96311-811@s.whatsapp.net ')).toBe('558396311811');
    expect(normalizePhoneForSend('558396311811@c.us')).toBe('558396311811');
    expect(normalizePhoneForSend('236197968359561@lid')).toBeNull();
    expect(normalizePhoneForSend('120363012345678901@g.us')).toBeNull();
  });

  it('blocks reply destination when context jid is invalid', () => {
    const destination = resolveReplyDestination({
      phone: '558396311811',
      remoteJidOriginal: '236197968359561@lid',
    });

    expect(destination).toBeNull();
  });

  it('falls back to remoteJidOriginal only when it is not blocked', () => {
    expect(
      resolveReplyDestination({
        phone: null,
        remoteJidOriginal: '558396311811@s.whatsapp.net',
      })
    ).toBe('558396311811');

    expect(
      resolveReplyDestination({
        phone: null,
        remoteJidOriginal: '236197968359561@lid',
      })
    ).toBeNull();
  });

  it('validates blocked jid contexts for send', () => {
    expect(isInvalidJidContext('236197968359561@lid')).toBe(true);
    expect(isInvalidJidContext('120363012345678901@g.us')).toBe(true);
    expect(isInvalidJidContext('status@broadcast')).toBe(true);
    expect(isInvalidJidContext('5511999999999@s.whatsapp.net')).toBe(false);
  });

  it('validates canonical phone format for send', () => {
    expect(isValidPhone('558396311811')).toBe(true);
    expect(isValidPhone('5583')).toBe(false);
    expect(isValidPhone('558396311811000000')).toBe(false);
    expect(isValidPhone('55 83 96311-811')).toBe(false);
  });
});
