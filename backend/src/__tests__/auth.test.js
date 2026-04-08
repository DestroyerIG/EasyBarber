import { jest } from '@jest/globals';
import crypto from 'crypto';

// ===================== MOCKS =====================

// Mock database pool
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClientQuery = jest.fn();
const mockGetClient = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

jest.unstable_mockModule('../config/database.js', () => ({
  default: { query: mockQuery, end: jest.fn(), connect: jest.fn() },
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn() },
}));

// Mock WhatsApp
jest.unstable_mockModule('../services/whatsappClient.js', () => ({
  initWhatsApp: jest.fn(),
  getWhatsAppStatus: jest.fn(),
  getWhatsAppClient: jest.fn(),
  connectWhatsApp: jest.fn(),
  disconnectWhatsApp: jest.fn(),
  getWhatsAppQrCode: jest.fn(),
  sendWhatsAppText: jest.fn(),
  refreshWhatsAppStatus: jest.fn(),
  logoutWhatsApp: jest.fn(),
  restartWhatsApp: jest.fn(),
}));

jest.unstable_mockModule('../services/whatsapp/index.js', () => ({
  handleWebhook: jest.fn(),
  handleIncomingMessage: jest.fn(),
  sendWhatsAppMessage: jest.fn(),
}));

jest.unstable_mockModule('../services/cronService.js', () => ({
  startReminderCron: jest.fn(),
}));

// Mock authRepository
const mockAuthRepository = {
  getClient: mockGetClient,
  findUserByEmail: jest.fn(),
  findAnyUserByEmail: jest.fn(),
  findUserByEmailForSync: jest.fn(),
  createBarbershop: jest.fn(),
  createUser: jest.fn(),
  upsertPendingRegistration: jest.fn(),
  findPendingRegistrationByEmail: jest.fn(),
  findPendingRegistrationByEmailForUpdate: jest.fn(),
  markPendingRegistrationCompleted: jest.fn(),
  markPendingRegistrationCompletedByEmail: jest.fn(),
  touchPendingRegistrationVerificationSentAt: jest.fn(),
  setEmailVerificationToken: jest.fn(),
  findUserByEmailVerificationTokenHash: jest.fn(),
  clearEmailVerificationToken: jest.fn(),
  markEmailAsVerified: jest.fn(),
  markEmailAsVerifiedWithSupabaseIdentity: jest.fn(),
  saveRefreshToken: jest.fn(),
  revokeUserRefreshTokens: jest.fn(),
  findValidRefreshToken: jest.fn(),
  revokeRefreshTokenById: jest.fn(),
  revokeRefreshTokenByHash: jest.fn(),
};

jest.unstable_mockModule('../repositories/authRepository.js', () => ({
  authRepository: mockAuthRepository,
}));

const mockEmailService = {
  sendAccountVerificationEmail: jest.fn(),
};

jest.unstable_mockModule('../services/emailService.js', () => ({
  emailService: mockEmailService,
}));

const mockSupabaseAuthService = {
  signUpForEmailVerification: jest.fn(),
  resendVerificationEmail: jest.fn(),
  verifyEmailToken: jest.fn(),
};

jest.unstable_mockModule('../services/supabaseAuthService.js', () => ({
  supabaseAuthService: mockSupabaseAuthService,
}));

// ===================== IMPORTS (após mocks) =====================

const { createTestApp } = await import('./helpers/testApp.js');
const supertest = (await import('supertest')).default;

const app = createTestApp();
const request = supertest(app);

// ===================== HELPERS =====================

const resetMocks = () => {
  jest.clearAllMocks();
  process.env.AUTH_PROVIDER_MODE = 'legacy';
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockEmailService.sendAccountVerificationEmail.mockResolvedValue({
    delivered: true,
    mode: 'smtp',
  });
  mockSupabaseAuthService.signUpForEmailVerification.mockResolvedValue({
    userId: 'supabase-user-uuid',
    email: 'joao@teste.com',
    verificationEmailSent: true,
  });
  mockSupabaseAuthService.resendVerificationEmail.mockResolvedValue({ delivered: true });
  mockSupabaseAuthService.verifyEmailToken.mockResolvedValue({
    email: 'joao@teste.com',
    userId: 'supabase-user-uuid',
    verifiedAt: new Date().toISOString(),
  });
};

