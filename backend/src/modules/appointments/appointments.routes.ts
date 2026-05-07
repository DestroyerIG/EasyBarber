import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import {
  CreateAppointmentSchema,
  UpdateAppointmentSchema,
  UpdateStatusSchema,
  GetAppointmentsQuerySchema,
  GetAvailableSlotsQuerySchema,
} from './appointments.types.js';
import {
  getAppointments,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  getAvailableSlots,
} from './appointments.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('appointments')];

router.get('/',           ...guard, validate({ query: GetAppointmentsQuerySchema }), getAppointments);
router.get('/available-slots', ...guard, validate({ query: GetAvailableSlotsQuerySchema }), getAvailableSlots);
router.post('/',          ...guard, validate({ body: CreateAppointmentSchema }), createAppointment);
router.put('/:id',        ...guard, validate({ body: UpdateAppointmentSchema }), updateAppointment);
router.put('/:id/status', ...guard, validate({ body: UpdateStatusSchema }), updateAppointmentStatus);
router.delete('/:id',     ...guard, deleteAppointment);

export default router;
