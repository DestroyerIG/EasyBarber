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
const mockAppointmentServiceCreate = jest.fn();

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
  formatMessage: jest.fn((message) => message),
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

jest.unstable_mockModule('../services/appointmentService.js', () => ({
  appointmentService: {
    create: mockAppointmentServiceCreate,
  },
}));

const {
  handleIncomingMessage,
  handleWebhook,
} = await import('../services/whatsapp/whatsappFlowService.js');

describe('whatsappFlowService guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID;
    delete process.env.WHATSAPP_INSTANCE_BARBERSHOP_MAP;
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockSendWhatsAppMessage.mockResolvedValue(true);
    mockAppointmentServiceCreate.mockResolvedValue({
      id: 'apt-1',
      status: 'confirmado',
    });
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: '5511888888888',
    });
    mockGetSession.mockResolvedValue(null);
    mockIsSessionExpired.mockReturnValue(false);
    mockCreateSession.mockResolvedValue(undefined);
    mockUpdateSession.mockResolvedValue(undefined);
    mockDeleteSession.mockResolvedValue(undefined);
    mockGetBotConfig.mockResolvedValue({
      invalid_option_message: 'Opcao invalida.',
      no_slots_message: 'Sem horarios disponiveis.',
      confirmation_message: 'Agendamento confirmado',
      session_expired_message: 'Sessao expirada',
    });
    mockGetMenuOptions.mockResolvedValue([{ label: 'Agendar um horario', emoji: '💈' }]);
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

  it('ignora evento messages-set no webhook handler (nao necessario para o fluxo principal)', async () => {
    const req = {
      body: {
        event: 'messages.set',
        data: {
          messages: Array.from({ length: 3 }, (_, i) => ({
            key: {
              id: `set-${i}`,
              remoteJid: '5511777777777@s.whatsapp.net',
              fromMe: false,
            },
          })),
        },
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Evento ignorado: nao e mensagem de entrada.',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('nao processa quando tenant nao pode ser resolvido sem fallback inseguro', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'barbershop_not_resolved',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('resolve tenant via mapeamento da instancia quando connectedNumber estiver nulo', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    process.env.WHATSAPP_INSTANCE_BARBERSHOP_MAP = 'easybarber=tenant-map';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      instance: {
        instanceName: 'easybarber',
      },
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );

    const instanceDbLookupCall = mockPoolQuery.mock.calls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('lower(btrim(whatsapp_instance_name))')
    );

    expect(instanceDbLookupCall).toBeDefined();
    expect(mockGetBarbershopBusinessSettings).toHaveBeenCalledWith('tenant-map');

    const tenantLookupCall = mockPoolQuery.mock.calls.find(
      ([query]) =>
        typeof query === 'string' &&
        (
          query.includes('regexp_replace(COALESCE(whatsapp') ||
          query.includes('FROM whatsapp_sessions')
        )
    );

    expect(tenantLookupCall).toBeUndefined();
  });

  it('resolve tenant via instanceName no banco como fonte primaria', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Barber DB', whatsapp_instance_name: 'easybarber' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easybarber',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );
    expect(mockGetBarbershopBusinessSettings).toHaveBeenCalledWith('tenant-db');

    const instanceDbLookupCall = mockPoolQuery.mock.calls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('lower(btrim(whatsapp_instance_name))')
    );

    expect(instanceDbLookupCall).toBeDefined();
  });

  it('resolve tenant via owner quando instanceName nao vier no payload', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-owner', name: 'Barber Owner', whatsapp_instance_name: 'owner-inst' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      owner: 'owner-inst',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockGetBarbershopBusinessSettings).toHaveBeenCalledWith('tenant-owner');
  });

  it('processa inbound real com JID normal, resolve tenant por instanceName e responde saudacao', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Barber DB', whatsapp_instance_name: 'easybarber' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: '5511888888888' });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easybarber',
      key: {
        remoteJid: '558399849151@s.whatsapp.net',
        fromMe: false,
      },
      sender: '558396311811@s.whatsapp.net',
      message: {
        conversation: 'Oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'Oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockGetBarbershopBusinessSettings).toHaveBeenCalledWith('tenant-db');
    expect(mockCreateSession).toHaveBeenCalledWith('558399849151', 'tenant-db');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '558399849151',
      expect.any(String),
      expect.objectContaining({
        eventName: 'messages-upsert',
        instanceName: 'easybarber',
      })
    );
  });

  it('aceita inbound real @lid com metadata confiavel mesmo sem participant no payload principal', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Barber DB', whatsapp_instance_name: 'easybarber' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: '558396311811' });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easybarber',
      key: {
        remoteJid: '236197968359561@lid',
        fromMe: false,
      },
      sender: '558396311811@s.whatsapp.net',
      message: {
        conversation: 'Olá',
      },
      messageContextInfo: {
        participantPn: '5583970011223',
      },
    };

    const result = await handleIncomingMessage(payload, 'Olá', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockCreateSession).toHaveBeenCalledWith('5583970011223', 'tenant-db');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5583970011223',
      expect.any(String),
      expect.objectContaining({
        eventName: 'messages-upsert',
        instanceName: 'easybarber',
        allowLidDestination: true,
      })
    );
  });

  it('resolve corretamente tenants distintos para instancias diferentes', async () => {
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    mockPoolQuery.mockImplementation(async (query, params = []) => {
      if (typeof query === 'string' && query.includes('lower(btrim(whatsapp_instance_name))')) {
        if (params[0] === 'inst-a') {
          return { rows: [{ id: 'tenant-a', name: 'Tenant A', whatsapp_instance_name: 'inst-a' }] };
        }

        if (params[0] === 'inst-b') {
          return { rows: [{ id: 'tenant-b', name: 'Tenant B', whatsapp_instance_name: 'inst-b' }] };
        }

        return { rows: [] };
      }

      return { rows: [] };
    });

    const payloadA = {
      event: 'messages-upsert',
      instanceName: 'inst-a',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const payloadB = {
      event: 'messages-upsert',
      instanceName: 'inst-b',
      key: {
        remoteJid: '5511888888888@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const resultA = await handleIncomingMessage(payloadA, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    const resultB = await handleIncomingMessage(payloadB, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:01:00-03:00'),
    });

    expect(resultA).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(resultB).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockGetBarbershopBusinessSettings).toHaveBeenNthCalledWith(1, 'tenant-a');
    expect(mockGetBarbershopBusinessSettings).toHaveBeenNthCalledWith(2, 'tenant-b');
  });

  it('nao mistura tenant por contexto de sessao quando instanceName foi resolvido no banco', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Barber DB', whatsapp_instance_name: 'easybarber' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easybarber',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));

    const sessionLookupCall = mockPoolQuery.mock.calls.find(
      ([query]) => typeof query === 'string' && query.includes('FROM whatsapp_sessions')
    );

    expect(sessionLookupCall).toBeUndefined();
  });

  it('usa tenant resolvido por instanceName no fluxo de agendamento', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Tenant DB', whatsapp_instance_name: 'inst-agenda' }],
    });

    mockGetSession.mockResolvedValue({
      step: 'choose_time',
      data: {
        availableSlots: ['10:00'],
        selectedDate: '2026-04-20',
        barberId: 'barber-1',
        clientId: 'client-1',
        serviceId: 'service-1',
        serviceName: 'Corte',
        barberName: 'Joao',
        servicePrice: 55,
      },
    });

    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });

    const payload = {
      event: 'messages-upsert',
      instanceName: 'inst-agenda',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: '1',
      },
    };

    const result = await handleIncomingMessage(payload, '1', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockAppointmentServiceCreate).toHaveBeenCalledWith('tenant-db', {
      clientId: 'client-1',
      barberId: 'barber-1',
      serviceId: 'service-1',
      date: '2026-04-20',
      time: '10:00',
    });
  });

  it('falha fechado quando instanceName existe mas nao tem mapeamento no banco nem no legado', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });

    const payload = {
      event: 'messages-upsert',
      instanceName: 'tenant-inexistente',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'barbershop_not_resolved',
      })
    );

    const knownNumberLookupCall = mockPoolQuery.mock.calls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('regexp_replace(COALESCE(whatsapp')
    );

    expect(knownNumberLookupCall).toBeUndefined();
  });

  it('resolve tenant pelo contexto de sessao quando numero conectado estiver indisponivel', async () => {
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ barbershop_id: 'tenant-session' }],
    });

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );
    expect(mockGetBarbershopBusinessSettings).toHaveBeenCalledWith('tenant-session');

    const sessionLookupCall = mockPoolQuery.mock.calls.find(
      ([query]) => typeof query === 'string' && query.includes('FROM whatsapp_sessions')
    );

    expect(sessionLookupCall).toBeDefined();
  });

  it('processa simulador com barbershopId explicito sem depender de connectedNumber', async () => {
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: null,
    });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      simulationMode: true,
      barbershopId: 'tenant-sim',
      barbershopContextSource: 'payload',
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );
    expect(mockGetBarbershopBusinessSettings).toHaveBeenCalledWith('tenant-sim');

    const tenantLookupCall = mockPoolQuery.mock.calls.find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('regexp_replace(COALESCE(whatsapp')
    );

    expect(tenantLookupCall).toBeUndefined();
  });

  it('returns ambiguous_phone for @lid payload when no trusted fallback can be resolved', async () => {
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: null,
    });

    const payload = {
      key: {
        remoteJid: '236197968359561@lid',
      },
      sender: '5511888888888@s.whatsapp.net',
      from: '5511777777777@s.whatsapp.net',
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
        reason: 'from_me',
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
        reason: 'connected_number_match',
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

  it('responde fora do expediente quando mensagem chega as 07:30', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.stringContaining('08:00 as 18:00'),
      expect.objectContaining({
        knownInstanceNumbers: ['5511888888888'],
      })
    );
  });

  it('responde dentro do expediente quando mensagem chega as 10:00', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });

    mockIsWithinBusinessHours.mockReturnValue(true);

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );

    const [, sentMessage] = mockSendWhatsAppMessage.mock.calls[0];
    expect(sentMessage).toContain('Hoje atendemos até as 18:00');
    expect(sentMessage).toContain('menu');
  });

  it('detecta saudacao com variacao de caixa e espacos e reinicia o fluxo de forma controlada', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValueOnce({
      step: 'choose_service',
      data: { serviceId: 'svc-1' },
    });

    const result = await handleIncomingMessage('5511777777777', '   OIII   ', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockCreateSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.stringContaining('menu'),
      expect.any(Object)
    );
  });

  it('processa inbound @lid real com sender da instancia e participantPn flattenizado, disparando saudacao', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1', name: 'Barber Prime', whatsapp_instance_name: 'easybarber' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easybarber',
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

    const result = await handleIncomingMessage(payload, 'Olá', {
      eventName: 'messages-upsert',
      preExtractedInstanceNumbers: ['558396311811'],
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockCreateSession).toHaveBeenCalledWith('5583970011223', 'tenant-1');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5583970011223',
      expect.stringContaining('menu'),
      expect.objectContaining({
        remoteJidOriginal: '236197968359561@lid',
        eventName: 'messages-upsert',
        instanceName: 'easybarber',
      })
    );
  });

  it.each([
    'Oi',
    'Olá',
    'ola',
    'bom dia',
    'boa tarde',
    'boa noite',
    'iae',
    'eai',
    'opa',
    'fala',
    'tudo bem',
  ])('dispara menu inicial para saudacao "%s"', async (greeting) => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Barber Prime' }] });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const result = await handleIncomingMessage('5511777777777', greeting, {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.stringContaining('menu'),
      expect.any(Object)
    );
  });

  it('persiste agendamento via camada central com payload compativel quando auto confirmacao estiver desativada', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    mockGetSession.mockResolvedValue({
      step: 'choose_time',
      data: {
        availableSlots: ['10:00'],
        selectedDate: '2026-04-20',
        barberId: 'barber-1',
        clientId: 'client-1',
        serviceId: 'service-1',
        serviceName: 'Corte',
        barberName: 'Joao',
        servicePrice: 55,
      },
    });

    mockGetBarbershopBusinessSettings.mockResolvedValue({
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: false,
      autoConfirmAppointments: false,
      timezone: 'America/Sao_Paulo',
    });

    const result = await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockAppointmentServiceCreate).toHaveBeenCalledWith('tenant-1', {
      clientId: 'client-1',
      barberId: 'barber-1',
      serviceId: 'service-1',
      date: '2026-04-20',
      time: '10:00',
    });
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    const directInsertCall = mockPoolQuery.mock.calls.find(
      ([query]) => typeof query === 'string' && query.includes('INSERT INTO appointments')
    );
    expect(directInsertCall).toBeUndefined();
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');

    const [, sentMessage] = mockSendWhatsAppMessage.mock.calls[0];
    expect(sentMessage).toContain('Agendamento confirmado');
    expect(sentMessage).not.toContain('aguardando confirmacao da equipe');
  });

  it('nao confirma sucesso quando a persistencia do agendamento falha', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    mockGetSession.mockResolvedValue({
      step: 'choose_time',
      data: {
        availableSlots: ['10:00'],
        selectedDate: '2026-04-20',
        barberId: 'barber-1',
        clientId: 'client-1',
        serviceId: 'service-1',
        serviceName: 'Corte',
        barberName: 'Joao',
        servicePrice: 55,
      },
    });

    mockAppointmentServiceCreate.mockRejectedValue(new Error('db write failed'));

    const result = await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockAppointmentServiceCreate).toHaveBeenCalledTimes(1);
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);

    const [, sentMessage] = mockSendWhatsAppMessage.mock.calls[0];
    expect(sentMessage).toContain('Nao consegui confirmar seu agendamento agora');
    expect(sentMessage).not.toContain('Agendamento confirmado');
  });

  it('informa encaixe quando nao houver slots e allowWalkins estiver ativado', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ time: '08:00:00' }, { time: '08:30:00' }] });

    mockGetSession.mockResolvedValue({
      step: 'choose_date',
      data: {
        barberId: 'barber-1',
        serviceDuration: 30,
        availableDates: ['2026-04-20'],
      },
    });

    mockGetBarbershopBusinessSettings.mockResolvedValue({
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: true,
      autoConfirmAppointments: true,
      timezone: 'America/Sao_Paulo',
    });

    mockGenerateAvailableTimeSlots.mockReturnValue([]);

    const result = await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));

    const [, sentMessage] = mockSendWhatsAppMessage.mock.calls[0];
    expect(sentMessage).toContain('aceitamos encaixes durante o horario de atendimento');
  });
});
