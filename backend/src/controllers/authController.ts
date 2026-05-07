import type { Request, Response, NextFunction } from 'express';
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

const resolveRefreshToken = (req: Request): string | null => {
  if (req.cookies?.refresh_token) {
    return req.cookies.refresh_token as string;
  }

  if (typeof req.body?.refreshToken === 'string') {
    return req.body.refreshToken as string;
  }

  return null;
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.register(res, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.login(res, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const refreshAccessToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = resolveRefreshToken(req);
    const data = await authService.refresh(res, refreshToken ?? undefined);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = resolveRefreshToken(req);
    await authService.logout(refreshToken ?? undefined, res);
    sendSuccess(res, { message: 'Logout realizado com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.getMe(req.user as { userId: string; barbershopId: string | null; email: string; plan: string; role: string });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.verifyEmail({
      token: req.query['token'] as string | undefined,
      tokenHash: req.query['tokenHash'] as string | undefined,
      type: req.query['type'] as string | undefined,
    });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const verifyEmailSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.verifyEmail({
      accessToken: req.body.accessToken as string | undefined,
    });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const confirmSignup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.confirmSignup(res, {
      accessToken: (req.body.accessToken as string | undefined) ?? '',
    });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.resendVerificationEmail(
      req.body.email as string,
      req.body.emailRedirectTo as string | undefined
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
