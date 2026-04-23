import { barbershopSettingsService } from '../services/barbershopSettingsService.js';
import { authService } from '../services/authService.js';
import { sendSuccess } from '../utils/response.js';

export const getBarbershopSettings = async (req, res, next) => {
  try {
    const data = await barbershopSettingsService.getSettings(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBarbershopSettings = async (req, res, next) => {
  try {
    const data = await barbershopSettingsService.updateSettings(req.user.barbershopId, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getBarbershopProfile = async (req, res, next) => {
  try {
    const data = await barbershopSettingsService.getProfile(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBarbershopProfile = async (req, res, next) => {
  try {
    const data = await barbershopSettingsService.updateProfile(req.user.barbershopId, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAccountProfile = async (req, res, next) => {
  try {
    const data = await barbershopSettingsService.getAccountProfile(req.user);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateAccountProfile = async (req, res, next) => {
  try {
    const result = await barbershopSettingsService.updateAccountProfile(req.user, req.body);

    if (result?.sessionUser) {
      await authService.refreshAuthenticatedSession(res, result.sessionUser);
    }

    sendSuccess(res, result.profile);
  } catch (error) {
    next(error);
  }
};

export const updateAccountPassword = async (req, res, next) => {
  try {
    const result = await barbershopSettingsService.updatePassword(req.user, req.body);

    if (result?.sessionUser) {
      await authService.refreshAuthenticatedSession(res, result.sessionUser);
    }

    sendSuccess(res, { message: result.message });
  } catch (error) {
    next(error);
  }
};
