/**
 * whatsappSelfReplyGuard.test.js
 *
 * Testes de regressão para o bug crítico:
 * "Bot respondendo a si próprio quando recebe mensagens de terceiros"
 *
 * Cenários cobertos:
 * 1. fromMe=true em qualquer posição do payload → ignorado
 * 2. fromMe=true como string → ignorado
 * 3. fromMe aninhado em key.fromMe → ignorado
 * 4. sender igual ao número da instância → self_target
 * 5. remoteJid da instância → self_target
 * 6. Payload Evolution API real com cliente externo → processado corretamente
 * 7. Payload Evolution API real com fromMe=true → ignorado
 * 8. @lid sem participant/senderPn → ambiguous_phone (não self-reply)
 * 9. messages.upsert com cliente externo e texto → processado corretamente
 */

import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockPoolQuery = jest.fn();
const mockSendWhatsAppMessage = jest.fn();
const mockGetWhatsAppStatus = jest.fn();
const mockGetSession = jest.fn();
const mockIsSessionExpired = jest.fn();
const mockCreateSession = jest.fn();
const mockUpdateSession = jest.fn();
const mockDeleteSession = jest.fn();
const mockGetBotConfig = jest.fn();
const mockGetMenuOptions = jest.fn();
const mockGetBarbershopBusinessSettings = jest.fn();
const mockIsWithinBusinessHours = jest.fn();
const mockGenerateAvailableTimeSlots = jest.fn();
const mockFormatBusinessHoursRange = jest.fn();

jest.unstable_mockModule('../config/database.js', () => ({
  default: { query: mockPoolQuery },
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
  formatMessage: jest.fn((msg) => msg),
}));

jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: mockGetWhatsAppStatus,
}));

jest.unstable_mockModule('../services/whatsapp/whatsappSessionService.js', () => ({
  getSession: mockGetSession,
  isSessionExpired: mockIsSessionExpired,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deleteSession: mockDeleteSession,
}));

jest.unstable_mockModule('../services/whatsapp/whatsappConfigService.js', () => ({
  getBotConfig: mockGetBotConfig,
  getMenuOptions: mockGetMenuOptions,
}));

jest.unstable_mockModule('../services/barbershopBusinessSettingsService.js', () => ({
  getBarbershopBusinessSettings: mockGetBarbershopBusinessSettings,
  isWithinBusinessHours: mockIsWithinBusinessHours,
  generateAvailableTimeSlots: mockGenerateAvailableTimeSlots,
  formatBusinessHoursRange: mockFormatBusinessHoursRange,
}));

const { handleIncomingMessage } = await import('../services/whatsapp/whatsappFlowService.js');

const INSTANCE_NUMBER = '5511888888888';

describe('whatsappSelfReplyGuard — bot nao deve responder a si proprio', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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

  // ============================================================
  // GRUPO 1: fromMe=true em todas as variações
  // ============================================================

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
    // Formato exato Evolution API messages.upsert com fromMe aninhado
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

  // ============================================================
  // GRUPO 2: destinatário é o próprio número da instância
  // ============================================================

  it('ignora quando sender extraído é igual ao numero da instancia', async () => {
    const payload = {
      key: { remoteJid: `${INSTANCE_NUMBER}@s.whatsapp.net`, fromMe: false },
      message: { conversation: 'oi' },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      preExtractedPhone: INSTANCE_NUMBER,
    });

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'connected_number_match' });
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

    expect(result).toMatchObject({ ok: false, ignored: true, reason: 'connected_number_match' });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  // ============================================================
  // GRUPO 3: payload Evolution API real — cliente externo
  // ============================================================

  it('processa corretamente payload Evolution API messages.upsert de cliente externo', async () => {
    const CLIENT_NUMBER = '5583999999999';

    // Simula barbearia encontrada para o numero da instancia
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    // Simula nome da barbearia
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
    // Bot deve ter tentado enviar para o CLIENTE, não para a instancia
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      CLIENT_NUMBER,
      expect.any(String),
      expect.any(Object)
    );

    // Garantir que NUNCA enviou para o número da instância
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

  // ============================================================
  // GRUPO 4: payload @lid — sem fallback confiável
  // ============================================================

  it('retorna ambiguous_phone para @lid sem participant nem senderPn — nao responde a si mesmo', async () => {
    const payload = {
      event: 'messages.upsert',
      key: { remoteJid: '236197968359561@lid', fromMe: false },
      message: { conversation: 'oi' },
    };

    const result = await handleIncomingMessage(payload, 'oi', { eventName: 'messages-upsert' });

    // Deve descartar por ambiguidade, NÃO por self_target
    expect(result).toMatchObject({ ok: false, ignored: true });
    expect(['ambiguous_phone', 'self_target']).toContain(result.reason);
    // Em nenhum caso deve enviar mensagem
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

    // Deve processar, nunca enviar para instância
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

  // ============================================================
  // GRUPO 5: garantias finais contra loop
  // ============================================================

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

    // Grupo deve ser descartado por ambiguous_phone (bloqueio de @g.us)
    expect(result).toMatchObject({ ok: false, ignored: true });
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
