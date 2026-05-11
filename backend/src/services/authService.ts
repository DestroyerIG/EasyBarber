import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authRepository } from '../repositories/authRepository.js';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { normalizeRole } from '../utils/roles.js';
import { getAuthProviderMode } from '../config/authProviderMode.js';
import { supabaseAuthService } from './supabaseAuthService.js';
import type { Response } from 'express';
import type { UserRole } from '../types/domain.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface JwtPayload {
  userId: string;
  barbershopId: string | null;
  email: string;
  plan: string;
  role: UserRole | undefined;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
}

interface UserPayload {
  barbershopId: string | null;
  email: string;
  role: UserRole | undefined;
  barbershopName: string | null;
  plan: string;
  emailVerified: boolean;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
}

interface RegisterResponse {
  verificationRequired: true;
  verificationEmailSent: boolean;
  message: string;
  user: UserPayload;
  barbershop: {
    id: string | null;
    name: string;
    plan: string;
    desiredPlan: string;
  };
}

interface VerificationResponse {
  message: string;
  user: {
    email: string;
    emailVerified: boolean;
    emailVerifiedAt: string;
  };
  barbershopId?: string | null;
  desiredPlan?: string;
  subscriptionStatus?: string;
  paymentRequired: boolean;
  confirmation?: ReconcileSummary | null;
}

interface ReconcileSummary {
  operation: string;
  email: string;
  supabaseUserId: string | null;
  supabaseEmailConfirmed: boolean;
  localUserFound: boolean;
  pendingRegistrationFound: boolean;
  localUserCreated: boolean;
  localUserUpdated: boolean;
  barbershopCreated: boolean;
  barbershopReused: boolean;
  pendingRegistrationCompleted: boolean;
  syncApplied: boolean;
  reason: string;
  barbershopId?: string | null;
  desiredPlan?: string;
  subscriptionStatus?: string;
  paymentRequired?: boolean;
}

interface LoginResponse {
  token: string;
  refreshToken: string;
  user: UserPayload;
}

interface RefreshResponse {
  token: string;
  refreshToken: string;
  user: UserPayload;
}

interface InternalSessionResult {
  token: string;
  refreshToken: string;
  user: UserPayload;
  desiredPlan: string;
  subscriptionStatus: string;
  barbershopId: string | null;
}

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: string;
  maxAge: number;
  domain?: string;
}

interface CookieOptionsSet {
  access: CookieOptions;
  refresh: CookieOptions;
}

interface RegisterParams {
  barbershopName: string;
  ownerName: string;
  email: string;
  whatsapp: string;
  cpfCnpj: string;
  password: string;
  desiredPlan?: string;
  emailRedirectTo?: string | null;
}

interface LoginParams {
  email: string;
  password: string;
}

interface SessionUser {
  userId: string;
  barbershopId: string | null;
  email: string;
  plan: string;
  role: string;
  barbershopName?: string | null;
  emailVerified?: boolean;
  subscriptionStatus?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
}

interface GetMeParams {
  userId: string;
  barbershopId: string | null;
  email: string;
  plan: string;
  role: string;
}

interface VerifyEmailTokenInput {
  token?: string;
  tokenHash?: string;
  token_hash?: string;
  type?: string;
  accessToken?: string;
  access_token?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'password1',
  'senha123', 'barbearia', 'barberpro', '123456789', '1234567890',
  'admin123', 'welcome', 'letmein', 'monkey', 'master', 'dragon',
]);

const DEFAULT_PLAN = 'basico';
const PASSWORD_HASH_PLACEHOLDER_PREFIX = 'supabase:';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resolveJwtSecret = (): string => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-secret';
  throw new AppError('JWT_SECRET não configurado', 500, 'JWT_SECRET_MISSING');
};

const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload as object, resolveJwtSecret(), { expiresIn: '15m' });
};

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const generateSupabasePasswordHashPlaceholder = (): string => {
  return `${PASSWORD_HASH_PLACEHOLDER_PREFIX}${crypto.randomBytes(64).toString('hex').slice(0, 51)}`;
};

const normalizeEmail = (email: unknown): string =>
  String(email || '').trim().toLowerCase();

const generateRefreshToken = async (dbClient: unknown, userId: string): Promise<string> => {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await refreshTokenRepository.saveRefreshToken({ userId, tokenHash, expiresAt });
  return token;
};

const getCookieOptions = (): CookieOptionsSet => {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite: 'none' | 'lax' = isProduction ? 'none' : 'lax';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;

  const shared = {
    httpOnly: true as const,
    secure: isProduction,
    sameSite,
    path: '/',
    ...(domain ? { domain } : {}),
  };

  return {
    access: {
      ...shared,
      maxAge: 15 * 60 * 1000,
    },
    refresh: {
      ...shared,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  };
};

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  const cookieOptions = getCookieOptions();

  res.cookie('access_token', accessToken, cookieOptions.access);
  res.cookie('refresh_token', refreshToken, cookieOptions.refresh);
};

const clearAuthCookies = (res: Response): void => {
  const cookieOptions = getCookieOptions();

  res.clearCookie('access_token', {
    path: cookieOptions.access.path,
    httpOnly: cookieOptions.access.httpOnly,
    secure: cookieOptions.access.secure,
    sameSite: cookieOptions.access.sameSite,
    ...(cookieOptions.access.domain ? { domain: cookieOptions.access.domain } : {}),
  });

  res.clearCookie('refresh_token', {
    path: cookieOptions.refresh.path,
    httpOnly: cookieOptions.refresh.httpOnly,
    secure: cookieOptions.refresh.secure,
    sameSite: cookieOptions.refresh.sameSite,
    ...(cookieOptions.refresh.domain ? { domain: cookieOptions.refresh.domain } : {}),
  });
};

