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
  resolveSafeReplyDestination,
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

  it('uses sender as lid_fallback when @lid remoteJid and sender is valid @s.whatsapp.net', () => {
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

    expect(extraction.phone).toBe('558396311811');
    expect(extraction.sourcePath).toBe('lid_sender_fallback');
    expect(extraction.candidateType).toBe('sender_jid');
    expect(extraction.confidence).toBe('lid_fallback');
    expect(extraction.resolutionRule).toBe('lid_sender_fallback');
  });

  it('promotes from as safe fallback in @lid upsert when sender diverges and participant is absent', () => {
    const payload = {
      event: 'messages-upsert',
      sender: '558396311811@s.whatsapp.net',
      from: '5583988887777@s.whatsapp.net',
      data: {
        key: {
          remoteJid: '236197968359561@lid',
          fromMe: false,
        },
        message: {
          conversation: 'Quero agendar',
        },
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBe('5583988887777');
    expect(extraction.sourcePath).toBe('from');
    expect(extraction.candidateType).toBe('sender_jid');
    expect(extraction.confidence).toBe('low');
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourcePath: 'sender', reason: 'lid_sender_untrusted' }),
      ])
    );
  });

  it('does not promote from fallback in @lid when from equals sender', () => {
    const payload = {
      event: 'messages-upsert',
      sender: '558396311811@s.whatsapp.net',
      from: '558396311811@s.whatsapp.net',
      data: {
        key: {
          remoteJid: '236197968359561@lid',
          fromMe: false,
        },
        message: {
          conversation: 'Quero agendar',
        },
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBeNull();
    expect(extraction.sourcePath).toBeNull();
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'low_confidence_author' }),
      ])
    );
  });

  it('resolves @lid author from extendedTextMessage.contextInfo.participant when sender is instance', () => {
    const payload = {
      event: 'messages.upsert',
      sender: '558396311811@s.whatsapp.net',
      data: {
        key: {
          remoteJid: '236197968359561@lid',
          fromMe: false,
        },
        message: {
          extendedTextMessage: {
            text: 'Quero agendar',
            contextInfo: {
              participant: '5583987654321@s.whatsapp.net',
            },
          },
        },
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['558396311811'],
    });

    expect(extraction.phone).toBe('5583987654321');
    expect(extraction.sourcePath).toBe('data.message.extendedTextMessage.contextInfo.participant');
    expect(extraction.candidateType).toBe('participant_jid');
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourcePath: 'sender', reason: 'instance_number' }),
      ])
    );
  });

  it('resolves @lid author from messageContextInfo.participant in upsert payloads', () => {
    const payload = {
      event: 'messages-upsert',
      key: {
        remoteJid: '236197968359561@lid',
        fromMe: false,
      },
      message: {
        conversation: 'Oi',
        messageContextInfo: {
          participant: '5583970011223@s.whatsapp.net',
        },
      },
      sender: '558396311811@s.whatsapp.net',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['558396311811'],
    });

    expect(extraction.phone).toBe('5583970011223');
    expect(extraction.sourcePath).toBe('message.messageContextInfo.participant');
    expect(extraction.candidateType).toBe('participant_jid');
  });

  it('resolves @lid author from flattened messageContextInfo.participantPn when payload arrives normalized', () => {
    const payload = {
      event: 'messages-upsert',
      key: {
        remoteJid: '236197968359561@lid',
        fromMe: false,
      },
      message: {
        conversation: 'Olá',
      },
      messageContextInfo: {
        participantPn: '5583970011223',
      },
      sender: '558396311811@s.whatsapp.net',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['558396311811'],
    });

    expect(extraction.phone).toBe('5583970011223');
    expect(extraction.sourcePath).toBe('messageContextInfo.participantPn');
    expect(extraction.candidateType).toBe('numeric_fallback');
    expect(extraction.confidence).toBe('high');
    expect(extraction.resolutionRule).toBe('candidate_ranked_best');
  });

  it('resolves @lid author from flattened contextInfo.senderPn when sender is instance and metadata is external', () => {
    const payload = {
      event: 'messages-upsert',
      key: {
        remoteJid: '236197968359561@lid',
        fromMe: false,
      },
      message: {
        conversation: 'Olá',
      },
      contextInfo: {
        senderPn: '5583970055667',
      },
      sender: '558396311811@s.whatsapp.net',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['558396311811'],
    });

    expect(extraction.phone).toBe('5583970055667');
    expect(extraction.sourcePath).toBe('contextInfo.senderPn');
    expect(extraction.candidateType).toBe('numeric_fallback');
    expect(extraction.confidence).toBe('low');
  });

  it('resolves @lid author from data.messages[0].message.key.participantPn when nested key metadata is present', () => {
    const payload = {
      event: 'messages-upsert',
      sender: '558396311811@s.whatsapp.net',
      data: {
        messages: [
          {
            key: {
              remoteJid: '236197968359561@lid',
              fromMe: false,
            },
            message: {
              conversation: 'Olá',
              key: {
                participantPn: '5583970011223',
              },
            },
          },
        ],
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: ['558396311811'],
    });

    expect(extraction.phone).toBe('5583970011223');
    expect(extraction.sourcePath).toBe('data.messages[0].message.key.participantPn');
    expect(extraction.candidateType).toBe('numeric_fallback');
  });

  it('ignores nested message.key.fromMe=true before author extraction', () => {
    const payload = {
      event: 'messages-upsert',
      data: {
        messages: [
          {
            key: {
              remoteJid: '5511999999999@s.whatsapp.net',
            },
            message: {
              conversation: 'Olá',
              key: {
                fromMe: true,
                participant: '5511999999999@s.whatsapp.net',
              },
            },
          },
        ],
      },
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBeNull();
    expect(extraction.fromMe).toBe(true);
    expect(extraction.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourcePath: 'fromMe', reason: 'self_message' }),
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

  it('resolves reply destination from phone even when context jid is invalid', () => {
    const destination = resolveReplyDestination({
      phone: '558396311811',
      remoteJidOriginal: '236197968359561@lid',
    });

    expect(destination).toBe('558396311811');
  });

  it('does not fallback to remoteJidOriginal when phone is absent', () => {
    expect(
      resolveReplyDestination({
        phone: null,
        remoteJidOriginal: '558396311811@s.whatsapp.net',
      })
    ).toBeNull();

    expect(
      resolveReplyDestination({
        phone: null,
        remoteJidOriginal: '236197968359561@lid',
      })
    ).toBeNull();
  });

  it('blocks destination when message is from_me', () => {
    const decision = resolveSafeReplyDestination({
      phone: '5511999999999',
      fromMe: true,
      remoteJidOriginal: '5511999999999@s.whatsapp.net',
    });

    expect(decision).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'from_me',
      })
    );
  });

  it('blocks ambiguous @lid destination without trusted participant source', () => {
    const decision = resolveSafeReplyDestination({
      phone: '5511999999999',
      remoteJidOriginal: '236197968359561@lid',
      extraction: {
        sourcePath: 'sender',
      },
    });

    expect(decision).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'ambiguous_phone',
      })
    );
  });

  it('blocks destination when it matches connected number', () => {
    const decision = resolveSafeReplyDestination({
      phone: '5511888888888',
      connectedNumber: '5511888888888',
      remoteJidOriginal: '5511777777777@s.whatsapp.net',
    });

    expect(decision).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'connected_number_match',
      })
    );
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

  it('extracts authorPhone via lid_fallback from Evolution API @lid audio payload', () => {
    const payload = {
      event: 'messages-upsert',
      instance: 'barbearia-lucas_a0da94f8',
      data: {
        key: {
          remoteJid: '241918646694117@lid',
          fromMe: false,
          id: 'ABC123',
        },
        message: {},
        messageType: 'audioMessage',
        messageTimestamp: 1777748066,
        pushName: 'Cliente Teste',
        sender: '558399849151@s.whatsapp.net',
      },
      sender: '558399849151@s.whatsapp.net',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBe('558399849151');
    expect(extraction.sourcePath).toBe('lid_sender_fallback');
    expect(extraction.confidence).toBe('lid_fallback');
    expect(extraction.resolutionRule).toBe('lid_sender_fallback');
    expect(extraction.remoteJidOriginal).toBe('241918646694117@lid');
  });

  it('approves lid_fallback destination in resolveSafeReplyDestination', () => {
    const decision = resolveSafeReplyDestination({
      phone: '558399849151',
      remoteJidOriginal: '241918646694117@lid',
      extraction: {
        sourcePath: 'lid_sender_fallback',
        confidence: 'lid_fallback',
      },
    });

    expect(decision).toEqual(
      expect.objectContaining({
        ok: true,
        destination: '558399849151',
        conversationKind: 'lid',
      })
    );
  });

  it('does not use lid_fallback when sender has invalid digit count', () => {
    const payload = {
      event: 'messages-upsert',
      data: {
        key: {
          remoteJid: '999999999999999@lid',
          fromMe: false,
        },
        message: {
          conversation: 'Oi',
        },
      },
      sender: '12345@s.whatsapp.net',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBeNull();
  });

  it('does not use lid_fallback when fromMe is true', () => {
    const payload = {
      event: 'messages-upsert',
      data: {
        key: {
          remoteJid: '241918646694117@lid',
          fromMe: true,
        },
        message: {
          conversation: 'Oi',
        },
      },
      sender: '558399849151@s.whatsapp.net',
    };

    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload);

    expect(extraction.phone).toBeNull();
    expect(extraction.fromMe).toBe(true);
  });
});
