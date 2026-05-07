/**
 * whatsappSelfReplyGuard.test.ts
 */

import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
const mockGetWhatsAppStatus = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockIsSessionExpired = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());
const mockUpdateSession = vi.hoisted(() => vi.fn());
const mockDeleteSession = vi.hoisted(() => vi.fn());
const mockGetBotConfig = vi.hoisted(() => vi.fn());
const mockGetMenuOptions = vi.hoisted(() => vi.fn());
const mockGetBarbershopBusinessSettings = vi.hoisted(() => vi.fn());
const mockIsWithinBusinessHours = vi.hoisted(() => vi.fn());
const mockGenerateAvailableTimeSlots = vi.hoisted(() => vi.fn());
const mockFormatBusinessHoursRange = vi.hoisted(() => vi.fn());

vi.mock('../config/database.js', () => ({
  default: { query: mockPoolQuery },
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

vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
  buildWelcomeMessage: vi.fn(() => 'menu'),
  formatMessage: vi.fn((msg: unknown) => msg),
}));

vi.mock('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: mockGetWhatsAppStatus,
  getWhatsAppStatusByInstance: mockGetWhatsAppStatus,
  getConnectedNumberCached: vi.fn(() => {
    const status = mockGetWhatsAppStatus();
    return status?.connectedNumber || null;
  }),
}));

vi.mock('../services/whatsapp/whatsappSessionService.js', () => ({
  getSession: mockGetSession,
  isSessionExpired: mockIsSessionExpired,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deleteSession: mockDeleteSession,
}));

vi.mock('../services/whatsapp/whatsappConfigService.js', () => ({
  getBotConfig: mockGetBotConfig,
  getMenuOptions: mockGetMenuOptions,
}));

vi.mock('../services/barbershopBusinessSettingsService.js', () => ({
  getBarbershopBusinessSettings: mockGetBarbershopBusinessSettings,
  isWithinBusinessHours: mockIsWithinBusinessHours,
  isBusinessOpenOnDate: vi.fn(() => true),
  generateAvailableTimeSlots: mockGenerateAvailableTimeSlots,
  formatBusinessHoursRange: mockFormatBusinessHoursRange,
}));

const { handleIncomingMessage } = await import('../services/whatsapp/whatsappFlowService.js');

const INSTANCE_NUMBER = '5511888888888';