const buildUserPayload = ({
  barbershopId,
  email,
  role,
  barbershopName,
  plan,
  emailVerified,
  subscriptionStatus,
  subscriptionCurrentPeriodEnd,
}: UserPayload): UserPayload => ({
  barbershopId,
  email,
  role,
  barbershopName,
  plan,
  emailVerified,
  subscriptionStatus,
  subscriptionCurrentPeriodEnd,
});

const buildRegisterResponse = ({
  email,
  role,
  barbershopName,
  plan,
  desiredPlan,
  verificationEmailSent,
  barbershopId,
  message,
}: {
  email: string;
  role: UserRole | undefined;
  barbershopName: string;
  plan: string;
  desiredPlan: string;
  verificationEmailSent: boolean;
  barbershopId: string | null;
  message: string;
}): RegisterResponse => ({
  verificationRequired: true,
  verificationEmailSent,
  message,
  user: buildUserPayload({
    barbershopId,
    email,
    role,
    barbershopName,
    plan,
    emailVerified: false,
    subscriptionStatus: 'incomplete',
    subscriptionCurrentPeriodEnd: null,
  }),
  barbershop: {
    id: barbershopId,
    name: barbershopName,
    plan,
    desiredPlan,
  },
});

const buildVerificationResponse = ({
  email,
  emailVerifiedAt,
  confirmation = null,
}: {
  email: string;
  emailVerifiedAt: string;
  confirmation?: ReconcileSummary | null;
}): VerificationResponse => ({
  message: 'E-mail confirmado com sucesso',
  user: {
    email,
    emailVerified: true,
    emailVerifiedAt,
  },
  ...(confirmation?.barbershopId ? { barbershopId: confirmation.barbershopId } : {}),
  ...(confirmation?.desiredPlan ? { desiredPlan: confirmation.desiredPlan } : {}),
  ...(confirmation?.subscriptionStatus ? { subscriptionStatus: confirmation.subscriptionStatus } : {}),
  paymentRequired: confirmation
    ? !['active', 'trialing'].includes(confirmation.subscriptionStatus || 'incomplete')
    : true,
  ...(confirmation ? { confirmation } : {}),
});

const buildResendVerificationResponse = (): { message: string } => ({
  message: 'Se existir uma conta pendente para este e-mail, um novo link de verificação foi enviado.',
});

const isSupabaseUserConfirmed = (supabaseUser: Record<string, unknown> | null | undefined): boolean =>
  Boolean(supabaseUser?.email_confirmed_at || supabaseUser?.confirmed_at);

const resolveSupabaseConfirmedAt = (
  supabaseUser: Record<string, unknown> | null | undefined,
  fallbackValue: string | null = null
): string | null => {
  return (supabaseUser?.email_confirmed_at as string) ||
    (supabaseUser?.confirmed_at as string) ||
    fallbackValue ||
    null;
};

const mapResendVerificationSupabaseError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    if (error.code === 'INVALID_VERIFICATION_TOKEN') {
      return new AppError(
        'Não foi possível localizar a identidade pendente no provedor de autenticação. Revise a configuração do Supabase Auth e a URL de redirecionamento.',
        502,
        'RESEND_VERIFICATION_IDENTITY_NOT_FOUND'
      );
    }

    if (error.code === 'SUPABASE_NETWORK_ERROR' || error.code === 'SUPABASE_AUTH_ERROR') {
      return new AppError(
        'Não foi possível reenviar o e-mail de verificação no provedor de identidade. Tente novamente.',
        503,
        'RESEND_VERIFICATION_PROVIDER_UNAVAILABLE'
      );
    }

    return error;
  }

  return new AppError(
    'Não foi possível processar o reenvio do e-mail de verificação. Tente novamente.',
    500,
    'RESEND_VERIFICATION_ERROR'
  );
};

// ─── Core flows ───────────────────────────────────────────────────────────────

