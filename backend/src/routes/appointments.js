import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { 
  getAppointments, 
  createAppointment, 
  updateAppointmentStatus,
  getAvailableSlots
} from '../controllers/appointmentController.js';

const router = express.Router();

router.get('/', authMiddleware, getAppointments);
router.get('/available-slots', authMiddleware, getAvailableSlots);
router.post('/', authMiddleware, createAppointment);
router.put('/:id/status', authMiddleware, updateAppointmentStatus);

export default router;
