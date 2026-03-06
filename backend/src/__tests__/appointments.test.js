import { jest } from '@jest/globals';

// ===================== MOCKS =====================

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClientQuery = jest.fn();

jest.unstable_mockModule('../config/database.js', () => ({
  default: { query: mockQuery, end: jest.fn() },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn() },
}));

jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  initWhatsApp: jest.fn(), getWhatsAppStatus: jest.fn(), getWhatsAppClient: jest.fn(),
  logoutWhatsApp: jest.fn(), restartWhatsApp: jest.fn(),
}));

jest.unstable_mockModule('../services/whatsapp/index.js', () => ({
  handleWebhook: jest.fn(), handleIncomingMessage: jest.fn(), sendWhatsAppMessage: jest.fn(),
}));

jest.unstable_mockModule('../services/cronService.js', () => ({
  startReminderCron: jest.fn(),
}));

// Mock appointmentRepository
const mockAppointmentRepo = {
  getClient: jest.fn().mockResolvedValue({ query: mockClientQuery, release: mockRelease }),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByIdForUpdate: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  validateEntityOwnership: jest.fn(),
  findConflict: jest.fn(),
  getBookedSlots: jest.fn(),
};

jest.unstable_mockModule('../repositories/appointmentRepository.js', () => ({
  appointmentRepository: mockAppointmentRepo,
}));

// Mocks de repositórios transitivos usados pelo appointmentService
jest.unstable_mockModule('../repositories/serviceRepository.js', () => ({
  serviceRepository: {
    findPrice: jest.fn().mockResolvedValue(null),
    findDuration: jest.fn().mockResolvedValue(null),
    findAllActive: jest.fn().mockResolvedValue([]),
    create: jest.fn(), update: jest.fn(), softDelete: jest.fn(),
  },
}));

jest.unstable_mockModule('../repositories/clientRepository.js', () => ({
  clientRepository: {
    updateLastVisit: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn(), create: jest.fn(), update: jest.fn(), softDelete: jest.fn(),
  },
}));

jest.unstable_mockModule('../repositories/financeRepository.js', () => ({
  financeRepository: {
    createEarning: jest.fn().mockResolvedValue(null),
    getSummary: jest.fn(), getExpenses: jest.fn(),
    createExpense: jest.fn(), updateExpense: jest.fn(), deleteExpense: jest.fn(),
  },
}));

// Mock authRepository para que auth middleware funcione
jest.unstable_mockModule('../repositories/authRepository.js', () => ({
  authRepository: {
    getClient: jest.fn().mockResolvedValue({ query: mockClientQuery, release: mockRelease }),
    findUserByEmail: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeUserRefreshTokens: jest.fn(),
    findValidRefreshToken: jest.fn(),
  },
}));

// ===================== IMPORTS =====================

const { ConflictError } = await import('../utils/errors.js');
const jwt = (await import('jsonwebtoken')).default;
const { createTestApp } = await import('./helpers/testApp.js');
const supertest = (await import('supertest')).default;

const app = createTestApp();
const request = supertest(app);

// ===================== HELPERS =====================

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const authToken = jwt.sign(
  { userId: 'user-uuid', barbershopId: 'bbshop-uuid', email: 'test@test.com', plan: 'basico', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '15m' }
);

const authHeader = { Authorization: `Bearer ${authToken}` };

const resetMocks = () => {
  jest.clearAllMocks();
  mockClientQuery.mockResolvedValue({ rows: [] });
};

// ===================== TESTS =====================

describe('Appointments API — /api/v1/appointments', () => {
  beforeEach(resetMocks);

  describe('GET /api/v1/appointments', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await request.get('/api/v1/appointments');
      expect(res.status).toBe(401);
    });

    it('deve listar agendamentos com autenticação', async () => {
      mockAppointmentRepo.findAll.mockResolvedValue([
        { id: 'apt-1', date: '2026-03-10', time: '09:00', status: 'confirmado' },
      ]);

      const res = await request.get('/api/v1/appointments').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/v1/appointments', () => {
    const validBody = {
      clientId: '550e8400-e29b-41d4-a716-446655440001',
      barberId: '550e8400-e29b-41d4-a716-446655440002',
      serviceId: '550e8400-e29b-41d4-a716-446655440003',
      date: '2026-04-15',
      time: '09:00',
    };

    it('deve criar agendamento com sucesso (201)', async () => {
      mockAppointmentRepo.validateEntityOwnership.mockResolvedValue(
        { client_ok: '1', barber_ok: '1', service_ok: '1' }
      );
      mockAppointmentRepo.findConflict.mockResolvedValue(null);
      mockAppointmentRepo.create.mockResolvedValue(
        { id: 'apt-new', ...validBody, status: 'confirmado' }
      );
      mockClientQuery.mockResolvedValue({ rows: [] });

      const res = await request.post('/api/v1/appointments').set(authHeader).send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('deve retornar 400 com dados inválidos (clientId não UUID)', async () => {
      const res = await request.post('/api/v1/appointments').set(authHeader).send({
        ...validBody,
        clientId: 'not-a-uuid',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('deve retornar 400 com data em formato inválido', async () => {
      const res = await request.post('/api/v1/appointments').set(authHeader).send({
        ...validBody,
        date: '../2026',
      });

      expect(res.status).toBe(400);
    });

    it('deve retornar 409 ao conflitar horário', async () => {
      mockAppointmentRepo.validateEntityOwnership.mockResolvedValue(
        { client_ok: '1', barber_ok: '1', service_ok: '1' }
      );
      mockAppointmentRepo.findConflict.mockResolvedValue({ id: 'existing-apt' });
      mockClientQuery.mockResolvedValue({ rows: [] });

      const res = await request.post('/api/v1/appointments').set(authHeader).send(validBody);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/appointments/:id/status', () => {
    it('deve atualizar status com sucesso', async () => {
      mockAppointmentRepo.findByIdForUpdate = jest.fn().mockResolvedValue(
        { id: '550e8400-e29b-41d4-a716-446655440001', status: 'confirmado', service_id: 's1', client_id: 'c1', date: '2026-04-15' }
      );
      mockAppointmentRepo.updateStatus = jest.fn().mockResolvedValue(
        { id: '550e8400-e29b-41d4-a716-446655440001', status: 'concluido' }
      );
      mockClientQuery.mockResolvedValue({ rows: [] });

      const res = await request
        .put('/api/v1/appointments/550e8400-e29b-41d4-a716-446655440001/status')
        .set(authHeader)
        .send({ status: 'concluido' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('deve retornar 400 com status inválido', async () => {
      const res = await request
        .put('/api/v1/appointments/550e8400-e29b-41d4-a716-446655440001/status')
        .set(authHeader)
        .send({ status: 'invalido' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