const registerWithSupabasePrimaryFlow = async ({
  barbershopName,
  ownerName,
  email,
  whatsapp,
  cpfCnpj,
  password,
  desiredPlan,
  emailRedirectTo,
}: RegisterParams): Promise<RegisterResponse> => {
  const normalizedEmail = normalizeEmail(email);
  const plan = DEFAULT_PLAN;
  const onboardingDesiredPlan = desiredPlan || plan;
  const registerStartedAt = Date.now();
  let currentStage = 'checking_existing_user';

  logger.info(
    {
      mode: getAuthProviderMode(),
      email: normalizedEmail,
      stage: currentStage,
    },
    'Cadastro Supabase: início'
  );

  const existingUser = await authRepository.findAnyUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new ConflictError('Email já cadastrado');
  }

  let supabaseUserId: string | null = null;
  let verificationEmailSent = false;
  let existingConfirmedSupabaseUser: Record<string, unknown> | null = null;

  try {
    currentStage = 'supabase_signup';

    const signUpResult = await supabaseAuthService.signUpForEmailVerification(
      normalizedEmail,
      password,
      emailRedirectTo ?? null
    );
    supabaseUserId = signUpResult.userId;
    verificationEmailSent = signUpResult.verificationEmailSent !== false;
  } catch (error: unknown) {
    if (!(error instanceof AppError) || error.code !== 'SUPABASE_USER_EXISTS') {
      logger.error(
        {
          err: error,
          mode: getAuthProviderMode(),
          email: normalizedEmail,
          stage: currentStage,
          durationMs: Date.now() - registerStartedAt,
        },
        'Cadastro Supabase: falha ao iniciar identidade'
      );
      throw error;
    }

    try {
      currentStage = 'supabase_lookup_after_user_exists';
      const existingSupabaseUser = await supabaseAuthService.getUserByEmail(normalizedEmail);
      supabaseUserId = existingSupabaseUser?.id || null;

      if (existingSupabaseUser?.emailVerified) {
        existingConfirmedSupabaseUser = existingSupabaseUser as unknown as Record<string, unknown>;
        verificationEmailSent = false;
      } else {
        currentStage = 'supabase_resend_after_user_exists';
        await supabaseAuthService.resendVerificationEmail(normalizedEmail, emailRedirectTo ?? null);
        verificationEmailSent = true;
      }
    } catch (resendError: unknown) {
      verificationEmailSent = false;
      logger.error(
        {
          err: resendError,
          mode: getAuthProviderMode(),
          email: normalizedEmail,
          stage: currentStage,
          durationMs: Date.now() - registerStartedAt,
        },
        'Falha ao reenviar confirmação Supabase durante cadastro'
      );
    }
  }

  currentStage = 'prepare_local_supabase_placeholder';
  const passwordHash = generateSupabasePasswordHashPlaceholder();
  let pendingRegistration: Record<string, unknown> | null = null;

  try {
    currentStage = 'persist_pending_registration';

    pendingRegistration = await authRepository.upsertPendingRegistration(null, {
      email: normalizedEmail,
      supabaseUserId,
      barbershopName,
      ownerName,
      whatsapp,
      cpfCnpj,
      desiredPlan: onboardingDesiredPlan,
      passwordHash,
    });
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err.code === '23505') {
      throw new ConflictError('Email já cadastrado');
    }

    if (error instanceof AppError) {
      throw error;
    }

    logger.error(
      {
        err: error,
        mode: getAuthProviderMode(),
        email: normalizedEmail,
        stage: currentStage,
        durationMs: Date.now() - registerStartedAt,
      },
      'Erro ao persistir cadastro pendente Supabase'
    );
    throw new AppError('Erro ao iniciar cadastro. Tente novamente.', 500, 'REGISTER_ERROR');
  }

  currentStage = 'completed';

  if (existingConfirmedSupabaseUser) {
    await reconcileSupabaseConfirmedUser({
      email: normalizedEmail,
      supabaseUser: existingConfirmedSupabaseUser,
      reason: 'register_existing_confirmed_supabase_user',
    });
  }

  logger.info(
    {
      mode: getAuthProviderMode(),
      email: normalizedEmail,
      desiredPlan: onboardingDesiredPlan,
      verificationEmailSent,
      pendingRegistrationId: pendingRegistration?.id || null,
      supabaseUserId,
      stage: currentStage,
      durationMs: Date.now() - registerStartedAt,
    },
    'Cadastro iniciado com Supabase como fonte primária'
  );

  return buildRegisterResponse({
    email: normalizedEmail,
    role: normalizeRole('tenant_admin'),
    barbershopName,
    plan,
    desiredPlan: onboardingDesiredPlan,
    verificationEmailSent,
    barbershopId: (pendingRegistration?.id as string) || null,
    message: verificationEmailSent
      ? 'Cadastro realizado com sucesso. Verifique seu e-mail para ativar a conta.'
      : 'Cadastro iniciado, mas não foi possível enviar o e-mail de verificação no momento. Solicite o reenvio para ativar a conta.',
  });
};

