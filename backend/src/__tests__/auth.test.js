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
  findUserByEmailIncludingBlocked: jest.fn(),
  findUserBySupabaseUserId: jest.fn(),
  findAnyUserByEmail: jest.fn(),
  findUserByEmailForSync: jest.fn(),
  findUserBySupabaseUserIdForUpdate: jest.fn(),
  findBarbershopByEmailForUpdate: jest.fn(),
  createBarbershop: jest.fn(),
  createUser: jest.fn(),
  upsertPendingRegistration: jest.fn(),
  findPendingRegistrationByEmail: jest.fn(),
  findPendingRegistrationByEmailForUpdate: jest.fn(),
  findPendingRegistrationForReconciliation: jest.fn(),
  markPendingRegistrationCompleted: jest.fn(),
  markPendingRegistrationCompletedByEmail: jest.fn(),
  completePendingRegistration: jest.fn(),
  touchPendingRegistrationVerificationSentAt: jest.fn(),
  setEmailVerificationToken: jest.fn(),
  findUserByEmailVerificationTokenHash: jest.fn(),
  clearEmailVerificationToken: jest.fn(),
  markEmailAsVerified: jest.fn(),
  markEmailAsVerifiedWithSupabaseIdentity: jest.fn(),
  updateUserIdentitySync: jest.fn(),
  upsertPlatformAdminUser: jest.fn(),
  upsertTenantAdminUser: jest.fn(),
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
  signInWithPassword: jest.fn(),
  signUpForEmailVerification: jest.fn(),
  resendVerificationEmail: jest.fn(),
  verifyEmailToken: jest.fn(),
  getVerifiedIdentityFromAccessToken: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserById: jest.fn(),
};

jest.unstable_mockModule('../services/supabaseAuthService.js', () => ({
  supabaseAuthService: mockSupabaseAuthService,
}));

// ===================== IMPORTS (após mocks) =====================

