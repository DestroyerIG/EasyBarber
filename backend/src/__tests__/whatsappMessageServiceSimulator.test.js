import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockSendWhatsAppText = jest.fn();

jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  sendWhatsAppText: mockSendWhatsAppText,
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

const { sendWhatsAppMessage } = await import('../services/whatsapp/whatsappMessageService.js');

describe('whatsappMessageService simulator mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendWhatsAppText.mockResolvedValue(true);
  });

  it('captures response and skips provider when simulate=true', async () => {
    const captured = [];

    const sent = await sendWhatsAppMessage('5511999999999', 'Ola do bot', {
      simulate: true,
      captureCollector: (message) => captured.push(message),
    });

    expect(sent).toBe(true);
    expect(captured).toEqual(['Ola do bot']);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('captures response and calls provider when simulate=false', async () => {
    const captured = [];

    const sent = await sendWhatsAppMessage('5511999999999', 'Mensagem real', {
      simulate: false,
      captureCollector: (message) => captured.push(message),
    });

    expect(sent).toBe(true);
    expect(captured).toEqual(['Mensagem real']);
    expect(mockSendWhatsAppText).toHaveBeenCalledWith('5511999999999', 'Mensagem real', {
      simulate: false,
      captureCollector: expect.any(Function),
    });
  });
});