describe('whatsappSelfReplyGuard — bot nao deve responder a si proprio', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockSendWhatsAppMessage.mockResolvedValue(true);
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: INSTANCE_NUMBER });
    mockGetSession.mockResolvedValue(null);
    mockIsSessionExpired.mockReturnValue(false);
    mockCreateSession.mockResolvedValue(undefined);
    mockUpdateSession.mockResolvedValue(undefined);
    mockDeleteSession.mockResolvedValue(undefined);
    mockGetBotConfig.mockResolvedValue({
      invalid_option_message: 'Opcao invalida.',
      no_slots_message: 'Sem horarios.',
      confirmation_message: 'Confirmado',
      session_expired_message: 'Expirado',
    });
    mockGetMenuOptions.mockResolvedValue([{ label: 'Agendar', emoji: '💈' }]);
    mockGetBarbershopBusinessSettings.mockResolvedValue({
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: false,
      autoConfirmAppointments: true,
      timezone: 'America/Sao_Paulo',
    });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGenerateAvailableTimeSlots.mockReturnValue([]);
    mockFormatBusinessHoursRange.mockReturnValue('08:00 as 18:00');
  });

  it('ignora mensagem com fromMe=true no nivel raiz', async () => {
    const payload = {
      fromMe: true,
      key: { remoteJid: '5511777777777@s.whatsapp.net' },
      message: { conversation: 'oi' },
    };

    const result = await handleIncomingMessage(payload, 'oi', { eventName: 'messages-upsert' });

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'from_me' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('ignora mensagem com fromMe como string "true"', async () => {
    const payload = {
      key: { remoteJid: '5511777777777@s.whatsapp.net', fromMe: 'true' },
      message: { conversation: 'oi' },
    };

    const result = await handleIncomingMessage(payload, 'oi', { eventName: 'messages-upsert' });

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'from_me' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('ignora mensagem com fromMe aninhado em data.messages[0].key.fromMe', async () => {
    const payload = {
      event: 'messages.upsert',
      data: {
        messages: [
          {
            key: {
              remoteJid: '5511777777777@s.whatsapp.net',
              fromMe: true,
              id: 'ABC123',
            },
            message: { conversation: 'mensagem enviada pelo bot' },
            pushName: null,
          },
        ],
      },
    };

    const result = await handleIncomingMessage(payload, 'mensagem enviada pelo bot', {
      eventName: 'messages-upsert',
    });

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'from_me' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('ignora mensagem com fromMe=1 (numero)', async () => {
    const payload = {
      key: { remoteJid: '5511777777777@s.whatsapp.net', fromMe: 1 },
      message: { conversation: 'oi' },
    };

    const result = await handleIncomingMessage(payload, 'oi', { eventName: 'messages-upsert' });

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'from_me' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('ignora quando sender extraído é igual ao numero da instancia', async () => {
    const payload = {
      key: { remoteJid: `${INSTANCE_NUMBER}@s.whatsapp.net`, fromMe: false },
      message: { conversation: 'oi' },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      preExtractedPhone: INSTANCE_NUMBER,
    });

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'self_reply_blocked' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('ignora quando preExtractedPhone bate com preExtractedInstanceNumbers', async () => {
    const result = await handleIncomingMessage(
      { key: { remoteJid: '5511777777777@s.whatsapp.net' }, message: { conversation: 'oi' } },
      'oi',
      {
        preExtractedPhone: INSTANCE_NUMBER,
        preExtractedInstanceNumbers: [INSTANCE_NUMBER],
      }
    );

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'self_reply_blocked' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('processa corretamente payload Evolution API messages.upsert de cliente externo', async () => {
    const CLIENT_NUMBER = '5583999999999';

    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });

    const payload = {
      event: 'messages.upsert',
      data: {
        messages: [
          {
            key: {
              remoteJid: `${CLIENT_NUMBER}@s.whatsapp.net`,
              fromMe: false,
              id: 'MSGID_001',
            },
            message: { conversation: 'oi' },
            pushName: 'João Cliente',
          },
        ],
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      preExtractedPhone: CLIENT_NUMBER,
    });

    expect(result).toMatchObject({ ok: true, ignored: false });
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      CLIENT_NUMBER,
      expect.any(String),
      expect.any(Object)
    );

    for (const call of mockSendWhatsAppMessage.mock.calls) {
      expect(call[0]).not.toBe(INSTANCE_NUMBER);
    }
  });

  it('nunca envia mensagem para o numero da propria instancia', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });

    const CLIENT_NUMBER = '5521988887777';
    const payload = {
      key: { remoteJid: `${CLIENT_NUMBER}@s.whatsapp.net`, fromMe: false },
      message: { conversation: 'quero agendar' },
    };

    await handleIncomingMessage(payload, 'quero agendar', {
      eventName: 'messages-upsert',
      preExtractedPhone: CLIENT_NUMBER,
    });

    for (const call of mockSendWhatsAppMessage.mock.calls) {
      expect(call[0]).not.toBe(INSTANCE_NUMBER);
      expect(call[0]).not.toBe(`${INSTANCE_NUMBER}@s.whatsapp.net`);
    }
  });

  it('retorna ambiguous_phone para @lid sem participant nem senderPn — nao responde a si mesmo', async () => {
    const payload = {
      event: 'messages.upsert',
      key: { remoteJid: '236197968359561@lid', fromMe: false },
      message: { conversation: 'oi' },
    };

    const result = await handleIncomingMessage(payload, 'oi', { eventName: 'messages-upsert' });

    expect(result).toMatchObject({ ok: false, ignored: true });
    expect(['ambiguous_phone', 'self_target']).toContain(result.reason);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('processa @lid com participant valido extraindo telefone correto', async () => {
    const PARTICIPANT_NUMBER = '5521977776666';

    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });

    const payload = {
      event: 'messages.upsert',
      data: {
        messages: [
          {
            key: {
              remoteJid: '236197968359561@lid',
              fromMe: false,
              participant: `${PARTICIPANT_NUMBER}@s.whatsapp.net`,
            },
            message: { conversation: 'oi' },
          },
        ],
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      preExtractedPhone: PARTICIPANT_NUMBER,
    });

    if (result.ok) {
      for (const call of mockSendWhatsAppMessage.mock.calls) {
        expect(call[0]).toBe(PARTICIPANT_NUMBER);
        expect(call[0]).not.toBe(INSTANCE_NUMBER);
      }
    }
  });

  it('nao trata sender da instancia como self-reply quando existe participantPn seguro no payload @lid', async () => {
    const CUSTOMER_NUMBER = '5521977776666';

    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });

    const payload = {
      event: 'messages.upsert',
      data: {
        messages: [
          {
            key: {
              remoteJid: '236197968359561@lid',
              fromMe: false,
              id: 'MSGID_LID_001',
            },
            message: {
              conversation: 'Olá',
            },
            messageContextInfo: {
              participantPn: CUSTOMER_NUMBER,
            },
          },
        ],
      },
      sender: `${INSTANCE_NUMBER}@s.whatsapp.net`,
      instanceName: 'easybarber',
    };

    const result = await handleIncomingMessage(payload, 'Olá', {
      barbershopId: 'tenant-1',
      eventName: 'messages-upsert',
      preExtractedInstanceNumbers: [INSTANCE_NUMBER],
      preExtractedPhone: CUSTOMER_NUMBER,
      preResolvedAuthorExtraction: {
        phone: CUSTOMER_NUMBER,
        sourcePath: 'data.messages[0].messageContextInfo.participantPn',
        candidateType: 'numeric_fallback',
        confidence: 'high',
        resolutionRule: 'candidate_ranked_best',
        fromMe: false,
        remoteJidOriginal: '236197968359561@lid',
        instanceNumbers: [INSTANCE_NUMBER],
      },
    });

    expect(result).toMatchObject({ ok: true, ignored: false });
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      CUSTOMER_NUMBER,
      expect.any(String),
      expect.any(Object)
    );

    for (const call of mockSendWhatsAppMessage.mock.calls) {
      expect(call[0]).not.toBe(INSTANCE_NUMBER);
    }
  });

  it('descarta mensagem com fromMe=false mas texto vazio', async () => {
    const payload = {
      key: { remoteJid: '5511777777777@s.whatsapp.net', fromMe: false },
    };

    const result = await handleIncomingMessage(payload, '', { eventName: 'messages-upsert' });

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'empty_text' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('descarta mensagens de grupo (@g.us) sem restrição de self_target', async () => {
    const payload = {
      key: {
        remoteJid: '120363012345678901@g.us',
        fromMe: false,
      },
      message: { conversation: 'mensagem no grupo' },
    };

    const result = await handleIncomingMessage(payload, 'mensagem no grupo', {
      eventName: 'messages-upsert',
    });

    expect(result).toMatchObject({ ok: false, ignored: true });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
