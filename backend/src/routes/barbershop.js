import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getServices,
  createService,
  getBarbers,
  createBarber
} from '../controllers/serviceController.js';

const router = express.Router();

router.get('/services', authMiddleware, getServices);
router.post('/services', authMiddleware, createService);
router.get('/barbers', authMiddleware, getBarbers);
router.post('/barbers', authMiddleware, createBarber);

export default router;
