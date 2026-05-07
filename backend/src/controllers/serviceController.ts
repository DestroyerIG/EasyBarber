import type { Request, Response, NextFunction } from 'express';
import { serviceService } from '../services/serviceService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getServices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await serviceService.getServices(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await serviceService.createService(req.user.barbershopId!, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await serviceService.updateService(req.params['id'] as string, req.user.barbershopId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await serviceService.deleteService(req.params['id'] as string, req.user.barbershopId!);
    sendSuccess(res, { message: 'Serviço excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};