const reconcileSupabaseConfirmedUser = async ({
  email,
  supabaseUser,
  reason = 'unspecified',
}: {
  email: string;
  supabaseUser: Record<string, unknown>;
  reason?: string;
}): Promise<ReconcileSummary> => {
  const normalizedEmail = normalizeEmail(email || supabaseUser?.email || '');
  const supabaseUserId = (supabaseUser?.id as string) || null;
  const supabaseEmailConfirmed = isSupabaseUserConfirmed(supabaseUser);
  const emailVerifiedAt = resolveSupabaseConfirmedAt(supabaseUser, new Date().toISOString()) as string;

  const summary: ReconcileSummary = {
    operation: 'confirmSignup',
    email: normalizedEmail,
    supabaseUserId,
    supabaseEmailConfirmed,
    localUserFound: false,
    pendingRegistrationFound: false,
    localUserCreated: false,
    localUserUpdated: false,
    barbershopCreated: false,
    barbershopReused: false,
    pendingRegistrationCompleted: false,
    syncApplied: false,
    reason,
  };

  if (!normalizedEmail || !supabaseUserId || !supabaseEmailConfirmed) {
    logger.info(summary, 'Reconciliação Supabase ignorada');
    return summary;
  }

  const client = null;

  try {
    const [userBySupabaseId, userByEmail, pendingRegistration] = await Promise.all([
      authRepository.findUserBySupabaseUserIdForUpdate(client, supabaseUserId),
      authRepository.findUserByEmailForSync(client, normalizedEmail),
      authRepository.findPendingRegistrationForReconciliation(client, {
        email: normalizedEmail,
        supabaseUserId,
      }),
    ]);

    const userBySupabaseIdRow = userBySupabaseId as Record<string, unknown> | null;
    const userByEmailRow = userByEmail as Record<string, unknown> | null;
    const pendingReg = pendingRegistration as Record<string, unknown> | null;

    summary.pendingRegistrationFound = Boolean(pendingReg);

    if (
      userBySupabaseIdRow &&
      userByEmailRow &&
      userBySupabaseIdRow.id !== userByEmailRow.id
    ) {
      logger.error(
        {
          ...summary,
          localUserBySupabaseId: userBySupabaseIdRow.id,
          localUserByEmail: userByEmailRow.id,
          reason: 'local_user_conflict',
        },
        'Reconciliação Supabase encontrou conflito de usuários locais'
      );

      throw new ConflictError('Conflito de identidade local detectado para este e-mail.');
    }

    let localUser: Record<string, unknown> | null = userBySupabaseIdRow || userByEmailRow || null;
    summary.localUserFound = Boolean(localUser);

    // barbershop_id from the user row — always prefer existing tenant
    let barbershopId: string | null = (localUser?.barbershop_id as string) || null;

    if (barbershopId) {
      summary.barbershopReused = true;
      logger.info(
        { event: 'tenant_reused', barbershopId, email: normalizedEmail, supabaseUserId, reason },
        'Reconciliação: tenant existente reutilizado via usuário local'
      );
    } else {
      const lookupEmail = (pendingReg?.email as string) || normalizedEmail;
      const reusableBarbershop = await authRepository.findBarbershopByEmailForUpdate(client, lookupEmail);

      if (reusableBarbershop) {
        barbershopId = (reusableBarbershop as Record<string, unknown>).id as string;
        summary.barbershopReused = true;
        logger.info(
          { event: 'tenant_reused', barbershopId, email: normalizedEmail, supabaseUserId, reason },
          'Reconciliação: tenant existente reutilizado via email'
        );
      } else if (pendingReg) {
        const createdBarbershop = await authRepository.createBarbershop(client, {
          name: pendingReg.barbershop_name as string,
          ownerName: pendingReg.owner_name as string,
          email: pendingReg.email as string,
          whatsapp: pendingReg.whatsapp as string,
          cpfCnpj: (pendingReg.cpf_cnpj as string) || null,
          plan: DEFAULT_PLAN,
          desiredPlan: (pendingReg.desired_plan as string) || DEFAULT_PLAN,
        });
        barbershopId = (createdBarbershop as Record<string, unknown>).id as string;
        summary.barbershopCreated = true;
        logger.info(
          { event: 'tenant_created', barbershopId, email: normalizedEmail, supabaseUserId, reason, source: 'pending_registration' },
          'Reconciliação: novo tenant criado a partir de pending_registration'
        );
      } else {
        const meta = (supabaseUser.user_metadata as Record<string, unknown>) || {};
        const displayName = (meta.full_name as string) || (meta.name as string) || normalizedEmail;
        const createdBarbershop = await authRepository.createBarbershop(client, {
          name: displayName,
          ownerName: displayName,
          email: normalizedEmail,
          whatsapp: '',
          cpfCnpj: null,
          plan: DEFAULT_PLAN,
          desiredPlan: DEFAULT_PLAN,
        });
        barbershopId = (createdBarbershop as Record<string, unknown>).id as string;
        summary.barbershopCreated = true;
        logger.info(
          { event: 'tenant_created', barbershopId, email: normalizedEmail, supabaseUserId, reason, source: 'supabase_identity' },
          'Reconciliação: novo tenant criado a partir de identidade Supabase'
        );
      }
    }

    summary.barbershopId = barbershopId;
    summary.desiredPlan = (pendingReg?.desired_plan as string) || (localUser?.desired_plan as string) || DEFAULT_PLAN;

    // Get real subscription status from barbershop — never infer incomplete blindly
    if (barbershopId) {
      const barbershop = await authRepository.findBarbershopById(client, barbershopId);
      summary.subscriptionStatus = (barbershop?.subscription_status as string) || 'incomplete';
      summary.desiredPlan = (pendingReg?.desired_plan as string) ||
        (barbershop?.desired_plan as string) ||
        (localUser?.desired_plan as string) ||
        DEFAULT_PLAN;
    } else {
      summary.subscriptionStatus = 'incomplete';
    }

    summary.paymentRequired = !['active', 'trialing'].includes(summary.subscriptionStatus);

    if (!localUser && barbershopId) {
      const passwordHash = (pendingReg?.password_hash as string) || generateSupabasePasswordHashPlaceholder();
      localUser = await authRepository.upsertTenantAdminUser(client, {
        barbershopId,
        email: normalizedEmail,
        passwordHash,
        supabaseUserId,
        emailVerified: true,
      }) as Record<string, unknown> | null;
      summary.localUserCreated = Boolean(localUser);
      summary.localUserFound = Boolean(localUser);
      logger.info(
        { event: 'user_created', userId: localUser?.id, barbershopId, email: normalizedEmail, supabaseUserId, reason },
        'Reconciliação: usuário local criado'
      );
    } else if (localUser) {
      const syncedUser = await authRepository.updateUserIdentitySync(client, {
        userId: localUser.id as string,
        supabaseUserId,
        authProvider: 'supabase',
      });

      if (syncedUser) {
        summary.localUserUpdated = true;
      }
      logger.info(
        { event: 'user_reconciled', userId: localUser.id, barbershopId, email: normalizedEmail, supabaseUserId, reason },
        'Reconciliação: usuário local sincronizado'
      );
    }

    if (localUser?.id) {
      const verifiedUser = await authRepository.markEmailAsVerifiedWithSupabaseIdentity(client, {
        userId: localUser.id as string,
        supabaseUserId,
        emailVerifiedAt,
        authProvider: 'supabase',
      });

      summary.localUserUpdated = summary.localUserUpdated || Boolean(verifiedUser);
    }

    if (pendingReg?.id) {
      const completedPending = await authRepository.completePendingRegistration(client, {
        pendingRegistrationId: pendingReg.id as string,
        confirmedAt: emailVerifiedAt,
        supabaseUserId,
      });

      summary.pendingRegistrationCompleted = Boolean(completedPending);
    }

    summary.syncApplied = Boolean(localUser?.id || summary.pendingRegistrationCompleted);

    logger.info(
      {
        operation: 'confirmSignup',
        supabaseUserId,
        email: normalizedEmail,
        localSyncApplied: summary.syncApplied,
        pendingRegistrationCompleted: summary.pendingRegistrationCompleted,
        localUserCreatedOrUpdated: summary.localUserCreated || summary.localUserUpdated,
        reason,
        summary,
      },
      'Reconciliação Supabase concluída'
    );
    return summary;
  } catch (error: unknown) {
    logger.error(
      {
        err: error,
        ...summary,
      },
      'Reconciliação Supabase falhou'
    );
    throw error;
  }
};

