import { vi, describe, it, expect, beforeEach } from 'vitest';

// ===================== MOCKS =====================

const mockQuery = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockClientQuery = vi.hoisted(() => vi.fn());

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

// Mock appointmentRepository
const mockAppointmentRepo = {
  getClient: vi.fn().mockResolvedValue({ query: mockClientQuery, release: mockRelease }),
  findAll: vi.fn(),
  findById: vi.fn(),
  findByIdForUpdate: vi.fn(),
  create: vi.fn(),
  updateStatus: vi.fn(),
  validateEntityOwnership: vi.fn(),
  findConflict: vi.fn(),
  getBookedSlots: vi.fn(),
};

vi.mock('../repositories/appointmentRepository.js', () => ({
  appointmentRepository: mockAppointmentRepo,
}));

// Mocks de repositórios transitivos usados pelo appointmentService
vi.mock('../repositories/serviceRepository.js', () => ({
  serviceRepository: {
    findPrice: vi.fn().mockResolvedValue(null),
    findDuration: vi.fn().mockResolvedValue(null),
    findAllActive: vi.fn().mockResolvedValue([]),
    create: vi.fn(), update: vi.fn(), softDelete: vi.fn(),
  },
}));

vi.mock('../repositories/clientRepository.js', () => ({
  clientRepository: {
    updateLastVisit: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn(), create: vi.fn(), update: vi.fn(), softDelete: vi.fn(),
  },
}));

vi.mock('../repositories/financeRepository.js', () => ({
  financeRepository: {
    createEarning: vi.fn().mockResolvedValue(null),
    getSummary: vi.fn(), getExpenses: vi.fn(),
    createExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(),
  },
}));

// Mock authRepository para que auth middleware funcione
vi.mock('../repositories/authRepository.js', () => ({
  authRepository: {
    getClient: vi.fn().mockResolvedValue({ query: mockClientQuery, release: mockRelease }),
    findUserByEmail: vi.fn(),
    saveRefreshToken: vi.fn(),
    revokeUserRefreshTokens: vi.fn(),
    findValidRefreshToken: vi.fn(),
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

const createAuthHeader = ({
  plan = 'basico',
  subscriptionStatus = 'active',
}: { plan?: string; subscriptionStatus?: string } = {}) => {
  const authToken = jwt.sign(
    {
      userId: 'user-uuid',
      barbershopId: 'bbshop-uuid',
      email: 'test@test.com',
      plan,
      role: 'admin',
      subscriptionStatus,
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  return { Authorization: `Bearer ${authToken}` };
};

const authHeader = createAuthHeader();

const resetMocks = () => {
  vi.clearAllMocks();
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

    it('deve bloquear acesso quando assinatura está incomplete', async () => {
      const res = await request
        .get('/api/v1/appointments')
        .set(createAuthHeader({ subscriptionStatus: 'incomplete' }));

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FEATURE_BLOCKED');
      expect(res.body.error.reason).toBe('subscription_status_restricted');
      expect(mockAppointmentRepo.findAll).not.toHaveBeenCalled();
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
      mockAppointmentRepo.findByIdForUpdate = vi.fn().mockResolvedValue(
        { id: '550e8400-e29b-41d4-a716-446655440001', status: 'confirmado', service_id: 's1', client_id: 'c1', date: '2026-04-15' }
      );
      mockAppointmentRepo.updateStatus = vi.fn().mockResolvedValue(
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

// Keep ConflictError imported to avoid unused import warning
void ConflictError;
