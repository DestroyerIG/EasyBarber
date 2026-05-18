import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockClientQuery = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
}));

vi.mock('../config/database.js', () => ({
  default: { query: mockQuery, end: vi.fn(), connect: vi.fn() },
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../services/whatsappClient.js', () => ({
  initWhatsApp: vi.fn(),
  getWhatsAppStatus: vi.fn(),
  getWhatsAppClient: vi.fn(),
  connectWhatsApp: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  getWhatsAppQrCode: vi.fn(),
  sendWhatsAppText: vi.fn(),
  refreshWhatsAppStatus: vi.fn(),
  logoutWhatsApp: vi.fn(),
  restartWhatsApp: vi.fn(),
}));

vi.mock('../services/whatsapp/index.js', () => ({
  handleWebhook: vi.fn(),
  handleIncomingMessage: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('../services/cronService.js', () => ({
  startReminderCron: vi.fn(),
}));

const mockAuthRepository = {
  getClient: mockGetClient,
  findUserByEmail: vi.fn(),
  findUserByEmailIncludingBlocked: vi.fn(),
  findUserBySupabaseUserId: vi.fn(),
  findAnyUserByEmail: vi.fn(),
  findUserByEmailForSync: vi.fn(),
  findUserBySupabaseUserIdForUpdate: vi.fn(),
  findBarbershopByEmailForUpdate: vi.fn(),
  createBarbershop: vi.fn(),
  createUser: vi.fn(),
  upsertPendingRegistration: vi.fn(),
  findPendingRegistrationByEmail: vi.fn(),
  findPendingRegistrationForReconciliation: vi.fn(),
  completePendingRegistration: vi.fn(),
  touchPendingRegistrationVerificationSentAt: vi.fn(),
  markEmailAsVerifiedWithSupabaseIdentity: vi.fn(),
  updateUserIdentitySync: vi.fn(),
  upsertTenantAdminUser: vi.fn(),
  saveRefreshToken: vi.fn(),
  revokeUserRefreshTokens: vi.fn(),
  findValidRefreshToken: vi.fn(),
  revokeRefreshTokenById: vi.fn(),
  revokeRefreshTokenByHash: vi.fn(),
};

vi.mock('../repositories/authRepository.js', () => ({
  authRepository: mockAuthRepository,
}));

const mockRefreshTokenState = vi.hoisted(() => ({
  validToken: null as Record<string, unknown> | null,
}));

vi.mock('../repositories/refreshTokenRepository.js', () => ({
  refreshTokenRepository: {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findValidRefreshToken: vi.fn(async () => mockRefreshTokenState.validToken),
    revokeUserRefreshTokens: vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokenById: vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokenByHash: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockBillingContextState = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: {
    getBarbershopBillingContext: vi.fn(async () =>
      mockBillingContextState.current ? { ...mockBillingContextState.current } : null
    ),
  },
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === 'function') return (cb as (tx: unknown) => unknown)({});
      return cb;
    }),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockSupabaseAuthService = {
  signInWithPassword: vi.fn(),
  signUpForEmailVerification: vi.fn(),
  resendVerificationEmail: vi.fn(),
  verifyEmailToken: vi.fn(),
  getVerifiedIdentityFromAccessToken: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
};

vi.mock('../services/supabaseAuthService.js', () => ({
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
  vi.clearAllMocks();
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
  mockAuthRepository.revokeUserRefreshTokens.mockResolvedValue(undefined);
  mockAuthRepository.saveRefreshToken.mockResolvedValue(undefined);
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
        'Senha123!',
        null
      );
      expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
      expect(mockAuthRepository.upsertPendingRegistration).toHaveBeenCalledWith(
        null,
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
        null,
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
        null,
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
        process.env.JWT_SECRET as string,
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
      process.env.JWT_SECRET as string,
      { expiresIn: '15m' }
    );

    it('bloqueia dashboard quando assinatura está incompleta', async () => {
      mockBillingContextState.current = {
        barbershop_id: 'barbershop-uuid',
        subscription_status: 'incomplete',
        provider: null,
        payment_method: null,
        provider_payment_id: null,
        provider_subscription_id: null,
        stripe_subscription_id: null,
        last_payment_date: null,
      };
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

    // Behavior removed: middleware now trusts DB subscription_status as source of
    // truth. An 'active' status implies the webhook/admin/coupon already
    // confirmed payment, so there is no longer an extra payment-evidence gate.
    // Test kept (skipped) to document the change rather than silently delete it.
    it.skip('bloqueia status active sem evidência de pagamento', async () => {
      // Middleware reads billing context from the (mocked) repository.
      mockBillingContextState.current = {
        barbershop_id: 'barbershop-uuid',
        subscription_status: 'active',
        provider: null,
        payment_method: null,
        provider_payment_id: null,
        provider_subscription_id: null,
        stripe_subscription_id: null,
        last_payment_date: null,
      };
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
      // refresh service uses refreshTokenRepository, not authRepository.
      mockRefreshTokenState.validToken = {
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
      };
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
      mockAuthRepository.revokeRefreshTokenById.mockResolvedValue(undefined);

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
