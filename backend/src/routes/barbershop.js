import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController.js';
import { getBarbers, createBarber, updateBarber, deleteBarber } from '../controllers/barberController.js';
import { createServiceSchema, updateServiceSchema, createBarberSchema, updateBarberSchema } from '../validators/schemas/index.js';

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
