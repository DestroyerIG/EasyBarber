import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authRepository } from '../repositories/authRepository.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'password1',
  'senha123', 'barbearia', 'barberpro', '123456789', '1234567890',
  'admin123', 'welcome', 'letmein', 'monkey', 'master', 'dragon',
]);

const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = async (dbClient, userId) => {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await authRepository.saveRefreshToken(dbClient, { userId, tokenHash, expiresAt });
  return token;
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api',
  });
};

export const authService = {
  isCommonPassword(password) {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  },

  async register(res, { barbershopName, ownerName, email, whatsapp, password }) {
    const client = await authRepository.getClient();

    try {
      await client.query('BEGIN');

      const plan = 'basico';
      const barbershop = await authRepository.createBarbershop(client, {
        name: barbershopName, ownerName, email, whatsapp, plan,
      });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await authRepository.createUser(client, {
        barbershopId: barbershop.id, email, passwordHash, role: 'admin',
      });

      const accessToken = generateAccessToken({
        userId: user.id,
        barbershopId: barbershop.id,
        email,
        plan,
        role: 'admin',
      });

      const refreshToken = await generateRefreshToken(client, user.id);
      await client.query('COMMIT');

      setAuthCookies(res, accessToken, refreshToken);
      logger.info({ barbershopId: barbershop.id, email }, 'Nova barbearia registrada');

      return {
        user: { email, role: 'admin' },
        barbershop: { id: barbershop.id, name: barbershopName, plan },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        throw new ConflictError('Email já cadastrado');
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

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        logger.warn({ email, userId: user.id }, 'Tentativa de login com senha incorreta');
        throw new UnauthorizedError('Email ou senha incorretos');
      }

      await authRepository.revokeUserRefreshTokens(client, user.id);

      const accessToken = generateAccessToken({
        userId: user.id,
        barbershopId: user.barbershop_id,
        email: user.email,
        plan: user.plan,
        role: user.role,
      });

      const refreshToken = await generateRefreshToken(client, user.id);
      setAuthCookies(res, accessToken, refreshToken);

      logger.info({ userId: user.id, email }, 'Login realizado');

      return {
        user: {
          email: user.email,
          role: user.role,
          barbershopName: user.barbershop_name,
          plan: user.plan,
        },
      };
    } finally {
      client.release();
    }
  },

  async refresh(res, refreshCookieToken) {
    if (!refreshCookieToken) {
      throw new UnauthorizedError('Refresh token não fornecido');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshCookieToken).digest('hex');
    const row = await authRepository.findValidRefreshToken(tokenHash);

    if (!row) {
      throw new UnauthorizedError('Refresh token inválido ou expirado');
    }

    const client = await authRepository.getClient();
    try {
      await client.query('BEGIN');
      await authRepository.revokeRefreshTokenById(client, row.id);
      const newRefreshToken = await generateRefreshToken(client, row.user_id);
      await client.query('COMMIT');

      const accessToken = generateAccessToken({
        userId: row.user_id,
        barbershopId: row.barbershop_id,
        email: row.email,
        plan: row.plan,
        role: row.role,
      });

      setAuthCookies(res, accessToken, newRefreshToken);

      return {
        user: {
          email: row.email,
          role: row.role,
          plan: row.plan,
        },
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
      const tokenHash = crypto.createHash('sha256').update(refreshCookieToken).digest('hex');
      await authRepository.revokeRefreshTokenByHash(tokenHash);
    }

    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api' });
  },

  async getMe({ userId, barbershopId, email, plan, role }) {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado');
    }

    return {
      user: {
        email: user.email,
        role: user.role,
        barbershopName: user.barbershop_name,
        plan: user.plan,
      },
    };
  },
};
