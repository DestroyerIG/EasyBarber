import { barberService } from '../services/barberService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getBarbers = async (req, res, next) => {
  try {
    const data = await barberService.getBarbers(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createBarber = async (req, res, next) => {
  try {
    const data = await barberService.createBarber(req.user.barbershopId, req.user.plan, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBarber = async (req, res, next) => {
  try {
    const data = await barberService.updateBarber(req.params.id, req.user.barbershopId, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteBarber = async (req, res, next) => {
  try {
    await barberService.deleteBarber(req.params.id, req.user.barbershopId);
    sendSuccess(res, { message: 'Barbeiro excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};