const verifyEmailWithSupabaseToken = async ({
  tokenHash,
  type,
}: {
  tokenHash: string;
  type?: string;
}): Promise<VerificationResponse> => {
  const verification = await supabaseAuthService.verifyEmailToken({ tokenHash, type });
  const supabaseUser: Record<string, unknown> = verification.user
    ? (verification.user as unknown as Record<string, unknown>)
    : {
        id: verification.userId,
        email: verification.email,
        email_confirmed_at: verification.verifiedAt,
        confirmed_at: verification.verifiedAt,
      };
  let confirmation: ReconcileSummary | null = null;

  try {
    confirmation = await reconcileSupabaseConfirmedUser({
      email: verification.email,
      supabaseUser,
      reason: 'verify_email_token',
    });
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err.code === '23505') {
      throw new ConflictError('Email já cadastrado');
    }

    if (error instanceof AppError) {
      throw error;
    }

    logger.error({ err: error, email: verification.email }, 'Erro ao sincronizar confirmação de e-mail via token Supabase');
    throw new AppError('Não foi possível confirmar o e-mail. Tente novamente.', 500, 'VERIFY_EMAIL_ERROR');
  }

  return buildVerificationResponse({
    email: verification.email,
    emailVerifiedAt: verification.verifiedAt || new Date().toISOString(),
    confirmation,
  });
};

