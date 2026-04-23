import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockHandleIncomingMessage = jest.fn();
const mockGetWhatsAppStatus = jest.fn();

jest.unstable_mockModule('../services/whatsapp/index.js', () => ({
  handleIncomingMessage: mockHandleIncomingMessage,
  sendWhatsAppMessage: jest.fn(),
}));

jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: mockGetWhatsAppStatus,
  getWhatsAppStatusByInstance: jest.fn(() => ({ connectedNumber: null })),
  connectWhatsApp: jest.fn(),
  disconnectWhatsApp: jest.fn(),
  getWhatsAppQrCode: jest.fn(),
  sendWhatsAppText: jest.fn(),
  refreshWhatsAppStatus: jest.fn(),
  logoutWhatsApp: jest.fn(),
  restartWhatsApp: jest.fn(),
  initializeWhatsAppInstance: jest.fn(),
}));

jest.unstable_mockModule('../services/whatsapp/whatsappInstanceService.js', () => ({
  getBarbershopWhatsAppInstanceContext: jest.fn(async () => ({ whatsappInstanceName: 'easybarber' })),
}));

jest.unstable_mockModule('../middleware/auth.js', () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../middleware/rbac.js', () => ({
  requireTenantRoles: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../middleware/subscriptionGuard.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../config/database.js', () => ({
  default: {
    query: jest.fn(),
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

const router = (await import('../routes/whatsapp.js')).default;

const getWebhookEventHandler = () =>
  router.stack.find(
    (layer) => layer?.route?.path === '/webhook/:event' && layer?.route?.methods?.post
  )?.route?.stack?.[0]?.handle;

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return response;
};

describe('POST /api/v1/whatsapp/webhook/:event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: '558396311811' });
    mockHandleIncomingMessage.mockResolvedValue({
      ok: true,
      ignored: false,
      reason: null,
    });
  });

  it('preserva metadata util do payload bruto @lid mesmo quando o nodo normalizado e mais pobre', async () => {
    const handler = getWebhookEventHandler();
    const payload = {
      instanceName: 'easybarber',
      sender: '558396311811@s.whatsapp.net',
      message: {
        conversation: 'Olá',
        messageContextInfo: {
          participantPn: '5583970011223',
        },
      },
      data: {
        messages: [
          {
            key: {
              remoteJid: '236197968359561@lid',
              fromMe: false,
              id: 'MSG-1',
            },
            message: {
              conversation: 'Olá',
            },
          },
        ],
      },
    };
    const req = {
      id: 'req-1',
      params: {
        event: 'messages-upsert',
      },
      body: payload,
    };
    const res = createMockResponse();
    const next = jest.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.processed).toBe(true);
    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceName: 'easybarber',
        key: expect.objectContaining({
          remoteJid: '236197968359561@lid',
        }),
        message: expect.objectContaining({
          conversation: 'Olá',
          messageContextInfo: expect.objectContaining({
            participantPn: '5583970011223',
          }),
        }),
      }),
      'Olá',
      expect.objectContaining({
        preExtractedPhone: '5583970011223',
        preExtractedText: 'Olá',
        eventName: 'messages-upsert',
        preExtractedInstanceNumbers: ['558396311811'],
      })
    );
  });

  it('continua ignorando messages-set antes do parser principal', async () => {
    const handler = getWebhookEventHandler();
    const req = {
      id: 'req-2',
      params: {
        event: 'messages-set',
      },
      body: {
        data: {
          messages: [
            {
              key: {
                remoteJid: '5511999999999@s.whatsapp.net',
                fromMe: false,
              },
            },
          ],
        },
      },
    };
    const res = createMockResponse();
    const next = jest.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.processed).toBe(false);
    expect(mockHandleIncomingMessage).not.toHaveBeenCalled();
  });
});