const { createTestApp } = await import('./helpers/testApp.js');
const supertest = (await import('supertest')).default;
const { AppError } = await import('../utils/errors.js');

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
  mockSupabaseAuthService.signInWithPassword.mockResolvedValue({
    userId: 'supabase-user-uuid',
    email: 'joao@teste.com',
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    sessionExpiresAt: null,
  });
  mockSupabaseAuthService.signUpForEmailVerification.mockResolvedValue({
    userId: 'supabase-user-uuid',
    email: 'joao@teste.com',
    verificationEmailSent: true,
  });
  mockSupabaseAuthService.resendVerificationEmail.mockResolvedValue({
    accepted: true,
    deliveryConfirmed: false,
    classification: 'accepted',
    summary: {
      hasUser: true,
      userId: 'supabase-user-uuid',
      email: 'joao@teste.com',
      actionLinkHost: 'localhost:3000',
    },
  });
  mockSupabaseAuthService.verifyEmailToken.mockResolvedValue({
    email: 'joao@teste.com',
    userId: 'supabase-user-uuid',
    verifiedAt: new Date().toISOString(),
    user: {
      id: 'supabase-user-uuid',
      email: 'joao@teste.com',
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    },
  });
  mockSupabaseAuthService.getVerifiedIdentityFromAccessToken.mockResolvedValue({
    userId: 'supabase-user-uuid',
    email: 'joao@teste.com',
    emailVerified: true,
    verifiedAt: new Date().toISOString(),
    user: {
      id: 'supabase-user-uuid',
      email: 'joao@teste.com',
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    },
  });
  mockSupabaseAuthService.getUserByEmail.mockResolvedValue(null);
  mockSupabaseAuthService.getUserById.mockResolvedValue(null);
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
      cpfCnpj: '52998224725',
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
          cpfCnpj: '52998224725',
        })
      );
    });

    it('deve retornar 400 ao enviar dados inválidos (sem email)', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        barbershopName: 'Teste',
        ownerName: 'João',
        whatsapp: '11999999999',
        cpfCnpj: '52998224725',
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

    it('deve retornar 400 ao enviar CPF/CNPJ inválido', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        ...validBody,
        cpfCnpj: '12345678900',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
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

      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: hashedPassword,
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        barbershop_name: 'Barbearia Teste',
        plan: 'basico',
        role: 'admin',
        auth_provider: 'legacy',
        blocked: false,
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
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue(null);

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

      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: hashedPassword,
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        plan: 'basico',
        role: 'admin',
        auth_provider: 'legacy',
        blocked: false,
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

      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: hashedPassword,
        email_verified: false,
        barbershop_id: 'barbershop-uuid',
        plan: 'basico',
        role: 'tenant_admin',
        auth_provider: 'legacy',
        blocked: false,
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('deve autenticar usuário supabase e sincronizar identidade', async () => {
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: 'hash-local-compat',
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        barbershop_name: 'Barbearia Teste',
        plan: 'premium',
        role: 'tenant_admin',
        auth_provider: 'supabase',
        supabase_user_id: 'supabase-user-uuid',
        blocked: false,
      });

      mockAuthRepository.updateUserIdentitySync.mockResolvedValue({
        id: 'user-uuid',
        supabase_user_id: 'supabase-user-uuid',
        auth_provider: 'supabase',
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
      expect(mockSupabaseAuthService.signInWithPassword).toHaveBeenCalledWith(
        'joao@teste.com',
        'Senha123!'
      );
      expect(mockAuthRepository.updateUserIdentitySync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'user-uuid',
          supabaseUserId: 'supabase-user-uuid',
          authProvider: 'supabase',
        })
      );
    });

    it('deve sincronizar email_verified local no login quando o Supabase já confirmou o e-mail', async () => {
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: 'hash-local-compat',
        email_verified: false,
        barbershop_id: 'barbershop-uuid',
        barbershop_name: 'Barbearia Teste',
        plan: 'premium',
        role: 'tenant_admin',
        auth_provider: 'supabase',
        supabase_user_id: 'supabase-user-uuid',
        blocked: false,
      });

      mockSupabaseAuthService.signInWithPassword.mockResolvedValue({
        userId: 'supabase-user-uuid',
        email: 'joao@teste.com',
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        sessionExpiresAt: null,
        user: {
          id: 'supabase-user-uuid',
          email: 'joao@teste.com',
          email_confirmed_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
        },
      });

      mockAuthRepository.findUserBySupabaseUserIdForUpdate.mockResolvedValue(null);
      mockAuthRepository.updateUserIdentitySync.mockResolvedValue({
        id: 'user-uuid',
        supabase_user_id: 'supabase-user-uuid',
        auth_provider: 'supabase',
      });
      mockAuthRepository.findUserByEmailForSync.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        barbershop_id: 'barbershop-uuid',
      });
      mockAuthRepository.findPendingRegistrationForReconciliation.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
        supabase_user_id: 'supabase-user-uuid',
        password_hash: 'hash-local-compat',
        status: 'pending',
      });
      mockAuthRepository.completePendingRegistration.mockResolvedValue({
        id: 'pending-uuid',
        status: 'completed',
      });
      mockAuthRepository.markEmailAsVerifiedWithSupabaseIdentity.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      });
      mockAuthRepository.findUserByEmailIncludingBlocked
        .mockResolvedValueOnce({
          id: 'user-uuid',
          email: 'joao@teste.com',
          password_hash: 'hash-local-compat',
          email_verified: false,
          barbershop_id: 'barbershop-uuid',
          barbershop_name: 'Barbearia Teste',
          plan: 'premium',
          role: 'tenant_admin',
          auth_provider: 'supabase',
          supabase_user_id: 'supabase-user-uuid',
          blocked: false,
        })
        .mockResolvedValueOnce({
          id: 'user-uuid',
          email: 'joao@teste.com',
          password_hash: 'hash-local-compat',
          email_verified: true,
          barbershop_id: 'barbershop-uuid',
          barbershop_name: 'Barbearia Teste',
          plan: 'premium',
          role: 'tenant_admin',
          auth_provider: 'supabase',
          supabase_user_id: 'supabase-user-uuid',
          blocked: false,
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
      expect(mockAuthRepository.markEmailAsVerifiedWithSupabaseIdentity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'user-uuid',
          supabaseUserId: 'supabase-user-uuid',
          authProvider: 'supabase',
        })
      );
      expect(mockAuthRepository.completePendingRegistration).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          pendingRegistrationId: 'pending-uuid',
          supabaseUserId: 'supabase-user-uuid',
        })
      );
    });

    it('deve reconciliar usuário confirmado no Supabase sem public.users e permitir login', async () => {
      const bcrypt = await import('bcryptjs');
      const pendingPasswordHash = await bcrypt.default.hash('Senha123!', 12);

      mockAuthRepository.findUserByEmailIncludingBlocked
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'user-uuid',
          email: 'joao@teste.com',
          password_hash: pendingPasswordHash,
          email_verified: true,
          barbershop_id: 'barbershop-uuid',
          barbershop_name: 'JoseBarber',
          plan: 'basico',
          role: 'tenant_admin',
          auth_provider: 'supabase',
          supabase_user_id: 'supabase-user-uuid',
          blocked: false,
        });
      mockAuthRepository.findPendingRegistrationByEmail.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
        supabase_user_id: 'supabase-user-uuid',
        barbershop_name: 'JoseBarber',
        owner_name: 'Jose',
        whatsapp: '83996311811',
        desired_plan: 'premium',
        password_hash: pendingPasswordHash,
        status: 'pending',
      });
      mockSupabaseAuthService.signInWithPassword.mockResolvedValue({
        userId: 'supabase-user-uuid',
        email: 'joao@teste.com',
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        sessionExpiresAt: null,
        user: {
          id: 'supabase-user-uuid',
          email: 'joao@teste.com',
          email_confirmed_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
        },
      });
      mockAuthRepository.findUserBySupabaseUserIdForUpdate.mockResolvedValue(null);
      mockAuthRepository.findUserByEmailForSync.mockResolvedValue(null);
      mockAuthRepository.findPendingRegistrationForReconciliation.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
        supabase_user_id: 'supabase-user-uuid',
        barbershop_name: 'JoseBarber',
        owner_name: 'Jose',
        whatsapp: '83996311811',
        desired_plan: 'premium',
        password_hash: pendingPasswordHash,
        status: 'pending',
      });
      mockAuthRepository.findBarbershopByEmailForUpdate.mockResolvedValue({
        id: 'barbershop-uuid',
        email: 'joao@teste.com',
      });
      mockAuthRepository.upsertTenantAdminUser.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        barbershop_id: 'barbershop-uuid',
      });
      mockAuthRepository.markEmailAsVerifiedWithSupabaseIdentity.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verified: true,
      });
      mockAuthRepository.completePendingRegistration.mockResolvedValue({
        id: 'pending-uuid',
        status: 'completed',
      });
      mockAuthRepository.revokeUserRefreshTokens.mockResolvedValue();
      mockAuthRepository.saveRefreshToken.mockResolvedValue();
      mockClientQuery.mockResolvedValue({ rows: [] });
      process.env.AUTH_PROVIDER_MODE = 'supabase';

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockAuthRepository.findBarbershopByEmailForUpdate).toHaveBeenCalledWith(
        expect.anything(),
        'joao@teste.com'
      );
      expect(mockAuthRepository.upsertTenantAdminUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'joao@teste.com',
          supabaseUserId: 'supabase-user-uuid',
          emailVerified: true,
        })
      );
      expect(mockAuthRepository.completePendingRegistration).toHaveBeenCalled();
    });

    it('deve retornar 403 quando o provedor informar e-mail não confirmado', async () => {
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: 'hash-local-compat',
        email_verified: false,
        barbershop_id: 'barbershop-uuid',
        barbershop_name: 'Barbearia Teste',
        plan: 'premium',
        role: 'tenant_admin',
        auth_provider: 'supabase',
        supabase_user_id: 'supabase-user-uuid',
        blocked: false,
      });

      mockSupabaseAuthService.signInWithPassword.mockRejectedValue(
        new AppError(
          'Conta não verificada. Verifique seu e-mail antes de fazer login.',
          403,
          'EMAIL_NOT_VERIFIED'
        )
      );

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('deve retornar 401 quando houver divergência de identidade supabase', async () => {
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: 'hash-local-compat',
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        plan: 'premium',
        role: 'tenant_admin',
        auth_provider: 'supabase',
        supabase_user_id: 'supabase-user-id-diferente',
        blocked: false,
      });

      mockSupabaseAuthService.signInWithPassword.mockResolvedValue({
        userId: 'supabase-user-uuid',
        email: 'joao@teste.com',
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        sessionExpiresAt: null,
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(mockAuthRepository.updateUserIdentitySync).not.toHaveBeenCalled();
    });

    it('deve retornar 401 para usuário bloqueado', async () => {
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        password_hash: 'hash-local-compat',
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        plan: 'premium',
        role: 'tenant_admin',
        auth_provider: 'legacy',
        blocked: true,
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
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

  describe('POST /api/v1/auth/verify-email-session', () => {
    it('deve confirmar e sincronizar e-mail a partir de access token válido', async () => {
      mockSupabaseAuthService.getVerifiedIdentityFromAccessToken.mockResolvedValue({
        userId: 'supabase-user-uuid',
        email: 'joao@teste.com',
        emailVerified: true,
        verifiedAt: new Date().toISOString(),
      });

      mockAuthRepository.findUserBySupabaseUserIdForUpdate.mockResolvedValue(null);
      mockAuthRepository.findUserByEmailForSync.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        barbershop_id: 'barbershop-uuid',
      });
      mockAuthRepository.findPendingRegistrationForReconciliation.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
        supabase_user_id: 'supabase-user-uuid',
        status: 'pending',
      });
      mockAuthRepository.completePendingRegistration.mockResolvedValue({
        id: 'pending-uuid',
        status: 'completed',
      });
      mockAuthRepository.markEmailAsVerifiedWithSupabaseIdentity.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      });
      mockClientQuery.mockResolvedValue({ rows: [] });

      const res = await request.post('/api/v1/auth/verify-email-session').send({
        accessToken: 'access-token-valid-1234567890abcdef',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSupabaseAuthService.getVerifiedIdentityFromAccessToken).toHaveBeenCalledWith(
        'access-token-valid-1234567890abcdef'
      );
    });

    it('deve retornar 400 quando access token não for enviado', async () => {
      const res = await request.post('/api/v1/auth/verify-email-session').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
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
        expect(res.body.data.message).toMatch(/novo link de verificação/i);
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

    it('deve usar Supabase no modo dual sem acionar SMTP', async () => {
      process.env.AUTH_PROVIDER_MODE = 'dual';

      mockAuthRepository.findPendingRegistrationByEmail.mockResolvedValue(null);
      mockAuthRepository.findUserByEmail.mockResolvedValue({
        id: 'legacy-user-uuid',
        email: 'joao@teste.com',
        email_verified: false,
        auth_provider: 'legacy',
      });

      const res = await request.post('/api/v1/auth/resend-verification').send({
        email: 'joao@teste.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSupabaseAuthService.resendVerificationEmail).toHaveBeenCalledWith('joao@teste.com');
      expect(mockEmailService.sendAccountVerificationEmail).not.toHaveBeenCalled();
      expect(mockAuthRepository.setEmailVerificationToken).not.toHaveBeenCalled();
    });

    it('não deve reenviar quando o usuário já estiver confirmado no Supabase e deve reconciliar o local', async () => {
      process.env.AUTH_PROVIDER_MODE = 'supabase';

      mockAuthRepository.findPendingRegistrationByEmail.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
        supabase_user_id: 'supabase-user-uuid',
      });
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockSupabaseAuthService.getUserByEmail.mockResolvedValue({
        id: 'supabase-user-uuid',
        email: 'joao@teste.com',
        emailVerified: true,
        email_confirmed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      });
      mockAuthRepository.findUserBySupabaseUserIdForUpdate.mockResolvedValue(null);
      mockAuthRepository.findUserByEmailForSync.mockResolvedValue(null);
      mockAuthRepository.findPendingRegistrationForReconciliation.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
        supabase_user_id: 'supabase-user-uuid',
        barbershop_name: 'JoseBarber',
        owner_name: 'Jose',
        whatsapp: '83996311811',
        desired_plan: 'premium',
        password_hash: 'hash',
        status: 'pending',
      });
      mockAuthRepository.findBarbershopByEmailForUpdate.mockResolvedValue({
        id: 'barbershop-uuid',
        email: 'joao@teste.com',
      });
      mockAuthRepository.upsertTenantAdminUser.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        barbershop_id: 'barbershop-uuid',
      });
      mockAuthRepository.markEmailAsVerifiedWithSupabaseIdentity.mockResolvedValue({
        id: 'user-uuid',
        email: 'joao@teste.com',
        email_verified: true,
      });
      mockAuthRepository.completePendingRegistration.mockResolvedValue({
        id: 'pending-uuid',
        status: 'completed',
      });
      mockClientQuery.mockResolvedValue({ rows: [] });

      const res = await request.post('/api/v1/auth/resend-verification').send({
        email: 'joao@teste.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSupabaseAuthService.resendVerificationEmail).not.toHaveBeenCalled();
      expect(mockAuthRepository.completePendingRegistration).toHaveBeenCalled();
    });

    it('deve retornar 503 controlado quando o Supabase estiver indisponível', async () => {
      process.env.AUTH_PROVIDER_MODE = 'supabase';

      mockAuthRepository.findPendingRegistrationByEmail.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
      });
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockSupabaseAuthService.resendVerificationEmail.mockRejectedValue(
        new AppError('Falha de rede no Supabase', 502, 'SUPABASE_NETWORK_ERROR')
      );

      const res = await request.post('/api/v1/auth/resend-verification').send({
        email: 'joao@teste.com',
      });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RESEND_VERIFICATION_PROVIDER_UNAVAILABLE');
      expect(mockEmailService.sendAccountVerificationEmail).not.toHaveBeenCalled();
    });

    it('deve retornar erro tecnico quando a identidade pendente nao existir no Supabase', async () => {
      process.env.AUTH_PROVIDER_MODE = 'supabase';

      mockAuthRepository.findPendingRegistrationByEmail.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
      });
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockSupabaseAuthService.resendVerificationEmail.mockRejectedValue(
        new AppError(
          'Link de verificação inválido ou já utilizado. Solicite um novo e-mail.',
          400,
          'INVALID_VERIFICATION_TOKEN'
        )
      );

      const res = await request.post('/api/v1/auth/resend-verification').send({
        email: 'joao@teste.com',
      });

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RESEND_VERIFICATION_IDENTITY_NOT_FOUND');
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
