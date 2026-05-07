import { vi, describe, it, expect, beforeEach } from 'vitest';

// ===================== MOCKS =====================

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../config/database.js', () => ({
  default: { query: mockQuery, end: vi.fn() },
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../services/whatsappClient.js', () => ({
  initWhatsApp: vi.fn(), getWhatsAppStatus: vi.fn(), getWhatsAppClient: vi.fn(),
  connectWhatsApp: vi.fn(), disconnectWhatsApp: vi.fn(), getWhatsAppQrCode: vi.fn(),
  sendWhatsAppText: vi.fn(), refreshWhatsAppStatus: vi.fn(),
  logoutWhatsApp: vi.fn(), restartWhatsApp: vi.fn(),
}));

vi.mock('../services/whatsapp/index.js', () => ({
  handleWebhook: vi.fn(), handleIncomingMessage: vi.fn(), sendWhatsAppMessage: vi.fn(),
}));

vi.mock('../services/cronService.js', () => ({
  startReminderCron: vi.fn(),
}));

// Mock clientRepository
const mockClientRepo = {
  findAll: vi.fn(),
  findAllPaginated: vi.fn(),
  findByPhone: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
};

vi.mock('../repositories/clientRepository.js', () => ({
  clientRepository: mockClientRepo,
}));

vi.mock('../repositories/authRepository.js', () => ({
  authRepository: {
    getClient: vi.fn().mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() }),
    findUserByEmail: vi.fn(),
    saveRefreshToken: vi.fn(),
    revokeUserRefreshTokens: vi.fn(),
    findValidRefreshToken: vi.fn(),
  },
}));

// ===================== IMPORTS =====================

const jwt = (await import('jsonwebtoken')).default;
const { createTestApp } = await import('./helpers/testApp.js');
const supertest = (await import('supertest')).default;

const app = createTestApp();
const request = supertest(app);

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const authToken = jwt.sign(
  { userId: 'user-uuid', barbershopId: 'bbshop-uuid', email: 'test@test.com', plan: 'basico', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '15m' }
);
const authHeader = { Authorization: `Bearer ${authToken}` };

// ===================== TESTS =====================

describe('Clients API — /api/v1/clients', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /api/v1/clients', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await request.get('/api/v1/clients');
      expect(res.status).toBe(401);
    });

    it('deve listar clientes com autenticação', async () => {
      mockClientRepo.findAll.mockResolvedValue([
        { id: 'c1', name: 'Maria', phone: '11999999999' },
      ]);

      const res = await request.get('/api/v1/clients').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/clients', () => {
    it('deve criar cliente com sucesso (201)', async () => {
      mockClientRepo.findByPhone.mockResolvedValue(null);
      mockClientRepo.create.mockResolvedValue({
        id: 'c-new', name: 'Pedro', phone: '11888888888',
      });

      const res = await request.post('/api/v1/clients').set(authHeader).send({
        name: 'Pedro',
        phone: '11888888888',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('deve criar cliente com campos opcionais vazios sem retornar 400', async () => {
      mockClientRepo.findByPhone.mockResolvedValue(null);
      mockClientRepo.create.mockImplementation(async (payload: Record<string, unknown>) => ({
        id: 'c-new',
        ...payload,
      }));

      const res = await request.post('/api/v1/clients').set(authHeader).send({
        name: 'Carlos',
        phone: '11999999999',
        email: '',
        birthDate: '',
        address: '',
        notes: '',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockClientRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        email: null,
        birth_date: null,
        address: null,
        notes: null,
      }));
    });

    it('deve criar cliente quando vier apenas whatsapp', async () => {
      mockClientRepo.findByPhone.mockResolvedValue(null);
      mockClientRepo.create.mockResolvedValue({
        id: 'c-new', name: 'Pedro', phone: '11888888888',
      });

      const res = await request.post('/api/v1/clients').set(authHeader).send({
        name: 'Pedro',
        whatsapp: '11888888888',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockClientRepo.findByPhone).toHaveBeenCalledWith('bbshop-uuid', '11888888888');
    });

    it('deve retornar 400 com nome muito curto', async () => {
      const res = await request.post('/api/v1/clients').set(authHeader).send({
        name: 'P',
        phone: '11888888888',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('deve retornar 400 sem telefone', async () => {
      const res = await request.post('/api/v1/clients').set(authHeader).send({
        name: 'Pedro Silva',
      });

      expect(res.status).toBe(400);
    });
  });
});
