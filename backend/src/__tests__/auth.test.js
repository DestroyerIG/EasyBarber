import { jest } from '@jest/globals';

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

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn() },
}));

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
  findPendingRegistrationForReconciliation: jest.fn(),
  completePendingRegistration: jest.fn(),
  touchPendingRegistrationVerificationSentAt: jest.fn(),
  markEmailAsVerifiedWithSupabaseIdentity: jest.fn(),
  updateUserIdentitySync: jest.fn(),
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

const { createTestApp } = await import('./helpers/testApp.js');
const supertest = (await import('supertest')).default;
const jwt = (await import('jsonwebtoken')).default;
const { UnauthorizedError } = await import('../utils/errors.js');

const app = createTestApp();
const request = supertest(app);

const verifiedSupabaseIdentity = {
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
};

const localUser = {
  id: 'user-uuid',
  email: 'joao@teste.com',
  email_verified: true,
  barbershop_id: 'barbershop-uuid',
  barbershop_name: 'Barbearia Teste',
  plan: 'premium',
  role: 'tenant_admin',
  auth_provider: 'supabase',
  supabase_user_id: 'supabase-user-uuid',
  blocked: false,
  subscription_status: 'active',
  subscription_current_period_end: null,
};

const resetMocks = () => {
  jest.clearAllMocks();
  process.env.AUTH_PROVIDER_MODE = 'legacy';
  process.env.JWT_SECRET = 'test-secret';
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockSupabaseAuthService.signInWithPassword.mockResolvedValue(verifiedSupabaseIdentity);
  mockSupabaseAuthService.signUpForEmailVerification.mockResolvedValue({
    userId: 'supabase-user-uuid',
    email: 'joao@teste.com',
    verificationEmailSent: true,
  });
  mockSupabaseAuthService.resendVerificationEmail.mockResolvedValue({ accepted: true });
  mockSupabaseAuthService.getUserByEmail.mockResolvedValue(null);
  mockAuthRepository.updateUserIdentitySync.mockResolvedValue({
    id: 'user-uuid',
    supabase_user_id: 'supabase-user-uuid',
    auth_provider: 'supabase',
  });
  mockAuthRepository.revokeUserRefreshTokens.mockResolvedValue();
  mockAuthRepository.saveRefreshToken.mockResolvedValue();
};

describe('Auth API — Supabase only', () => {
  beforeEach(resetMocks);

  describe('POST /api/v1/auth/register', () => {
    const validBody = {
      barbershopName: 'Barbearia Teste',
      ownerName: 'Joao Silva',
      email: 'joao@teste.com',
      whatsapp: '11999999999',
      cpfCnpj: '52998224725',
      password: 'Senha123!',
      desiredPlan: 'premium',
    };

    it('inicia cadastro no Supabase Auth e salva pendência local', async () => {
      mockAuthRepository.findAnyUserByEmail.mockResolvedValue(null);
      mockAuthRepository.upsertPendingRegistration.mockResolvedValue({
        id: 'pending-uuid',
        email: 'joao@teste.com',
        supabase_user_id: 'supabase-user-uuid',
      });

      const res = await request.post('/api/v1/auth/register').send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationRequired).toBe(true);
      expect(res.body.data.barbershop.plan).toBe('basico');
      expect(res.body.data.barbershop.desiredPlan).toBe('premium');
      expect(mockSupabaseAuthService.signUpForEmailVerification).toHaveBeenCalledWith(
        'joao@teste.com',
        'Senha123!'
      );
      expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
      expect(mockAuthRepository.upsertPendingRegistration).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'joao@teste.com',
          supabaseUserId: 'supabase-user-uuid',
          passwordHash: expect.stringMatching(/^supabase:/),
        })
      );
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('autentica exclusivamente via Supabase Auth e mantém o JWT interno de sessão', async () => {
      mockAuthRepository.findUserBySupabaseUserId.mockResolvedValue(localUser);

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.token).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
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

    it('não autentica usuário legacy via bcrypt quando Supabase rejeita a senha', async () => {
      mockSupabaseAuthService.signInWithPassword.mockRejectedValue(
        new UnauthorizedError('Email ou senha incorretos')
      );
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        ...localUser,
        auth_provider: 'legacy',
        supabase_user_id: null,
        password_hash: '$2a$12$localbcrypthashthatmustnotbeused000000000000000000',
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(mockAuthRepository.findUserByEmailIncludingBlocked).not.toHaveBeenCalled();
      expect(mockAuthRepository.updateUserIdentitySync).not.toHaveBeenCalled();
    });

    it('sincroniza supabase_user_id quando encontra usuário local pelo e-mail', async () => {
      mockAuthRepository.findUserBySupabaseUserId.mockResolvedValue(null);
      mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue({
        ...localUser,
        supabase_user_id: null,
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(200);
      expect(mockAuthRepository.updateUserIdentitySync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'user-uuid',
          supabaseUserId: 'supabase-user-uuid',
          authProvider: 'supabase',
        })
      );
    });

    it('bloqueia usuário local bloqueado mesmo com credenciais Supabase válidas', async () => {
      mockAuthRepository.findUserBySupabaseUserId.mockResolvedValue({
        ...localUser,
        blocked: true,
      });

      const res = await request.post('/api/v1/auth/login').send({
        email: 'joao@teste.com',
        password: 'Senha123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('continua funcionando com JWT interno', async () => {
      const token = jwt.sign(
        {
          userId: 'user-uuid',
          barbershopId: 'barbershop-uuid',
          email: 'joao@teste.com',
          plan: 'premium',
          role: 'tenant_admin',
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      mockAuthRepository.findUserByEmail.mockResolvedValue(localUser);

      const res = await request.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('joao@teste.com');
    });
  });

  describe('bloqueio por assinatura', () => {
    const buildTenantToken = () => jwt.sign(
      {
        userId: 'user-uuid',
        barbershopId: 'barbershop-uuid',
        email: 'joao@teste.com',
        plan: 'premium',
        role: 'tenant_admin',
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    it('bloqueia dashboard quando assinatura está incompleta', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'barbershop-uuid',
          subscription_status: 'incomplete',
          provider: null,
          payment_method: null,
          provider_payment_id: null,
          provider_subscription_id: null,
          stripe_subscription_id: null,
          last_payment_date: null,
        }],
      });

      const res = await request
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${buildTenantToken()}`);

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.body.message).toBe('Finalize o pagamento para acessar o sistema.');
    });

    it('bloqueia status active sem evidência de pagamento', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'barbershop-uuid',
          subscription_status: 'active',
          provider: null,
          payment_method: null,
          provider_payment_id: null,
          provider_subscription_id: null,
          stripe_subscription_id: null,
          last_payment_date: null,
        }],
      });

      const res = await request
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${buildTenantToken()}`);

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.body.error.reason).toBe('missing_payment_evidence');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('continua renovando access/refresh tokens via cookie httpOnly', async () => {
      mockAuthRepository.findValidRefreshToken.mockResolvedValue({
        id: 'refresh-token-id',
        user_id: 'user-uuid',
        email: 'joao@teste.com',
        role: 'tenant_admin',
        email_verified: true,
        barbershop_id: 'barbershop-uuid',
        barbershop_name: 'Barbearia Teste',
        plan: 'premium',
        subscription_status: 'active',
        subscription_current_period_end: null,
      });
      mockAuthRepository.revokeRefreshTokenById.mockResolvedValue();

      const res = await request
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['refresh_token=refresh-token-value']);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.token).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
    });
  });
});
