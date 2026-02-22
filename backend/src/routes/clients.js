import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getClients,
  createClient,
  updateClient,
  getClientHistory,
  createClientSchema,
  updateClientSchema
} from '../controllers/clientController.js';

const router = express.Router();

router.get('/', authMiddleware, getClients);
router.post('/', authMiddleware, validate({ body: createClientSchema }), createClient);
router.put('/:id', authMiddleware, validate({ body: updateClientSchema }), updateClient);
router.get('/:id/history', authMiddleware, getClientHistory);

export default router;
