import { z } from 'zod';
import { uuid, dateYMD, timeHM } from './common.js';

export const createAppointmentSchema = z.object({
  clientId: uuid('cliente'),
  barberId: uuid('barbeiro'),
  serviceId: uuid('serviço'),
  date: dateYMD,
  time: timeHM,
});

export const updateAppointmentSchema = createAppointmentSchema;

export const updateStatusSchema = z.object({
  status: z.enum(['confirmado', 'concluido', 'cancelado'], { message: 'Status deve ser: confirmado, concluido ou cancelado' }),
});

export type CreateAppointment = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointment = z.infer<typeof updateAppointmentSchema>;
export type UpdateStatus = z.infer<typeof updateStatusSchema>;
