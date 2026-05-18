import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const mockHandleIncomingMessage = vi.hoisted(() => vi.fn());
const mockPoolQuery = vi.hoisted(() => vi.fn());

let mockAuthenticatedUser: {
  userId: string;
  barbershopId: string | null;
  email: string;
  plan: string;
  role: string;
} = {
  userId: 'user-1',
  barbershopId: 'tenant-1',
  email: 'tenant@test.com',
  plan: 'premium',
  role: 'tenant_admin',
};

vi.mock('../services/whatsapp/index.js', () => ({
  handleIncomingMessage: mockHandleIncomingMessage,
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: vi.fn(() => ({ connectedNumber: null })),
  getWhatsAppStatusByInstance: vi.fn(() => ({ connectedNumber: null })),
  getConnectedNumberCached: vi.fn(() => null),
  connectWhatsApp: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  getWhatsAppQrCode: vi.fn(),
  sendWhatsAppText: vi.fn(),
  refreshWhatsAppStatus: vi.fn(),
  logoutWhatsApp: vi.fn(),
  restartWhatsApp: vi.fn(),
  initializeWhatsAppInstance: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user: typeof mockAuthenticatedUser }).user = { ...mockAuthenticatedUser };
    next();
  },
}));

vi.mock('../middleware/rbac.js', () => ({
  requireTenantRoles: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../middleware/subscriptionGuard.js', () => ({
  requireFeature: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: mockPoolQuery,
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

vi.mock('../config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'tenant-1', name: 'Barber Test', whatsapp_instance_name: 'instance-1' }]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === 'function') return (cb as (tx: unknown) => unknown)({});
      return cb;
    }),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    barbershop: {
      findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Barber Test', whatsappInstanceName: 'instance-1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Barber Test' }),
    },
  },
}));

const router = (await import('../routes/whatsapp.js')).default;
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/whatsapp', router);
app.use((err: { statusCode?: number; code?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err?.statusCode || 500).json({
    success: false,
    error: {
      code: err?.code || 'INTERNAL_ERROR',
      message: err?.message || 'Erro inesperado',
    },
  });
});

const request = supertest(app);

describe('POST /api/v1/whatsapp/simulator/message', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticatedUser = {
      userId: 'user-1',
      barbershopId: 'tenant-1',
      email: 'tenant@test.com',
      plan: 'premium',
      role: 'tenant_admin',
    };

    mockPoolQuery.mockResolvedValue({ rows: [{ id: 'tenant-1' }] });
    mockHandleIncomingMessage.mockResolvedValue({
      ok: true,
      ignored: false,
      reason: null,
    });
  });

  it('processa simulador com barbershopId valido no payload', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi', barbershopId: 'tenant-1' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.processed).toBe(true);
    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      expect.any(Object),
      'oi',
      expect.objectContaining({
        simulationMode: true,
        barbershopId: 'tenant-1',
        barbershopContextSource: 'payload',
      })
    );
  });

  it('usa barbershopId do contexto autenticado quando payload nao informa', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      expect.any(Object),
      'oi',
      expect.objectContaining({
        simulationMode: true,
        barbershopId: 'tenant-1',
        barbershopContextSource: 'auth',
      })
    );
  });

  it('falha com erro claro quando contexto de barbershop nao esta disponivel', async () => {
    mockAuthenticatedUser = {
      userId: 'user-1',
      barbershopId: null,
      email: 'tenant@test.com',
      plan: 'premium',
      role: 'tenant_admin',
    };

    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('WHATSAPP_SIMULATOR_BARBERSHOP_REQUIRED');
    expect(mockHandleIncomingMessage).not.toHaveBeenCalled();
  });

  it('rejeita payload com barbershopId diferente do tenant autenticado', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi', barbershopId: 'tenant-2' });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('WHATSAPP_SIMULATOR_BARBERSHOP_FORBIDDEN');
    expect(mockHandleIncomingMessage).not.toHaveBeenCalled();
  });

  it('nao retorna 200 silencioso quando fluxo responde barbershop_not_resolved', async () => {
    mockHandleIncomingMessage.mockResolvedValue({
      ok: false,
      ignored: true,
      reason: 'barbershop_not_resolved',
    });

    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi', barbershopId: 'tenant-1' });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('WHATSAPP_SIMULATOR_CONTEXT_UNRESOLVED');
  });
});
