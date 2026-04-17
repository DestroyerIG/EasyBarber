import { clientService } from '../services/clientService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { createClientSchema, updateClientSchema } from '../validators/schemas/index.js';

export { createClientSchema, updateClientSchema };

export const normalizeClientBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ])
    );

    if (
      (!req.body.phone || req.body.phone === '')
      && typeof req.body.whatsapp === 'string'
      && req.body.whatsapp !== ''
    ) {
      req.body.phone = req.body.whatsapp;
    }
  }

  next();
};

export const getClients = async (req, res, next) => {
  try {
    const result = await clientService.getAll(req.user.barbershopId, req.query);
    if (result.meta) {
      sendSuccess(res, result.data, 200, result.meta);
    } else {
      sendSuccess(res, result);
    }
  } catch (error) {
    next(error);
  }
};

export const createClient = async (req, res, next) => {
  try {
    const data = await clientService.create(req.user.barbershopId, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const data = await clientService.update(req.params.id, req.user.barbershopId, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getClientHistory = async (req, res, next) => {
  try {
    const data = await clientService.getHistory(req.user.barbershopId, req.params.id);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
