import { authService } from '../services/authService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  verifyEmailSessionSchema,
  resendVerificationSchema,
} from '../validators/schemas/index.js';

export {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  verifyEmailSessionSchema,
  resendVerificationSchema,
};

const resolveRefreshToken = (req) => {
  if (req.cookies?.refresh_token) {
    return req.cookies.refresh_token;
  }

  if (typeof req.body?.refreshToken === 'string') {
    return req.body.refreshToken;
  }

  return null;
};

export const register = async (req, res, next) => {
  try {
    const data = await authService.register(res, req.body);
    return sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const data = await authService.login(res, req.body);
    return sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const refreshAccessToken = async (req, res, next) => {
  try {
    const refreshToken = resolveRefreshToken(req);
    const data = await authService.refresh(res, refreshToken);
    return sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const refreshToken = resolveRefreshToken(req);
    await authService.logout(refreshToken, res);
    return sendSuccess(res, { message: 'Logout realizado com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const data = await authService.getMe(req.user);
    return sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const data = await authService.verifyEmail({
      token: req.query.token,
      tokenHash: req.query.tokenHash,
      type: req.query.type,
    });
    return sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const verifyEmailSession = async (req, res, next) => {
  try {
    const data = await authService.verifyEmail({
      accessToken: req.body.accessToken,
    });
    return sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const resendVerification = async (req, res, next) => {
  try {
    const data = await authService.resendVerificationEmail(req.body.email);
    return sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
