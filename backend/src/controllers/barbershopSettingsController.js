import { barbershopSettingsService } from '../services/barbershopSettingsService.js';
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
