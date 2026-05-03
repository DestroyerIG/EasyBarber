import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import express from 'express';

const mockHandleIncomingMessage = jest.fn();
const mockPoolQuery = jest.fn();

let mockAuthenticatedUser = {
  userId: 'user-1',
  barbershopId: 'tenant-1',
  email: 'tenant@test.com',
  plan: 'premium',
  role: 'tenant_admin',
};

jest.unstable_mockModule('../services/whatsapp/index.js', () => ({
  handleIncomingMessage: mockHandleIncomingMessage,
  sendWhatsAppMessage: jest.fn(),
}));

jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: jest.fn(() => ({ connectedNumber: null })),
  getWhatsAppStatusByInstance: jest.fn(() => ({ connectedNumber: null })),
  getConnectedNumberCached: jest.fn(() => null),
  connectWhatsApp: jest.fn(),
  disconnectWhatsApp: jest.fn(),
  getWhatsAppQrCode: jest.fn(),
  sendWhatsAppText: jest.fn(),
  refreshWhatsAppStatus: jest.fn(),
  logoutWhatsApp: jest.fn(),
  restartWhatsApp: jest.fn(),
  initializeWhatsAppInstance: jest.fn(),
}));

jest.unstable_mockModule('../middleware/auth.js', () => ({
  authMiddleware: (req, _res, next) => {
    req.user = { ...mockAuthenticatedUser };
    next();
  },
}));

jest.unstable_mockModule('../middleware/rbac.js', () => ({
  requireTenantRoles: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../middleware/subscriptionGuard.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
}));

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

const router = (await import('../routes/whatsapp.js')).default;
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/whatsapp', router);
app.use((err, _req, res, _next) => {
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
    jest.clearAllMocks();

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
