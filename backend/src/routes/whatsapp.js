import express from 'express';
import { handleWebhook } from '../services/whatsappService.js';

const router = express.Router();

router.post('/webhook', handleWebhook);

export default router;
