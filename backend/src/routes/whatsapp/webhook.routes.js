import express from 'express';
import { webhookController } from './webhook.controller.js';

const router = express.Router();

// To add HMAC/token auth: replace the line below with:
// router.post('/webhook/:event', webhookAuth, webhookController);
router.post('/webhook/:event', webhookController);

export default router;
