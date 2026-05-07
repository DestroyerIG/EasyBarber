import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockSendWhatsAppText = vi.hoisted(() => vi.fn());

vi.mock('../services/whatsappClient.js', () => ({
  sendWhatsAppText: mockSendWhatsAppText,
}));

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

const { sendWhatsAppMessage } = await import('../services/whatsapp/whatsappMessageService.js');

describe('whatsappMessageService simulator mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWhatsAppText.mockResolvedValue(true);
  });

  it('captures response and skips provider when simulate=true', async () => {
    const captured: string[] = [];

    const sent = await sendWhatsAppMessage('5511999999999', 'Ola do bot', {
      simulate: true,
      captureCollector: (message: string) => captured.push(message),
    });

    expect(sent).toBe(true);
    expect(captured).toEqual(['Ola do bot']);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('captures response and calls provider when simulate=false', async () => {
    const captured: string[] = [];

    const sent = await sendWhatsAppMessage('5511999999999', 'Mensagem real', {
      simulate: false,
      captureCollector: (message: string) => captured.push(message),
    });

    expect(sent).toBe(true);
    expect(captured).toEqual(['Mensagem real']);
    expect(mockSendWhatsAppText).toHaveBeenCalledWith('5511999999999', 'Mensagem real', {
      simulate: false,
      captureCollector: expect.any(Function),
    });
  });
});
