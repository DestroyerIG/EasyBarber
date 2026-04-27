import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authRepository } from '../repositories/authRepository.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { normalizeRole } from '../utils/roles.js';
import {
  getAuthProviderMode,
} from '../config/authProviderMode.js';
import { supabaseAuthService } from './supabaseAuthService.js';

const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'password1',
  'senha123', 'barbearia', 'barberpro', '123456789', '1234567890',
  'admin123', 'welcome', 'letmein', 'monkey', 'master', 'dragon',
]);

const DEFAULT_PLAN = 'basico';
const PASSWORD_HASH_PLACEHOLDER_PREFIX = 'supabase:';

const resolveJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-secret';
  throw new AppError('JWT_SECRET não configurado', 500, 'JWT_SECRET_MISSING');
};

const generateAccessToken = (payload) => {
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: '15m' });
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generateSupabasePasswordHashPlaceholder = () => {
  return `${PASSWORD_HASH_PLACEHOLDER_PREFIX}${crypto.randomBytes(64).toString('hex').slice(0, 51)}`;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const generateRefreshToken = async (dbClient, userId) => {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await authRepository.saveRefreshToken(dbClient, { userId, tokenHash, expiresAt });
  return token;
};

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = isProduction ? 'none' : 'lax';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;

  const shared = {
    httpOnly: true,
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

const setAuthCookies = (res, accessToken, refreshToken) => {
  const cookieOptions = getCookieOptions();

  res.cookie('access_token', accessToken, cookieOptions.access);
  res.cookie('refresh_token', refreshToken, cookieOptions.refresh);
};

const clearAuthCookies = (res) => {
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
}) => ({
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
}) => ({
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

const buildVerificationResponse = ({ email, emailVerifiedAt, confirmation = null }) => ({
  message: 'E-mail confirmado com sucesso',
  user: {
    email,
    emailVerified: true,
    emailVerifiedAt,
  },
  ...(confirmation ? { confirmation } : {}),
});

const buildResendVerificationResponse = () => ({
  message: 'Se existir uma conta pendente para este e-mail, um novo link de verificação foi enviado.',
});

const isSupabaseUserConfirmed = (supabaseUser) => Boolean(
  supabaseUser?.email_confirmed_at ||
  supabaseUser?.confirmed_at
);

const resolveSupabaseConfirmedAt = (supabaseUser, fallbackValue = null) => {
  return supabaseUser?.email_confirmed_at || supabaseUser?.confirmed_at || fallbackValue || null;
};

const mapResendVerificationSupabaseError = (error) => {
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

const registerWithSupabasePrimaryFlow = async ({
  barbershopName,
  ownerName,
  email,
  whatsapp,
  cpfCnpj,
  password,
  desiredPlan,
}) => {
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

  let supabaseUserId = null;
  let verificationEmailSent = false;
  let existingConfirmedSupabaseUser = null;

  try {
    currentStage = 'supabase_signup';

    const signUpResult = await supabaseAuthService.signUpForEmailVerification(normalizedEmail, password);
    supabaseUserId = signUpResult.userId;
    verificationEmailSent = signUpResult.verificationEmailSent !== false;
  } catch (error) {
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
        existingConfirmedSupabaseUser = existingSupabaseUser;
        verificationEmailSent = false;
      } else {
        currentStage = 'supabase_resend_after_user_exists';
        await supabaseAuthService.resendVerificationEmail(normalizedEmail);
        verificationEmailSent = true;
      }
    } catch (resendError) {
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
  const client = await authRepository.getClient();
  let transactionCommitted = false;
  let pendingRegistration = null;

  try {
    currentStage = 'persist_pending_registration';
    await client.query('BEGIN');

    pendingRegistration = await authRepository.upsertPendingRegistration(client, {
      email: normalizedEmail,
      supabaseUserId,
      barbershopName,
      ownerName,
      whatsapp,
      cpfCnpj,
      desiredPlan: onboardingDesiredPlan,
      passwordHash,
    });

    await client.query('COMMIT');
    transactionCommitted = true;
  } catch (error) {
    if (!transactionCommitted) {
      await client.query('ROLLBACK');
    }

    if (error.code === '23505') {
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
  } finally {
    client.release();
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
    barbershopId: pendingRegistration?.id || null,
    message: verificationEmailSent
      ? 'Cadastro realizado com sucesso. Verifique seu e-mail para ativar a conta.'
      : 'Cadastro iniciado, mas não foi possível enviar o e-mail de verificação no momento. Solicite o reenvio para ativar a conta.',
  });
};

const reconcileSupabaseConfirmedUser = async ({
  email,
  supabaseUser,
  reason = 'unspecified',
  client: providedClient = null,
}) => {
  const normalizedEmail = normalizeEmail(email || supabaseUser?.email || '');
  const supabaseUserId = supabaseUser?.id || null;
  const supabaseEmailConfirmed = isSupabaseUserConfirmed(supabaseUser);
  const emailVerifiedAt = resolveSupabaseConfirmedAt(supabaseUser, new Date().toISOString());
  const summary = {
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

  const client = providedClient || await authRepository.getClient();
  const ownsTransaction = !providedClient;
  let transactionCommitted = false;

  try {
    if (ownsTransaction) {
      await client.query('BEGIN');
    }

    const [userBySupabaseId, userByEmail, pendingRegistration] = await Promise.all([
      authRepository.findUserBySupabaseUserIdForUpdate(client, supabaseUserId),
      authRepository.findUserByEmailForSync(client, normalizedEmail),
      authRepository.findPendingRegistrationForReconciliation(client, {
        email: normalizedEmail,
        supabaseUserId,
      }),
    ]);

    summary.pendingRegistrationFound = Boolean(pendingRegistration);

    if (userBySupabaseId && userByEmail && userBySupabaseId.id !== userByEmail.id) {
      logger.error(
        {
          ...summary,
          localUserBySupabaseId: userBySupabaseId.id,
          localUserByEmail: userByEmail.id,
          reason: 'local_user_conflict',
        },
        'Reconciliação Supabase encontrou conflito de usuários locais'
      );

      throw new ConflictError('Conflito de identidade local detectado para este e-mail.');
    }

    let localUser = userBySupabaseId || userByEmail || null;
    summary.localUserFound = Boolean(localUser);

    let barbershopId = localUser?.barbershop_id || null;

    if (!barbershopId && pendingRegistration) {
      const reusableBarbershop = await authRepository.findBarbershopByEmailForUpdate(
        client,
        pendingRegistration.email
      );

      if (reusableBarbershop) {
        barbershopId = reusableBarbershop.id;
        summary.barbershopReused = true;
      } else {
        const createdBarbershop = await authRepository.createBarbershop(client, {
          name: pendingRegistration.barbershop_name,
          ownerName: pendingRegistration.owner_name,
          email: pendingRegistration.email,
          whatsapp: pendingRegistration.whatsapp,
          cpfCnpj: pendingRegistration.cpf_cnpj,
          plan: DEFAULT_PLAN,
          desiredPlan: pendingRegistration.desired_plan || DEFAULT_PLAN,
        });

        barbershopId = createdBarbershop.id;
        summary.barbershopCreated = true;
      }
    }

    if (!localUser && pendingRegistration && barbershopId) {
      localUser = await authRepository.upsertTenantAdminUser(client, {
        barbershopId,
        email: pendingRegistration.email,
        passwordHash: pendingRegistration.password_hash,
        supabaseUserId,
        emailVerified: true,
      });
      summary.localUserCreated = Boolean(localUser);
      summary.localUserFound = Boolean(localUser);
    } else if (localUser) {
      const syncedUser = await authRepository.updateUserIdentitySync(client, {
        userId: localUser.id,
        supabaseUserId,
        authProvider: 'supabase',
      });

      if (syncedUser) {
        summary.localUserUpdated = true;
      }
    }

    if (localUser?.id) {
      const verifiedUser = await authRepository.markEmailAsVerifiedWithSupabaseIdentity(client, {
        userId: localUser.id,
        supabaseUserId,
        emailVerifiedAt,
        authProvider: 'supabase',
      });

      summary.localUserUpdated = summary.localUserUpdated || Boolean(verifiedUser);
    }

    if (pendingRegistration?.id) {
      const completedPending = await authRepository.completePendingRegistration(client, {
        pendingRegistrationId: pendingRegistration.id,
        confirmedAt: emailVerifiedAt,
        supabaseUserId,
      });

      summary.pendingRegistrationCompleted = Boolean(completedPending);
    }

    if (ownsTransaction) {
      await client.query('COMMIT');
      transactionCommitted = true;
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
  } catch (error) {
    if (ownsTransaction && !transactionCommitted) {
      await client.query('ROLLBACK');
    }

    logger.error(
      {
        err: error,
        ...summary,
      },
      'Reconciliação Supabase falhou'
    );
    throw error;
  } finally {
    if (ownsTransaction) {
      client.release();
    }
  }
};

const verifyEmailWithSupabaseToken = async ({ tokenHash, type }) => {
  const verification = await supabaseAuthService.verifyEmailToken({ tokenHash, type });
  const supabaseUser = verification.user || {
    id: verification.userId,
    email: verification.email,
    email_confirmed_at: verification.verifiedAt,
    confirmed_at: verification.verifiedAt,
  };
  let confirmation = null;

  try {
    confirmation = await reconcileSupabaseConfirmedUser({
      email: verification.email,
      supabaseUser,
      reason: 'verify_email_token',
    });
  } catch (error) {
    if (error.code === '23505') {
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

const verifyEmailWithSupabaseSession = async ({ accessToken }) => {
  const identity = await supabaseAuthService.getVerifiedIdentityFromAccessToken(accessToken);

  if (!identity.emailVerified) {
    throw new AppError(
      'Conta não verificada. Verifique seu e-mail antes de fazer login.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }
  let confirmation = null;

  try {
    confirmation = await reconcileSupabaseConfirmedUser({
      email: identity.email,
      supabaseUser: identity.user || {
        id: identity.userId,
        email: identity.email,
        email_confirmed_at: identity.verifiedAt,
        confirmed_at: identity.verifiedAt,
      },
      reason: 'verify_email_session',
    });
  } catch (error) {
    if (error.code === '23505') {
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

export const authService = {
  isCommonPassword(password) {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  },

  async register(_res, {
    barbershopName,
    ownerName,
    email,
    whatsapp,
    cpfCnpj,
    password,
    desiredPlan,
  }) {
    return registerWithSupabasePrimaryFlow({
      barbershopName,
      ownerName,
      email,
      whatsapp,
      cpfCnpj,
      password,
      desiredPlan,
    });
  },

  async login(res, { email, password }) {
    const client = await authRepository.getClient();
    const normalizedEmail = normalizeEmail(email);
    let refreshTransactionStarted = false;

    try {
      let supabaseIdentity;

      try {
        supabaseIdentity = await supabaseAuthService.signInWithPassword(normalizedEmail, password);
      } catch (error) {
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

      let user = await authRepository.findUserBySupabaseUserId(supabaseIdentity.userId);

      if (!user) {
        user = await authRepository.findUserByEmailIncludingBlocked(normalizedEmail);
      }

      if (!user) {
        await reconcileSupabaseConfirmedUser({
          email: normalizedEmail,
          supabaseUser: supabaseIdentity.user || {
            id: supabaseIdentity.userId,
            email: supabaseIdentity.email,
            email_confirmed_at: supabaseIdentity.emailVerifiedAt,
            confirmed_at: supabaseIdentity.emailVerifiedAt,
          },
          reason: 'login_without_local_user',
        });

        user = await authRepository.findUserBySupabaseUserId(supabaseIdentity.userId)
          || await authRepository.findUserByEmailIncludingBlocked(normalizedEmail);
      }

      if (!user) {
        logger.warn(
          {
            email: normalizedEmail,
            authMode: getAuthProviderMode(),
            supabaseUserId: supabaseIdentity.userId,
            reason: 'local_user_not_found',
          },
          'Login negado: usuário local não encontrado após autenticação Supabase'
        );
        throw new UnauthorizedError('Email ou senha incorretos');
      }

      const authProvider = 'supabase';
      const normalizedRole = normalizeRole(user.role);
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

      await authRepository.updateUserIdentitySync(client, {
        userId: user.id,
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
        await reconcileSupabaseConfirmedUser({
          email: normalizedEmail,
          supabaseUser: supabaseIdentity.user || {
            id: supabaseIdentity.userId,
            email: supabaseIdentity.email,
            email_confirmed_at: supabaseIdentity.emailVerifiedAt,
            confirmed_at: supabaseIdentity.emailVerifiedAt,
          },
          reason: 'login_confirmed_user',
        });

        const refreshedUser = await authRepository.findUserBySupabaseUserId(supabaseIdentity.userId)
          || await authRepository.findUserByEmailIncludingBlocked(normalizedEmail);
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

      await client.query('BEGIN');
      refreshTransactionStarted = true;
      await authRepository.revokeUserRefreshTokens(client, user.id);

      const accessToken = generateAccessToken({
        userId: user.id,
        barbershopId: user.barbershop_id,
        email: user.email,
        plan: user.plan,
        role: normalizedRole,
        subscriptionStatus: user.subscription_status,
        subscriptionCurrentPeriodEnd: user.subscription_current_period_end,
      });

      const refreshToken = await generateRefreshToken(client, user.id);

      await client.query('COMMIT');
      refreshTransactionStarted = false;

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
          barbershopId: user.barbershop_id,
          email: user.email,
          role: normalizedRole,
          barbershopName: user.barbershop_name,
          plan: user.plan,
          emailVerified: resolvedEmailVerified,
          subscriptionStatus: user.subscription_status,
          subscriptionCurrentPeriodEnd: user.subscription_current_period_end,
        }),
      };
    } catch (error) {
      if (refreshTransactionStarted) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  },

  async refresh(res, refreshCookieToken) {
    if (!refreshCookieToken) {
      throw new UnauthorizedError('Refresh token não fornecido');
    }

    const tokenHash = hashToken(refreshCookieToken);
    const row = await authRepository.findValidRefreshToken(tokenHash);

    if (!row) {
      throw new UnauthorizedError('Refresh token inválido ou expirado');
    }

    const client = await authRepository.getClient();

    try {
      const normalizedRole = normalizeRole(row.role);

      await client.query('BEGIN');
      await authRepository.revokeRefreshTokenById(client, row.id);

      const newRefreshToken = await generateRefreshToken(client, row.user_id);

      const accessToken = generateAccessToken({
        userId: row.user_id,
        barbershopId: row.barbershop_id,
        email: row.email,
        plan: row.plan,
        role: normalizedRole,
        subscriptionStatus: row.subscription_status,
        subscriptionCurrentPeriodEnd: row.subscription_current_period_end,
      });

      await client.query('COMMIT');

      setAuthCookies(res, accessToken, newRefreshToken);

      return {
        token: accessToken,
        refreshToken: newRefreshToken,
        user: buildUserPayload({
          barbershopId: row.barbershop_id,
          email: row.email,
          role: normalizedRole,
          barbershopName: row.barbershop_name,
          plan: row.plan,
          emailVerified: row.email_verified,
          subscriptionStatus: row.subscription_status,
          subscriptionCurrentPeriodEnd: row.subscription_current_period_end,
        }),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async refreshAuthenticatedSession(res, sessionUser) {
    const client = await authRepository.getClient();

    try {
      await client.query('BEGIN');
      await authRepository.revokeUserRefreshTokens(client, sessionUser.userId);

      const normalizedRole = normalizeRole(sessionUser.role);
      const accessToken = generateAccessToken({
        userId: sessionUser.userId,
        barbershopId: sessionUser.barbershopId,
        email: sessionUser.email,
        plan: sessionUser.plan,
        role: normalizedRole,
        subscriptionStatus: sessionUser.subscriptionStatus,
        subscriptionCurrentPeriodEnd: sessionUser.subscriptionCurrentPeriodEnd,
      });

      const refreshToken = await generateRefreshToken(client, sessionUser.userId);

      await client.query('COMMIT');
      setAuthCookies(res, accessToken, refreshToken);

      return {
        token: accessToken,
        refreshToken,
        user: buildUserPayload({
          barbershopId: sessionUser.barbershopId,
          email: sessionUser.email,
          role: normalizedRole,
          barbershopName: sessionUser.barbershopName,
          plan: sessionUser.plan,
          emailVerified: sessionUser.emailVerified,
          subscriptionStatus: sessionUser.subscriptionStatus,
          subscriptionCurrentPeriodEnd: sessionUser.subscriptionCurrentPeriodEnd,
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async logout(refreshCookieToken, res) {
    if (refreshCookieToken) {
      const tokenHash = hashToken(refreshCookieToken);
      await authRepository.revokeRefreshTokenByHash(tokenHash);
    }

    clearAuthCookies(res);
  },

  async verifyEmail(token) {
    const tokenPayload = typeof token === 'string'
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

    throw new AppError('Link de verificação inválido ou expirado. Solicite um novo e-mail.', 400, 'INVALID_VERIFICATION_TOKEN');
  },

  async resendVerificationEmail(email) {
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

    if (!pendingRegistration && (!user || user.email_verified)) {
      logger.info(
        {
          mode,
          email: normalizedEmail,
          userFound: Boolean(user),
          alreadyVerified: Boolean(user?.email_verified),
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
            userId: user?.id || null,
            pendingRegistrationId: pendingRegistration?.id || null,
            supabaseUserId: supabaseUser.id,
            supabaseEmailConfirmed: true,
            localUserFound: Boolean(user),
            pendingRegistrationFound: Boolean(pendingRegistration),
            classification: 'already_confirmed',
            accepted: false,
            deliveryConfirmed: false,
            reason: 'USER_ALREADY_CONFIRMED_IN_SUPABASE',
          },
          'Reenvio de verificacao ignorado para usuário já confirmado no Supabase'
        );

        await reconcileSupabaseConfirmedUser({
          email: normalizedEmail,
          supabaseUser,
          reason: 'resend_already_confirmed',
        });

        return safeResponse;
      }

      const resendResult = await supabaseAuthService.resendVerificationEmail(normalizedEmail);

      logger.info(
        {
          mode,
          email: normalizedEmail,
          userId: user?.id || null,
          pendingRegistrationId: pendingRegistration?.id || null,
          supabaseUserId: supabaseUser?.id || pendingRegistration?.supabase_user_id || null,
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
    } catch (error) {
      logger.error(
        {
          err: error,
          mode,
          email: normalizedEmail,
          userId: user?.id || null,
          pendingRegistrationId: pendingRegistration?.id || null,
          status: 'error',
        },
        'Falha ao reenviar verificacao no Supabase'
      );

      throw mapResendVerificationSupabaseError(error);
    }

    if (pendingRegistration) {
      const pendingClient = await authRepository.getClient();

      try {
        await pendingClient.query('BEGIN');
        await authRepository.touchPendingRegistrationVerificationSentAt(
          pendingClient,
          pendingRegistration.id
        );
        await pendingClient.query('COMMIT');
      } catch (error) {
        await pendingClient.query('ROLLBACK');
        logger.error(
          { err: error, email: normalizedEmail, pendingRegistrationId: pendingRegistration.id },
          'Erro ao atualizar pendência de verificação'
        );
      } finally {
        pendingClient.release();
      }
    }

    return safeResponse;
  },

  async getMe({ userId, barbershopId, email, plan, role }) {
    const user = await authRepository.findUserByEmail(email);

    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado');
    }

    const normalizedRole = normalizeRole(user.role);

    return {
      user: {
        barbershopId: barbershopId || user.barbershop_id || null,
        email: user.email,
        role: normalizedRole,
        barbershopName: user.barbershop_name,
        plan: user.plan,
        emailVerified: user.email_verified,
        subscriptionStatus: user.subscription_status,
        subscriptionCurrentPeriodEnd: user.subscription_current_period_end,
      },
    };
  },
};
