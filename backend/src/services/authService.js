import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authRepository } from '../repositories/authRepository.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { normalizeRole } from '../utils/roles.js';
import { emailService } from './emailService.js';

const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'password1',
  'senha123', 'barbearia', 'barberpro', '123456789', '1234567890',
  'admin123', 'welcome', 'letmein', 'monkey', 'master', 'dragon',
]);

const DEFAULT_EMAIL_VERIFICATION_TTL_MINUTES = 60;

const resolveJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-secret';
  throw new AppError('JWT_SECRET não configurado', 500, 'JWT_SECRET_MISSING');
};

const generateAccessToken = (payload) => {
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: '15m' });
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const resolveEmailVerificationTtlMinutes = () => {
  const ttl = Number.parseInt(process.env.EMAIL_VERIFICATION_TTL_MINUTES || '', 10);

  if (!Number.isFinite(ttl) || ttl <= 0) {
    return DEFAULT_EMAIL_VERIFICATION_TTL_MINUTES;
  }

  return ttl;
};

const generateEmailVerificationToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + resolveEmailVerificationTtlMinutes() * 60 * 1000);

  return {
    token,
    tokenHash,
    expiresAt,
  };
};

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
  email,
  role,
  barbershopName,
  plan,
  emailVerified,
  subscriptionStatus,
  subscriptionCurrentPeriodEnd,
}) => ({
  email,
  role,
  barbershopName,
  plan,
  emailVerified,
  subscriptionStatus,
  subscriptionCurrentPeriodEnd,
});