const verifyEmailWithSupabaseSession = async ({
  accessToken,
}: {
  accessToken: string;
}): Promise<VerificationResponse> => {
  const identity = await supabaseAuthService.getVerifiedIdentityFromAccessToken(accessToken);

  if (!identity.emailVerified) {
    throw new AppError(
      'Conta não verificada. Verifique seu e-mail antes de fazer login.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }
  let confirmation: ReconcileSummary | null = null;

  try {
    const supabaseUser: Record<string, unknown> = identity.user
      ? (identity.user as unknown as Record<string, unknown>)
      : {
          id: identity.userId,
          email: identity.email,
          email_confirmed_at: identity.verifiedAt,
          confirmed_at: identity.verifiedAt,
        };

    confirmation = await reconcileSupabaseConfirmedUser({
      email: identity.email,
      supabaseUser,
      reason: 'verify_email_session',
    });
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err.code === '23505') {
      throw new ConflictError('Email já cadastrado');
    }

    if (error instanceof AppError) {
      throw error;
    }

    logger.error({ err: error, email: identity.email }, 'Erro ao sincronizar confirmação de e-mail via sessão Supabase');
    throw new AppError('Não foi possível confirmar o e-mail. Tente novamente.', 500, 'VERIFY_EMAIL_ERROR');
  }

  return buildVerificationResponse({
    email: identity.email,
    emailVerifiedAt: identity.verifiedAt || new Date().toISOString(),
    confirmation,
  });
};

const createInternalSessionForConfirmedUser = async (
  res: Response,
  { email, supabaseUserId }: { email: string; supabaseUserId: string }
): Promise<InternalSessionResult> => {
  let user = await authRepository.findUserBySupabaseUserId(supabaseUserId) as Record<string, unknown> | null;

  if (!user) {
    user = await authRepository.findUserByEmailIncludingBlocked(email) as Record<string, unknown> | null;
  }

  if (user?.blocked) {
    throw new UnauthorizedError('Conta bloqueada');
  }

  if (!user) {
    throw new AppError(
      'Usuário local não encontrado após reconciliação. Contate o suporte.',
      500,
      'LOCAL_USER_NOT_FOUND_AFTER_RECONCILE'
    );
  }

  await refreshTokenRepository.revokeUserRefreshTokens(user.id as string);

  const normalizedRole = normalizeRole(user.role as string);
  const accessToken = generateAccessToken({
    userId: user.id as string,
    barbershopId: (user.barbershop_id as string) || null,
    email: user.email as string,
    plan: user.plan as string,
    role: normalizedRole,
    subscriptionStatus: (user.subscription_status as string) || null,
    subscriptionCurrentPeriodEnd: (user.subscription_current_period_end as string) || null,
  });
  const refreshToken = await generateRefreshToken(null, user.id as string);

  setAuthCookies(res, accessToken, refreshToken);

  return {
    token: accessToken,
    refreshToken,
    user: buildUserPayload({
      barbershopId: (user.barbershop_id as string) || null,
      email: user.email as string,
      role: normalizedRole,
      barbershopName: (user.barbershop_name as string) || null,
      plan: user.plan as string,
      emailVerified: Boolean(user.email_verified),
      subscriptionStatus: (user.subscription_status as string) || null,
      subscriptionCurrentPeriodEnd: (user.subscription_current_period_end as string) || null,
    }),
    desiredPlan: (user.desired_plan as string) || (user.plan as string) || DEFAULT_PLAN,
    subscriptionStatus: (user.subscription_status as string) || 'incomplete',
    barbershopId: (user.barbershop_id as string) || null,
  };
};

// ─── Exported service ─────────────────────────────────────────────────────────

export const authService = {
  isCommonPassword(password: string): boolean {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  },

  async register(
    _res: Response,
    {
      barbershopName,
      ownerName,
      email,
      whatsapp,
      cpfCnpj,
      password,
      desiredPlan,
      emailRedirectTo,
    }: RegisterParams
  ): Promise<RegisterResponse> {
    return registerWithSupabasePrimaryFlow({
      barbershopName,
      ownerName,
      email,
      whatsapp,
      cpfCnpj,
      password,
      desiredPlan,
      emailRedirectTo,
    });
  },

  async login(res: Response, { email, password }: LoginParams): Promise<LoginResponse> {
    const normalizedEmail = normalizeEmail(email);

    try {
      let supabaseIdentity: Awaited<ReturnType<typeof supabaseAuthService.signInWithPassword>>;

      try {
        supabaseIdentity = await supabaseAuthService.signInWithPassword(normalizedEmail, password);
      } catch (error: unknown) {
        if (error instanceof AppError && error.code === 'EMAIL_NOT_VERIFIED') {
          throw error;
        }

        if (error instanceof UnauthorizedError) {
          logger.warn(
            {
              email: normalizedEmail,
              authMode: getAuthProviderMode(),
              reason: 'invalid_supabase_credentials',
            },
            'Login negado: credenciais inválidas no Supabase Auth'
          );
          throw new UnauthorizedError('Email ou senha incorretos');
        }

        throw error;
      }

      if (!supabaseIdentity.emailVerified) {
        logger.warn(
          {
            email: normalizedEmail,
            supabaseUserId: supabaseIdentity.userId,
            reason: 'email_not_verified_provider',
          },
          'Login negado: e-mail não verificado no provedor Supabase'
        );
        throw new AppError(
          'Conta não verificada. Verifique seu e-mail antes de fazer login.',
          403,
          'EMAIL_NOT_VERIFIED'
        );
      }

      let user = await authRepository.findUserBySupabaseUserId(supabaseIdentity.userId) as Record<string, unknown> | null;

      if (!user) {
        user = await authRepository.findUserByEmailIncludingBlocked(normalizedEmail) as Record<string, unknown> | null;
      }

      if (!user) {
        const supabaseUser: Record<string, unknown> = supabaseIdentity.user
          ? (supabaseIdentity.user as unknown as Record<string, unknown>)
          : {
              id: supabaseIdentity.userId,
              email: supabaseIdentity.email,
              email_confirmed_at: supabaseIdentity.emailVerifiedAt,
              confirmed_at: supabaseIdentity.emailVerifiedAt,
            };

        await reconcileSupabaseConfirmedUser({
          email: normalizedEmail,
          supabaseUser,
          reason: 'login_without_local_user',
        });

        user = (await authRepository.findUserBySupabaseUserId(supabaseIdentity.userId)
          || await authRepository.findUserByEmailIncludingBlocked(normalizedEmail)) as Record<string, unknown> | null;
      }

      if (!user) {
        logger.error(
          {
            email: normalizedEmail,
            authMode: getAuthProviderMode(),
            supabaseUserId: supabaseIdentity.userId,
            reason: 'local_user_creation_failed_after_reconcile',
          },
          'Login falhou: reconciliação Supabase não criou usuário local'
        );
        throw new AppError(
          'Não foi possível completar o login. Tente novamente ou entre em contato com o suporte.',
          500,
          'LOCAL_USER_RECONCILE_FAILED'
        );
      }

      const authProvider = 'supabase';
      const normalizedRole = normalizeRole(user.role as string);
      let resolvedEmailVerified = Boolean(user.email_verified);

      if (user.blocked) {
        logger.warn(
          {
            email: normalizedEmail,
            userId: user.id,
            authProvider,
            reason: 'blocked_user',
          },
          'Login negado: usuário bloqueado'
        );
        throw new UnauthorizedError('Email ou senha incorretos');
      }

      if (user.supabase_user_id && user.supabase_user_id !== supabaseIdentity.userId) {
        logger.error(
          {
            email: normalizedEmail,
            userId: user.id,
            authProvider,
            reason: 'identity_mismatch',
            expectedSupabaseUserId: user.supabase_user_id,
            providedSupabaseUserId: supabaseIdentity.userId,
          },
          'Login negado: divergência de identidade Supabase'
        );
        throw new UnauthorizedError('Email ou senha incorretos');
      }

      await authRepository.updateUserIdentitySync(null, {
        userId: user.id as string,
        supabaseUserId: supabaseIdentity.userId,
        authProvider: 'supabase',
      });

      logger.info(
        {
          email: normalizedEmail,
          userId: user.id,
          authProvider,
          supabaseUserId: supabaseIdentity.userId,
          identityLinked: !user.supabase_user_id,
        },
        'Sincronização de identidade Supabase atualizada no login'
      );

      if (!resolvedEmailVerified) {
        const supabaseUser: Record<string, unknown> = supabaseIdentity.user
          ? (supabaseIdentity.user as unknown as Record<string, unknown>)
          : {
              id: supabaseIdentity.userId,
              email: supabaseIdentity.email,
              email_confirmed_at: supabaseIdentity.emailVerifiedAt,
              confirmed_at: supabaseIdentity.emailVerifiedAt,
            };

        await reconcileSupabaseConfirmedUser({
          email: normalizedEmail,
          supabaseUser,
          reason: 'login_confirmed_user',
        });

        const refreshedUser = (await authRepository.findUserBySupabaseUserId(supabaseIdentity.userId)
          || await authRepository.findUserByEmailIncludingBlocked(normalizedEmail)) as Record<string, unknown> | null;

        if (refreshedUser) {
          user = refreshedUser;
          resolvedEmailVerified = Boolean(refreshedUser.email_verified);
        }
      }

      if (!resolvedEmailVerified) {
        logger.warn(
          {
            email: normalizedEmail,
            userId: user.id,
            authProvider,
            reason: 'email_not_verified',
          },
          'Login negado: e-mail não verificado'
        );
        throw new AppError(
          'Conta não verificada. Verifique seu e-mail antes de fazer login.',
          403,
          'EMAIL_NOT_VERIFIED'
        );
      }

      await refreshTokenRepository.revokeUserRefreshTokens(user.id as string);

      const accessToken = generateAccessToken({
        userId: user.id as string,
        barbershopId: (user.barbershop_id as string) || null,
        email: user.email as string,
        plan: user.plan as string,
        role: normalizedRole,
        subscriptionStatus: (user.subscription_status as string) || null,
        subscriptionCurrentPeriodEnd: (user.subscription_current_period_end as string) || null,
      });

      const refreshToken = await generateRefreshToken(null, user.id as string);

      setAuthCookies(res, accessToken, refreshToken);

      logger.info(
        {
          userId: user.id,
          email: normalizedEmail,
          authProvider,
        },
        'Login realizado'
      );

      return {
        token: accessToken,
        refreshToken,
        user: buildUserPayload({
          barbershopId: (user.barbershop_id as string) || null,
          email: user.email as string,
          role: normalizedRole,
          barbershopName: (user.barbershop_name as string) || null,
          plan: user.plan as string,
          emailVerified: resolvedEmailVerified,
          subscriptionStatus: (user.subscription_status as string) || null,
          subscriptionCurrentPeriodEnd: (user.subscription_current_period_end as string) || null,
        }),
      };
    } catch (error: unknown) {
      throw error;
    }
  },

  async refresh(res: Response, refreshCookieToken: string | undefined): Promise<RefreshResponse> {
    if (!refreshCookieToken) {
      throw new UnauthorizedError('Refresh token não fornecido');
    }

    const tokenHash = hashToken(refreshCookieToken);
    const row = await refreshTokenRepository.findValidRefreshToken(tokenHash) as Record<string, unknown> | null;

    if (!row) {
      throw new UnauthorizedError('Refresh token inválido ou expirado');
    }

    const normalizedRole = normalizeRole(row.role as string);

    await refreshTokenRepository.revokeRefreshTokenById(row.id as string);

    const newRefreshToken = await generateRefreshToken(null, row.user_id as string);

    const accessToken = generateAccessToken({
      userId: row.user_id as string,
      barbershopId: (row.barbershop_id as string) || null,
      email: row.email as string,
      plan: row.plan as string,
      role: normalizedRole,
      subscriptionStatus: (row.subscription_status as string) || null,
      subscriptionCurrentPeriodEnd: (row.subscription_current_period_end as string) || null,
    });

    setAuthCookies(res, accessToken, newRefreshToken);

    return {
      token: accessToken,
      refreshToken: newRefreshToken,
      user: buildUserPayload({
        barbershopId: (row.barbershop_id as string) || null,
        email: row.email as string,
        role: normalizedRole,
        barbershopName: (row.barbershop_name as string) || null,
        plan: row.plan as string,
        emailVerified: Boolean(row.email_verified),
        subscriptionStatus: (row.subscription_status as string) || null,
        subscriptionCurrentPeriodEnd: (row.subscription_current_period_end as string) || null,
      }),
    };
  },

  async refreshAuthenticatedSession(res: Response, sessionUser: SessionUser): Promise<RefreshResponse> {
    await refreshTokenRepository.revokeUserRefreshTokens(sessionUser.userId);

    const normalizedRole = normalizeRole(sessionUser.role);
    const accessToken = generateAccessToken({
      userId: sessionUser.userId,
      barbershopId: sessionUser.barbershopId,
      email: sessionUser.email,
      plan: sessionUser.plan,
      role: normalizedRole,
      subscriptionStatus: sessionUser.subscriptionStatus ?? null,
      subscriptionCurrentPeriodEnd: sessionUser.subscriptionCurrentPeriodEnd ?? null,
    });

    const refreshToken = await generateRefreshToken(null, sessionUser.userId);

    setAuthCookies(res, accessToken, refreshToken);

    return {
      token: accessToken,
      refreshToken,
      user: buildUserPayload({
        barbershopId: sessionUser.barbershopId,
        email: sessionUser.email,
        role: normalizedRole,
        barbershopName: sessionUser.barbershopName ?? null,
        plan: sessionUser.plan,
        emailVerified: Boolean(sessionUser.emailVerified),
        subscriptionStatus: sessionUser.subscriptionStatus ?? null,
        subscriptionCurrentPeriodEnd: sessionUser.subscriptionCurrentPeriodEnd ?? null,
      }),
    };
  },

  async logout(refreshCookieToken: string | undefined, res: Response): Promise<void> {
    if (refreshCookieToken) {
      const tokenHash = hashToken(refreshCookieToken);
      await refreshTokenRepository.revokeRefreshTokenByHash(tokenHash);
    }

    clearAuthCookies(res);
  },

  async verifyEmail(token: string | VerifyEmailTokenInput): Promise<VerificationResponse> {
    const tokenPayload: VerifyEmailTokenInput =
      typeof token === 'string'
        ? { token }
        : {
            token: token?.token,
            tokenHash: token?.tokenHash || token?.token_hash,
            type: token?.type,
            accessToken: token?.accessToken || token?.access_token,
          };

    if (tokenPayload?.accessToken) {
      return verifyEmailWithSupabaseSession({
        accessToken: tokenPayload.accessToken,
      });
    }

    if (tokenPayload?.tokenHash) {
      return verifyEmailWithSupabaseToken({
        tokenHash: tokenPayload.tokenHash,
        type: tokenPayload.type,
      });
    }

    throw new AppError(
      'Link de verificação inválido ou expirado. Solicite um novo e-mail.',
      400,
      'INVALID_VERIFICATION_TOKEN'
    );
  },

  async confirmSignup(
    res: Response,
    { accessToken }: { accessToken: string }
  ): Promise<Record<string, unknown>> {
    const identity = await supabaseAuthService.getVerifiedIdentityFromAccessToken(accessToken);

    if (!identity.emailVerified) {
      throw new AppError(
        'Conta não verificada. Verifique seu e-mail antes de continuar para o pagamento.',
        403,
        'EMAIL_NOT_VERIFIED'
      );
    }

    let confirmation: ReconcileSummary | null = null;

    try {
      const supabaseUser: Record<string, unknown> = identity.user
        ? (identity.user as unknown as Record<string, unknown>)
        : {
            id: identity.userId,
            email: identity.email,
            email_confirmed_at: identity.verifiedAt,
            confirmed_at: identity.verifiedAt,
          };

      confirmation = await reconcileSupabaseConfirmedUser({
        email: identity.email,
        supabaseUser,
        reason: 'confirm_signup_payment_onboarding',
      });
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      if (err.code === '23505') {
        throw new ConflictError('Email já cadastrado');
      }

      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error, email: identity.email }, 'Erro ao sincronizar cadastro confirmado');
      throw new AppError('Não foi possível finalizar o cadastro. Tente novamente.', 500, 'CONFIRM_SIGNUP_ERROR');
    }

    const session = await createInternalSessionForConfirmedUser(res, {
      email: identity.email,
      supabaseUserId: identity.userId,
    });

    const desiredPlan = confirmation?.desiredPlan || session.desiredPlan || DEFAULT_PLAN;
    const subscriptionStatus = session.subscriptionStatus || confirmation?.subscriptionStatus || 'incomplete';
    const paymentRequired = !['active', 'trialing'].includes(subscriptionStatus);

    logger.info(
      {
        email: identity.email,
        barbershopId: session.barbershopId,
        desiredPlan,
        subscriptionStatus,
        paymentRequired,
        checkoutCreated: false,
        paymentProvider: null,
        reason: 'email_confirmed_payment_required',
      },
      'Cadastro confirmado e sessão interna criada para pagamento'
    );

    return {
      ...buildVerificationResponse({
        email: identity.email,
        emailVerifiedAt: identity.verifiedAt || new Date().toISOString(),
        confirmation: {
          ...confirmation,
          barbershopId: session.barbershopId,
          desiredPlan,
          subscriptionStatus,
          paymentRequired,
        } as ReconcileSummary,
      }),
      ...session,
      desiredPlan,
      subscriptionStatus,
      paymentRequired,
    };
  },

  async resendVerificationEmail(
    email: string,
    emailRedirectTo: string | null = null
  ): Promise<{ message: string }> {
    const normalizedEmail = normalizeEmail(email);
    const safeResponse = buildResendVerificationResponse();

    const mode = getAuthProviderMode();
    logger.info(
      {
        mode,
        email: normalizedEmail,
      },
      'Reenvio de verificacao solicitado'
    );

    const [pendingRegistration, user] = await Promise.all([
      authRepository.findPendingRegistrationByEmail(normalizedEmail),
      authRepository.findUserByEmail(normalizedEmail),
    ]);

    const pendingReg = pendingRegistration as Record<string, unknown> | null;
    const userRow = user as Record<string, unknown> | null;

    if (!pendingReg && (!userRow || userRow.email_verified)) {
      logger.info(
        {
          mode,
          email: normalizedEmail,
          userFound: Boolean(userRow),
          alreadyVerified: Boolean(userRow?.email_verified),
        },
        'Reenvio de verificação tratado sem envio'
      );
      return safeResponse;
    }

    try {
      const supabaseUser = await supabaseAuthService.getUserByEmail(normalizedEmail);

      if (supabaseUser?.emailVerified) {
        logger.info(
          {
            mode,
            email: normalizedEmail,
            userId: userRow?.id || null,
            pendingRegistrationId: pendingReg?.id || null,
            supabaseUserId: supabaseUser.id,
            supabaseEmailConfirmed: true,
            localUserFound: Boolean(userRow),
            pendingRegistrationFound: Boolean(pendingReg),
            classification: 'already_confirmed',
            accepted: false,
            deliveryConfirmed: false,
            reason: 'USER_ALREADY_CONFIRMED_IN_SUPABASE',
          },
          'Reenvio de verificacao ignorado para usuário já confirmado no Supabase'
        );

        await reconcileSupabaseConfirmedUser({
          email: normalizedEmail,
          supabaseUser: supabaseUser as unknown as Record<string, unknown>,
          reason: 'resend_already_confirmed',
        });

        return safeResponse;
      }

      const resendResult = await supabaseAuthService.resendVerificationEmail(
        normalizedEmail,
        emailRedirectTo
      );

      logger.info(
        {
          mode,
          email: normalizedEmail,
          userId: userRow?.id || null,
          pendingRegistrationId: pendingReg?.id || null,
          supabaseUserId: supabaseUser?.id || pendingReg?.supabase_user_id || null,
          supabaseEmailConfirmed: Boolean(supabaseUser?.emailVerified),
          redirectTo: resendResult?.redirectTo || null,
          accepted: resendResult?.accepted === true,
          deliveryConfirmed: resendResult?.deliveryConfirmed === true,
          classification: resendResult?.classification || 'ambiguous',
          resendSummary: resendResult?.summary || null,
          status: 'success',
        },
        'Reenvio de verificacao concluido no Supabase'
      );
    } catch (error: unknown) {
      logger.error(
        {
          err: error,
          mode,
          email: normalizedEmail,
          userId: userRow?.id || null,
          pendingRegistrationId: pendingReg?.id || null,
          status: 'error',
        },
        'Falha ao reenviar verificacao no Supabase'
      );

      throw mapResendVerificationSupabaseError(error);
    }

    if (pendingReg) {
      try {
        await authRepository.touchPendingRegistrationVerificationSentAt(
          null,
          pendingReg.id as string
        );
      } catch (error: unknown) {
        logger.error(
          { err: error, email: normalizedEmail, pendingRegistrationId: pendingReg.id },
          'Erro ao atualizar pendência de verificação'
        );
      }
    }

    return safeResponse;
  },

  async getMe({
    userId: _userId,
    barbershopId,
    email,
    plan: _plan,
    role: _role,
  }: GetMeParams): Promise<{ user: Record<string, unknown> }> {
    const user = await authRepository.findUserByEmail(email) as Record<string, unknown> | null;

    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado');
    }

    const normalizedRole = normalizeRole(user.role as string);

    return {
      user: {
        barbershopId: barbershopId || (user.barbershop_id as string) || null,
        email: user.email as string,
        role: normalizedRole,
        barbershopName: (user.barbershop_name as string) || null,
        plan: user.plan as string,
        emailVerified: Boolean(user.email_verified),
        subscriptionStatus: (user.subscription_status as string) || null,
        subscriptionCurrentPeriodEnd: (user.subscription_current_period_end as string) || null,
      },
    };
  },
};
