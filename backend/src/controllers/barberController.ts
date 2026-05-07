import type { Request, Response, NextFunction } from 'express';
import { barberService } from '../services/barberService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getBarbers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barberService.getBarbers(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createBarber = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barberService.createBarber(req.user.barbershopId!, req.user.plan ?? '', req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBarber = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await barberService.updateBarber(req.params['id'] as string, req.user.barbershopId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteBarber = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await barberService.deleteBarber(req.params['id'] as string, req.user.barbershopId!);
    sendSuccess(res, { message: 'Barbeiro excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};
