import type { Request, Response, NextFunction } from 'express';
import { barbershopSettingsService } from '../services/barbershopSettingsService.js';
import { authService } from '../services/authService.js';
import { sendSuccess } from '../utils/response.js';
import logger from '../utils/logger.js';

export const getBarbershopSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barbershopSettingsService.getSettings(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBarbershopSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barbershopSettingsService.updateSettings(req.user.barbershopId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getBarbershopProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barbershopSettingsService.getProfile(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBarbershopProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barbershopSettingsService.updateProfile(req.user.barbershopId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAccountProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barbershopSettingsService.getAccountProfile(req.user as { barbershopId: string; userId: string; role: string });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateAccountProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info(
      {
        operation: 'updateAccountProfile',
        requestId: req.requestId,
        path: req.path,
        method: req.method,
        userId: req.user?.userId || null,
        barbershopId: req.user?.barbershopId || null,
        role: req.user?.role || null,
      },
      'Recebida requisicao para atualizar dados cadastrais'
    );

    const result = await barbershopSettingsService.updateAccountProfile(req.user as { barbershopId: string; userId: string; role: string }, req.body);

    if (result?.sessionUser) {
      await authService.refreshAuthenticatedSession(res, result.sessionUser as Parameters<typeof authService.refreshAuthenticatedSession>[1]);
    }

    sendSuccess(res, result.profile);
  } catch (error) {
    next(error);
  }
};

export const updateAccountPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await barbershopSettingsService.updatePassword(req.user as { barbershopId: string; userId: string; role: string }, req.body);

    if (result?.sessionUser) {
      await authService.refreshAuthenticatedSession(res, result.sessionUser as Parameters<typeof authService.refreshAuthenticatedSession>[1]);
    }

    sendSuccess(res, { message: result.message });
  } catch (error) {
    next(error);
  }
};
