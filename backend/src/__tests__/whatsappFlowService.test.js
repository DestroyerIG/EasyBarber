import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockPoolQuery = jest.fn();
const mockSendWhatsAppMessage = jest.fn();
const mockGetWhatsAppStatus = jest.fn();

jest.unstable_mockModule('../config/database.js', () => ({
  default: {
    query: mockPoolQuery,
  },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/whatsapp/whatsappMessageService.js', () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
  buildWelcomeMessage: jest.fn(() => 'menu'),
}));

jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: mockGetWhatsAppStatus,
}));

const { handleIncomingMessage } = await import('../services/whatsapp/whatsappFlowService.js');

describe('whatsappFlowService guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: '5511888888888',
    });
  });

  it('returns ambiguous_phone when webhook payload has @lid and no trusted fallback', async () => {
    const payload = {
      key: {
        remoteJid: '5511991111111@lid',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'ambiguous_phone',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns self_target when payload fromMe arrives as string true', async () => {
    const payload = {
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: 'true',
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'self_target',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns ambiguous_phone when sender is numeric-only and no trusted jid exists', async () => {
    const payload = {
      sender: '5511777777777',
    };

    const result = await handleIncomingMessage(payload, 'oi');

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'ambiguous_phone',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('returns self_target for direct input equal to connected instance', async () => {
    const result = await handleIncomingMessage('5511888888888', 'oi', {
      eventName: 'messages-upsert',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'self_target',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns self_target when pre-extracted phone matches known instance numbers', async () => {
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: null,
    });

    const result = await handleIncomingMessage(
      {
        key: {
          remoteJid: '5511777777777@s.whatsapp.net',
        },
      },
      'oi',
      {
        preExtractedPhone: '5511666666666',
        preExtractedText: 'oi',
        preExtractedInstanceNumbers: ['5511666666666'],
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'self_target',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});
