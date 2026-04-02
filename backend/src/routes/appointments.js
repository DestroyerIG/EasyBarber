import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { validate } from '../middleware/validate.js';
import {
  getAppointments,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  getAvailableSlots,
  createAppointmentSchema,
  updateAppointmentSchema,
  updateStatusSchema
} from '../controllers/appointmentController.js';

const router = express.Router();

router.get('/', authMiddleware, requireTenantRoles, requireFeature('appointments'), getAppointments);
router.get('/available-slots', authMiddleware, requireTenantRoles, requireFeature('appointments'), getAvailableSlots);
router.post('/', authMiddleware, requireTenantRoles, requireFeature('appointments'), validate({ body: createAppointmentSchema }), createAppointment);
router.put('/:id', authMiddleware, requireTenantRoles, requireFeature('appointments'), validate({ body: updateAppointmentSchema }), updateAppointment);
router.put('/:id/status', authMiddleware, requireTenantRoles, requireFeature('appointments'), validate({ body: updateStatusSchema }), updateAppointmentStatus);
router.delete('/:id', authMiddleware, requireTenantRoles, requireFeature('appointments'), deleteAppointment);

export default router;
