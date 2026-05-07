import type { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboardService.js';
import { sendSuccess } from '../utils/response.js';

export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await dashboardService.getDashboard(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
