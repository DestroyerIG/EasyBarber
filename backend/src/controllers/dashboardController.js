import { dashboardService } from '../services/dashboardService.js';
import { sendSuccess } from '../utils/response.js';

export const getDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboard(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
