import { jest } from '@jest/globals';

// ===================== MOCKS =====================

const mockQuery = jest.fn();

jest.unstable_mockModule('../config/database.js', () => ({
  default: { query: mockQuery, end: jest.fn() },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn() },
}));

jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  initWhatsApp: jest.fn(), getWhatsAppStatus: jest.fn(), getWhatsAppClient: jest.fn(),
  connectWhatsApp: jest.fn(), disconnectWhatsApp: jest.fn(), getWhatsAppQrCode: jest.fn(),
  sendWhatsAppText: jest.fn(), refreshWhatsAppStatus: jest.fn(),
  logoutWhatsApp: jest.fn(), restartWhatsApp: jest.fn(),
}));

jest.unstable_mockModule('../services/whatsapp/index.js', () => ({
  handleWebhook: jest.fn(), handleIncomingMessage: jest.fn(), sendWhatsAppMessage: jest.fn(),
}));

jest.unstable_mockModule('../services/cronService.js', () => ({
  startReminderCron: jest.fn(),
}));

// Mock clientRepository
const mockClientRepo = {
  findAll: jest.fn(),
  findAllPaginated: jest.fn(),
  findByPhone: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
};

jest.unstable_mockModule('../repositories/clientRepository.js', () => ({
  clientRepository: mockClientRepo,
}));

jest.unstable_mockModule('../repositories/authRepository.js', () => ({
  authRepository: {
    getClient: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
    findUserByEmail: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeUserRefreshTokens: jest.fn(),
    findValidRefreshToken: jest.fn(),
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
  beforeEach(() => jest.clearAllMocks());

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
      mockClientRepo.create.mockImplementation(async (payload) => ({
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
