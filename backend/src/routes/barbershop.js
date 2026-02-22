import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getServices,
  createService,
  getBarbers,
  createBarber,
  updateService,
  deleteService,
  updateBarber,
  deleteBarber,
  createServiceSchema,
  updateServiceSchema,
  createBarberSchema,
  updateBarberSchema
} from '../controllers/serviceController.js';

const router = express.Router();

router.get('/services', authMiddleware, getServices);
router.post('/services', authMiddleware, validate({ body: createServiceSchema }), createService);
router.put('/services/:id', authMiddleware, validate({ body: updateServiceSchema }), updateService);
router.delete('/services/:id', authMiddleware, deleteService);

router.get('/barbers', authMiddleware, getBarbers);
router.post('/barbers', authMiddleware, validate({ body: createBarberSchema }), createBarber);
router.put('/barbers/:id', authMiddleware, validate({ body: updateBarberSchema }), updateBarber);
router.delete('/barbers/:id', authMiddleware, deleteBarber);

export default router;
