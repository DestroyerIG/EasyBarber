import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockSendTextMessage = jest.fn();
const mockHealthCheck = jest.fn();
const mockGetInstanceStatus = jest.fn();
const mockCreateInstance = jest.fn();
const mockConnectInstance = jest.fn();
const mockGetQrCode = jest.fn();
const mockLogoutInstance = jest.fn();
const mockGetEvolutionConfig = jest.fn();
const mockIsSessionStateError = jest.fn();
const mockGetProviderErrorMessage = jest.fn();

class MockEvolutionApiError extends Error {
  constructor(message, { status = null, details = null, code = 'EVOLUTION_API_ERROR' } = {}) {
    super(message);
    this.name = 'EvolutionApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

jest.unstable_mockModule('../services/evolutionApiService.js', () => ({
  healthCheck: mockHealthCheck,
  getInstanceStatus: mockGetInstanceStatus,
  createInstance: mockCreateInstance,
  connectInstance: mockConnectInstance,
  getQrCode: mockGetQrCode,
  logoutInstance: mockLogoutInstance,
  sendTextMessage: mockSendTextMessage,
  getEvolutionConfig: mockGetEvolutionConfig,
  EvolutionApiError: MockEvolutionApiError,
  isSessionStateError: mockIsSessionStateError,
  getProviderErrorMessage: mockGetProviderErrorMessage,
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

const { sendWhatsAppText } = await import('../services/whatsappClient.js');

describe('whatsappClient destination resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockHealthCheck.mockResolvedValue({ ok: true });
    mockGetInstanceStatus.mockResolvedValue({
      state: 'open',
      instance: {
        number: '5511999999999@s.whatsapp.net',
      },
    });
    mockGetEvolutionConfig.mockReturnValue({
      instanceName: 'easybarber',
    });
    mockSendTextMessage.mockResolvedValue({
      payload: { key: 'ok' },
      meta: {
        endpoint: '/message/sendText/easybarber',
        payloadShape: 'number+textMessage',
      },
    });
    mockIsSessionStateError.mockReturnValue(false);
    mockGetProviderErrorMessage.mockReturnValue('');
  });

  it('sends using canonical phone even when remoteJidOriginal is @lid', async () => {
    const sent = await sendWhatsAppText('558396311811', 'Ola', {
      remoteJidOriginal: '236197968359561@lid',
    });

    expect(sent).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '558396311811',
        text: 'Ola',
      })
    );
  });

  it('sends when phone is valid and context is compatible', async () => {
    const sent = await sendWhatsAppText('558396311811', 'Oi', {
      remoteJidOriginal: '558396311811@s.whatsapp.net',
    });

    expect(sent).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '558396311811',
        text: 'Oi',
      })
    );
  });

  it('blocks send when phone is invalid even if context jid is compatible', async () => {
    const sent = await sendWhatsAppText('invalid', 'Oi', {
      remoteJidOriginal: '558396311811@s.whatsapp.net',
    });

    expect(sent).toBe(false);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });

  it('sends using canonical phone even when remoteJidOriginal is group jid', async () => {
    const sent = await sendWhatsAppText('558396311811', 'Oi', {
      remoteJidOriginal: '120363012345678901@g.us',
    });

    expect(sent).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '558396311811',
        text: 'Oi',
      })
    );
  });

  it('runs session recovery flow when provider returns session state error', async () => {
    const providerError = new MockEvolutionApiError('Error: not-acceptable', {
      status: 400,
      details: { message: ['Error: not-acceptable'] },
      code: 'EVOLUTION_API_ERROR',
    });

    mockSendTextMessage.mockRejectedValue(providerError);
    mockIsSessionStateError.mockReturnValue(true);
    mockGetProviderErrorMessage.mockReturnValue('Error: not-acceptable');

    const sent = await sendWhatsAppText('558396311811', 'Oi', {
      remoteJidOriginal: '236197968359561@lid',
    });

    expect(sent).toBe(false);
    expect(mockLogoutInstance).toHaveBeenCalled();
    expect(mockCreateInstance).toHaveBeenCalled();
    expect(mockConnectInstance).toHaveBeenCalled();
    expect(mockGetQrCode).toHaveBeenCalled();
  });
});