export const authService = {
  isCommonPassword(password) {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  },

  async register(_res, {
    barbershopName,
    ownerName,
    email,
    whatsapp,
    password,
    desiredPlan,
  }) {
    const client = await authRepository.getClient();
    let transactionCommitted = false;

    try {
      await client.query('BEGIN');

      const plan = 'basico';
      const onboardingDesiredPlan = desiredPlan || plan;

      const barbershop = await authRepository.createBarbershop(client, {
        name: barbershopName,
        ownerName,
        email,
        whatsapp,
        plan,
        desiredPlan: onboardingDesiredPlan,
      });

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await authRepository.createUser(client, {
        barbershopId: barbershop.id,
        email,
        passwordHash,
        role: 'tenant_admin',
        emailVerified: false,
      });

      const { token: verificationToken, tokenHash, expiresAt } = generateEmailVerificationToken();

      await authRepository.setEmailVerificationToken(client, {
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      await client.query('COMMIT');
      transactionCommitted = true;

      let verificationEmailSent = true;

      try {
        const emailResult = await emailService.sendAccountVerificationEmail({
          to: email,
          token: verificationToken,
          barbershopName,
          ownerName,
        });

        verificationEmailSent = emailResult.delivered !== false;
      } catch (mailError) {
        verificationEmailSent = false;
        logger.error({ err: mailError, email, userId: user.id }, 'Falha ao enviar e-mail de verificação no cadastro');
      }

      logger.info(
        {
          barbershopId: barbershop.id,
          email,
          desiredPlan: onboardingDesiredPlan,
          verificationEmailSent,
        },
        'Nova barbearia registrada'
      );

      const normalizedRole = normalizeRole('tenant_admin');

      return {
        verificationRequired: true,
        verificationEmailSent,
        message: verificationEmailSent
          ? 'Cadastro realizado com sucesso. Verifique seu e-mail para ativar a conta.'
          : 'Cadastro realizado, mas não foi possível enviar o e-mail de verificação no momento. Solicite o reenvio para ativar a conta.',
        user: buildUserPayload({
          email,
          role: normalizedRole,
          barbershopName,
          plan,
          emailVerified: false,
          subscriptionStatus: 'active',
          subscriptionCurrentPeriodEnd: null,
        }),
        barbershop: {
          id: barbershop.id,
          name: barbershopName,
          plan,
          desiredPlan: onboardingDesiredPlan,
        },
      };
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

      logger.error({ err: error, email }, 'Erro ao registrar barbearia');
      throw new AppError('Erro ao registrar barbearia. Tente novamente.', 500, 'REGISTER_ERROR');
    } finally {
      client.release();
    }
  },

  async login(res, { email, password }) {
    const client = await authRepository.getClient();

    try {
      const user = await authRepository.findUserByEmail(email);

      if (!user) {
        logger.warn({ email }, 'Tentativa de login com email inexistente');
        throw new UnauthorizedError('Email ou senha incorretos');
      }

      const normalizedRole = normalizeRole(user.role);
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        logger.warn({ email, userId: user.id }, 'Tentativa de login com senha incorreta');
        throw new UnauthorizedError('Email ou senha incorretos');
      }

      if (!user.email_verified) {
        logger.warn({ email, userId: user.id }, 'Tentativa de login com e-mail não verificado');
        throw new AppError(
          'Conta não verificada. Verifique seu e-mail antes de fazer login.',
          403,
          'EMAIL_NOT_VERIFIED'
        );
      }

      await client.query('BEGIN');
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

      setAuthCookies(res, accessToken, refreshToken);

      logger.info({ userId: user.id, email }, 'Login realizado');

      return {
        token: accessToken,
        refreshToken,
        user: buildUserPayload({
          email: user.email,
          role: normalizedRole,
          barbershopName: user.barbershop_name,
          plan: user.plan,
          emailVerified: user.email_verified,
          subscriptionStatus: user.subscription_status,
          subscriptionCurrentPeriodEnd: user.subscription_current_period_end,
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
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

  async logout(refreshCookieToken, res) {
    if (refreshCookieToken) {
      const tokenHash = hashToken(refreshCookieToken);
      await authRepository.revokeRefreshTokenByHash(tokenHash);
    }

    clearAuthCookies(res);
  },

  async verifyEmail(token) {
    if (!token || typeof token !== 'string') {
      throw new AppError('Token de verificação inválido.', 400, 'INVALID_VERIFICATION_TOKEN');
    }

    const tokenHash = hashToken(token);
    const user = await authRepository.findUserByEmailVerificationTokenHash(tokenHash);

    if (!user) {
      throw new AppError(
        'Link de verificação inválido ou já utilizado. Solicite um novo e-mail.',
        400,
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    const providedHashBuffer = Buffer.from(tokenHash, 'hex');
    const storedHashBuffer = Buffer.from(user.email_verification_token_hash || '', 'hex');

    if (
      storedHashBuffer.length !== providedHashBuffer.length ||
      !crypto.timingSafeEqual(storedHashBuffer, providedHashBuffer)
    ) {
      throw new AppError('Link de verificação inválido.', 400, 'INVALID_VERIFICATION_TOKEN');
    }

    const expiresAt = user.email_verification_expires_at
      ? new Date(user.email_verification_expires_at)
      : null;

    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      const expiryClient = await authRepository.getClient();

      try {
        await expiryClient.query('BEGIN');
        await authRepository.clearEmailVerificationToken(expiryClient, user.id);
        await expiryClient.query('COMMIT');
      } catch (error) {
        await expiryClient.query('ROLLBACK');
        logger.error({ err: error, userId: user.id }, 'Erro ao invalidar token expirado de verificação de e-mail');
      } finally {
        expiryClient.release();
      }

      throw new AppError(
        'Link de verificação expirado. Solicite um novo e-mail de verificação.',
        400,
        'EXPIRED_VERIFICATION_TOKEN'
      );
    }

    const client = await authRepository.getClient();

    try {
      await client.query('BEGIN');
      const verifiedUser = await authRepository.markEmailAsVerified(client, user.id);
      await client.query('COMMIT');

      logger.info({ userId: user.id, email: user.email }, 'E-mail verificado com sucesso');

      return {
        message: 'E-mail verificado com sucesso. Você já pode fazer login.',
        user: {
          email: verifiedUser?.email || user.email,
          emailVerified: true,
          emailVerifiedAt: verifiedUser?.email_verified_at || new Date().toISOString(),
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, userId: user.id }, 'Erro ao confirmar verificação de e-mail');
      throw new AppError('Não foi possível confirmar o e-mail. Tente novamente.', 500, 'VERIFY_EMAIL_ERROR');
    } finally {
      client.release();
    }
  },

  async resendVerificationEmail(email) {
    const normalizedEmail = String(email || '').trim();
    const safeResponse = {
      message: 'Se existir uma conta pendente para este e-mail, enviaremos um novo link de verificação.',
    };

    const user = await authRepository.findUserByEmail(normalizedEmail);

    if (!user || user.email_verified) {
      logger.info(
        { email: normalizedEmail, userFound: Boolean(user), alreadyVerified: Boolean(user?.email_verified) },
        'Reenvio de verificação tratado sem envio'
      );
      return safeResponse;
    }

    const { token, tokenHash, expiresAt } = generateEmailVerificationToken();
    const client = await authRepository.getClient();

    try {
      await client.query('BEGIN');
      await authRepository.setEmailVerificationToken(client, {
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error, userId: user.id, email: normalizedEmail }, 'Erro ao gerar novo token de verificação');
      throw new AppError(
        'Não foi possível processar o reenvio do e-mail de verificação. Tente novamente.',
        500,
        'RESEND_VERIFICATION_ERROR'
      );
    } finally {
      client.release();
    }

    try {
      await emailService.sendAccountVerificationEmail({
        to: user.email,
        token,
        barbershopName: user.barbershop_name,
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id, email: user.email }, 'Falha ao reenviar e-mail de verificação');
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