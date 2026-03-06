import { authService } from '../services/authService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { registerSchema, loginSchema } from '../validators/schemas/index.js';

export { registerSchema, loginSchema };

export const register = async (req, res, next) => {
  try {
    const data = await authService.register(res, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const data = await authService.login(res, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const refreshAccessToken = async (req, res, next) => {
  try {
    const data = await authService.refresh(res, req.cookies?.refresh_token);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    await authService.logout(req.cookies?.refresh_token, res);
    sendSuccess(res, { message: 'Logout realizado com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const data = await authService.getMe(req.user);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
