import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockHandleIncomingMessage = vi.hoisted(() => vi.fn());
const mockGetWhatsAppStatus = vi.hoisted(() => vi.fn());

vi.mock('../services/whatsapp/index.js', () => ({
  handleIncomingMessage: mockHandleIncomingMessage,
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: mockGetWhatsAppStatus,
  getWhatsAppStatusByInstance: vi.fn(() => ({ connectedNumber: null })),
  getConnectedNumberCached: vi.fn(() => {
    const status = mockGetWhatsAppStatus();
    return status?.connectedNumber || null;
  }),
  connectWhatsApp: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  getWhatsAppQrCode: vi.fn(),
  sendWhatsAppText: vi.fn(),
  refreshWhatsAppStatus: vi.fn(),
  logoutWhatsApp: vi.fn(),
  restartWhatsApp: vi.fn(),
  initializeWhatsAppInstance: vi.fn(),
}));

vi.mock('../services/whatsapp/whatsappInstanceService.js', () => ({
  getBarbershopWhatsAppInstanceContext: vi.fn(async () => ({ whatsappInstanceName: 'easybarber' })),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../middleware/rbac.js', () => ({
  requireTenantRoles: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../middleware/subscriptionGuard.js', () => ({
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: vi.fn(),
  },
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

const router = (await import('../routes/whatsapp.js')).default;

const getWebhookEventHandler = () =>
  (router as unknown as { stack: { route?: { path: string; methods?: { post?: boolean }; stack?: { handle: unknown }[] } }[] }).stack.find(
    (layer) => layer?.route?.path === '/webhook/:event' && layer?.route?.methods?.post
  )?.route?.stack?.[0]?.handle;

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response;
};

describe('POST /api/v1/whatsapp/webhook/:event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const next = vi.fn();

    await (handler as Function)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect((res.body as Record<string, unknown>).success).toBe(true);
    expect((res.body as Record<string, unknown>).data).toMatchObject({ processed: true });
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
    const next = vi.fn();

    await (handler as Function)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect((res.body as Record<string, unknown>).success).toBe(true);
    expect((res.body as Record<string, unknown>).data).toMatchObject({ processed: false });
    expect(mockHandleIncomingMessage).not.toHaveBeenCalled();
  });
});
