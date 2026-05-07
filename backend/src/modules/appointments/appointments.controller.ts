import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { appointmentsService } from './appointments.service.js';
import type { AppointmentStatus } from '../../types/domain.js';

export const getAppointments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await appointmentsService.getAll(req.user.barbershopId!, req.query as never);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await appointmentsService.create(req.user.barbershopId!, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateAppointmentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await appointmentsService.updateStatus(
      String(req.params['id']),
      req.user.barbershopId!,
      req.body.status as AppointmentStatus
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await appointmentsService.update(
      String(req.params['id']),
      req.user.barbershopId!,
      req.body
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await appointmentsService.delete(String(req.params['id']), req.user.barbershopId!);
    sendSuccess(res, { message: 'Agendamento cancelado com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const getAvailableSlots = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await appointmentsService.getAvailableSlots(
      req.user.barbershopId!,
      req.query as never
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
