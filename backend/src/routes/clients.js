import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { 
  getClients, 
  createClient,
  getClientHistory
} from '../controllers/clientController.js';

const router = express.Router();

router.get('/', authMiddleware, getClients);
router.post('/', authMiddleware, createClient);
router.get('/:id/history', authMiddleware, getClientHistory);

export default router;
