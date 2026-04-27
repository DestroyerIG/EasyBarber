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

// Mock financeService dependencies
const mockDashboardRepo = {
  getByBarbershop: jest.fn(),
};

jest.unstable_mockModule('../repositories/dashboardRepository.js', () => ({
  dashboardRepository: mockDashboardRepo,
}));

const mockFinanceRepo = {
  getSummary: jest.fn(),
  getMonthlyReport: jest.fn(),
  getMonthlyEarnings: jest.fn(),
  getMonthlyExpenses: jest.fn(),
  getExpenses: jest.fn(),
  createExpense: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
};

jest.unstable_mockModule('../repositories/financeRepository.js', () => ({
  financeRepository: mockFinanceRepo,
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
const createAuthHeader = ({
  plan = 'profissional',
  subscriptionStatus = 'active',
} = {}) => {
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

const mockActiveSubscriptionContext = () => {
  mockQuery.mockResolvedValue({
    rows: [{
      id: 'bbshop-uuid',
      subscription_status: 'active',
      provider: 'stripe',
      payment_method: 'card',
      provider_subscription_id: 'sub_test',
      stripe_subscription_id: 'sub_test',
      provider_payment_id: null,
      last_payment_date: null,
    }],
  });
};

// ===================== TESTS =====================

describe('Finance API — /api/v1/finance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveSubscriptionContext();
  });

  describe('GET /api/v1/finance/summary', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await request.get('/api/v1/finance/summary');
      expect(res.status).toBe(401);
    });

    it('deve retornar resumo financeiro com autenticação', async () => {
      mockFinanceRepo.getSummary.mockResolvedValue({
        earnings_today: '150.00',
        expenses_today: '30.00',
        earnings_month: '3000.00',
        expenses_month: '800.00',
      });

      const res = await request.get('/api/v1/finance/summary').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('today');
      expect(res.body.data.today).toHaveProperty('earnings');
    });
  });

  describe('POST /api/v1/finance/expenses', () => {
    it('deve criar gasto com sucesso (201)', async () => {
      mockFinanceRepo.createExpense.mockResolvedValue({
        id: 'exp-1', description: 'Produtos', category: 'Produtos', amount: 50.00, date: '2026-03-06',
      });

      const res = await request.post('/api/v1/finance/expenses').set(authHeader).send({
        description: 'Produtos de limpeza',
        category: 'Produtos',
        amount: 50.00,
        date: '2026-03-06',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('deve retornar 400 com valor negativo', async () => {
      const res = await request.post('/api/v1/finance/expenses').set(authHeader).send({
        description: 'Teste',
        category: 'Outros',
        amount: -10,
        date: '2026-03-06',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('deve retornar 400 sem campos obrigatórios', async () => {
      const res = await request.post('/api/v1/finance/expenses').set(authHeader).send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Feature guard', () => {
    it('deve bloquear relatório mensal para plano básico', async () => {
      const res = await request
        .get('/api/v1/finance/monthly')
        .set(createAuthHeader({ plan: 'basico', subscriptionStatus: 'active' }));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FEATURE_BLOCKED');
      expect(res.body.error.reason).toBe('plan_upgrade_required');
      expect(res.body.error.requiredPlan).toBe('profissional');
    });

    it('deve bloquear financeiro quando assinatura está past_due', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'bbshop-uuid',
          subscription_status: 'past_due',
          provider: 'stripe',
          payment_method: 'card',
          provider_subscription_id: 'sub_test',
          stripe_subscription_id: 'sub_test',
          provider_payment_id: null,
          last_payment_date: null,
        }],
      });

      const res = await request
        .get('/api/v1/finance/summary')
        .set(createAuthHeader({ plan: 'premium', subscriptionStatus: 'past_due' }));

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.body.error.reason).toBe('subscription_status_not_active');
      expect(res.body.error.billingActionRequired).toBe(true);
    });
  });
});