// ===================== TESTS =====================

describe('Auth API — /api/v1/auth', () => {
  beforeEach(resetMocks);

  // --- REGISTER ---
  describe('POST /api/v1/auth/register', () => {
    const validBody = {
      barbershopName: 'Barbearia Teste',
      ownerName: 'João Silva',
      email: 'joao@teste.com',
      whatsapp: '11999999999',
      password: 'Senha123!',
    };

    it('deve registrar com sucesso e retornar 201', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockAuthRepository.createBarbershop.mockResolvedValue({ id: 'barbershop-uuid' });
      mockAuthRepository.createUser.mockResolvedValue({ id: 'user-uuid' });
      mockAuthRepository.setEmailVerificationToken.mockResolvedValue();

      const res = await request.post('/api/v1/auth/register').send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationRequired).toBe(true);
      expect(res.body.data.verificationEmailSent).toBe(true);
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('barbershop');
      expect(res.body.data).not.toHaveProperty('token');
      expect(res.body.data).not.toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe('joao@teste.com');
      expect(res.body.data.barbershop.plan).toBe('basico');
      expect(mockAuthRepository.setEmailVerificationToken).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'user-uuid',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        })
      );
      expect(mockEmailService.sendAccountVerificationEmail).toHaveBeenCalled();
    });

    it('deve registrar desiredPlan sem alterar o plano inicial efetivo', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockAuthRepository.createBarbershop.mockResolvedValue({ id: 'barbershop-uuid' });
      mockAuthRepository.createUser.mockResolvedValue({ id: 'user-uuid' });
      mockAuthRepository.setEmailVerificationToken.mockResolvedValue();

      const res = await request.post('/api/v1/auth/register').send({
        ...validBody,
        desiredPlan: 'premium',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationRequired).toBe(true);
      expect(res.body.data.barbershop.plan).toBe('basico');
      expect(res.body.data.barbershop.desiredPlan).toBe('premium');
      expect(mockAuthRepository.createBarbershop).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          plan: 'basico',
          desiredPlan: 'premium',
        })
      );
    });

    it('deve retornar 400 ao enviar dados inválidos (sem email)', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        barbershopName: 'Teste',
        ownerName: 'João',
        whatsapp: '11999999999',
        password: 'Senha123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('deve retornar 400 ao enviar senha fraca (sem maiúscula)', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        ...validBody,
        password: 'senha123',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('deve retornar 409 ao registrar email duplicado', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockAuthRepository.createBarbershop.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' })
      );

      const res = await request.post('/api/v1/auth/register').send(validBody);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  // --- LOGIN ---
  describe('POST /api/v1/auth/login', () => {
    it('deve retornar 200 ao fazer login com credenciais válidas', async () => {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.default.hash('Senha123!', 12);

      mockAuthRepository.findUserByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: hashedPassword,
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        barbershop_name: 'Barbearia Teste',
        plan: 'basico',
        role: 'admin',
      });
      mockAuthRepository.revokeUserRefreshTokens.mockResolvedValue();
      mockAuthRepository.saveRefreshToken.mockResolvedValue();
      mockClientQuery.mockResolvedValue({ rows: [] });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.token).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
      expect(res.body.data.user.email).toBe('joao@teste.com');
    });

    it('deve retornar 401 com email inexistente', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);

      const res = await request.post('/api/v1/auth/login').send({
        email: 'naoexiste@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('deve retornar 401 com senha incorreta', async () => {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.default.hash('Senha123!', 12);

      mockAuthRepository.findUserByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: hashedPassword,
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        plan: 'basico',
        role: 'admin',
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'SenhaErrada1',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('deve retornar 403 quando o email ainda não foi verificado', async () => {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.default.hash('Senha123!', 12);

      mockAuthRepository.findUserByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: hashedPassword,
        email_verified: false,
        barbershop_id: 'barbershop-uuid',
        plan: 'basico',
        role: 'tenant_admin',
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('deve retornar 400 com body vazio', async () => {
      const res = await request.post('/api/v1/auth/login').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // --- ME ---
  describe('GET /api/v1/auth/me', () => {
    it('deve retornar 401 sem token de autenticação', async () => {
      const res = await request.get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('deve retornar 200 com token válido', async () => {
      const jwt = await import('jsonwebtoken');

      const token = jwt.default.sign(
        { userId: 'user-uuid', barbershopId: 'barbershop-uuid', email: 'joao@teste.com', plan: 'basico', role: 'admin' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '15m' }
      );

      mockAuthRepository.findUserByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verified: true,
        barbershop_name: 'Barbearia Teste',
        plan: 'basico',
        role: 'admin',
      });

      const res = await request.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // --- VERIFY EMAIL ---
  describe('GET /api/v1/auth/verify-email', () => {
    const validToken = 'verify-token-valid-1234567890abcdef';
    const validTokenHash = crypto.createHash('sha256').update(validToken).digest('hex');

    it('deve confirmar o e-mail com token válido', async () => {
      mockAuthRepository.findUserByEmailVerificationTokenHash.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verification_token_hash: validTokenHash,
        email_verification_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      mockAuthRepository.markEmailAsVerified.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      });

      const res = await request.get('/api/v1/auth/verify-email').query({ token: validToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.emailVerified).toBe(true);
      expect(mockAuthRepository.markEmailAsVerified).toHaveBeenCalledWith(
        expect.anything(),
        'user-uuid'
      );
    });

    it('deve falhar para token expirado', async () => {
      mockAuthRepository.findUserByEmailVerificationTokenHash.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verification_token_hash: validTokenHash,
        email_verification_expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      mockAuthRepository.clearEmailVerificationToken.mockResolvedValue();

      const res = await request.get('/api/v1/auth/verify-email').query({ token: validToken });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXPIRED_VERIFICATION_TOKEN');
      expect(mockAuthRepository.clearEmailVerificationToken).toHaveBeenCalledWith(
        expect.anything(),
        'user-uuid'
      );
    });

    it('deve falhar para token inválido ou reutilizado', async () => {
      mockAuthRepository.findUserByEmailVerificationTokenHash.mockResolvedValue(null);

      const res = await request.get('/api/v1/auth/verify-email').query({ token: validToken });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
    });
  });

  // --- RESEND VERIFICATION ---
  describe('POST /api/v1/auth/resend-verification', () => {
    it('deve gerar novo token e reenviar e-mail para conta não verificada', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verified: false,
        email_verification_token_hash: 'hash-antigo',
        barbershop_name: 'Barbearia Teste',
      });
      mockAuthRepository.setEmailVerificationToken.mockResolvedValue();

      const res = await request.post('/api/v1/auth/resend-verification').send({
        email: 'joao@teste.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/Se existir uma conta pendente/i);
      expect(mockAuthRepository.setEmailVerificationToken).toHaveBeenCalled();
      const [dbClient, payload] = mockAuthRepository.setEmailVerificationToken.mock.calls[0];
      expect(dbClient).toBeDefined();
      expect(payload.userId).toBe('user-uuid');
      expect(payload.tokenHash).toBeDefined();
      expect(payload.tokenHash).not.toBe('hash-antigo');
      expect(mockEmailService.sendAccountVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it('deve manter resposta genérica quando e-mail não existe', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);

      const res = await request.post('/api/v1/auth/resend-verification').send({
        email: 'naoexiste@teste.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/Se existir uma conta pendente/i);
      expect(mockAuthRepository.setEmailVerificationToken).not.toHaveBeenCalled();
      expect(mockEmailService.sendAccountVerificationEmail).not.toHaveBeenCalled();
    });
  });

  // --- REFRESH ---
  describe('POST /api/v1/auth/refresh', () => {
    it('deve retornar 401 sem refresh token', async () => {
      const res = await request.post('/api/v1/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
