import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
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

router.get('/', authMiddleware, getAppointments);
router.get('/available-slots', authMiddleware, getAvailableSlots);
router.post('/', authMiddleware, validate({ body: createAppointmentSchema }), createAppointment);
router.put('/:id', authMiddleware, validate({ body: updateAppointmentSchema }), updateAppointment);
router.put('/:id/status', authMiddleware, validate({ body: updateStatusSchema }), updateAppointmentStatus);
router.delete('/:id', authMiddleware, deleteAppointment);

export default router;
