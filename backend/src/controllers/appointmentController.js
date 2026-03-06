import { appointmentService } from '../services/appointmentService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { createAppointmentSchema, updateAppointmentSchema, updateStatusSchema } from '../validators/schemas/index.js';

export { createAppointmentSchema, updateAppointmentSchema, updateStatusSchema };

export const getAppointments = async (req, res, next) => {
  try {
    const data = await appointmentService.getAll(req.user.barbershopId, req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createAppointment = async (req, res, next) => {
  try {
    const data = await appointmentService.create(req.user.barbershopId, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateAppointmentStatus = async (req, res, next) => {
  try {
    const data = await appointmentService.updateStatus(req.params.id, req.user.barbershopId, req.body.status);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateAppointment = async (req, res, next) => {
  try {
    const data = await appointmentService.update(req.params.id, req.user.barbershopId, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteAppointment = async (req, res, next) => {
  try {
    await appointmentService.delete(req.params.id, req.user.barbershopId);
    sendSuccess(res, { message: 'Agendamento cancelado com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const getAvailableSlots = async (req, res, next) => {
  try {
    const data = await appointmentService.getAvailableSlots(req.user.barbershopId, req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
