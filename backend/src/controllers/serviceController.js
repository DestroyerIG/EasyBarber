import { serviceService } from '../services/serviceService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getServices = async (req, res, next) => {
  try {
    const data = await serviceService.getServices(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createService = async (req, res, next) => {
  try {
    const data = await serviceService.createService(req.user.barbershopId, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateService = async (req, res, next) => {
  try {
    const data = await serviceService.updateService(req.params.id, req.user.barbershopId, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteService = async (req, res, next) => {
  try {
    await serviceService.deleteService(req.params.id, req.user.barbershopId);
    sendSuccess(res, { message: 'Serviço excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};
