import express from 'express';
import newWhatsAppRouter from './whatsapp.module.js';
// @ts-ignore — rotas auxiliares (config, menu, simulador) ainda no arquivo legado
import legacyRouter from '../../routes/whatsapp.js';

const router = express.Router();

// Novo módulo: webhook, status, initialize, connect, qrcode, qr,
//              disconnect, logout, send, internal/health (prioridade)
router.use(newWhatsAppRouter);

// Legado: /config, /config/menu, /simulator, /test-send, /debug-send, /restart
router.use(legacyRouter);

export default router;
