import express, { type Request, type Response } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireAdmin, requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { handleWebhookEvent } from './webhook.handler.js';
import {
  getStatus,
  initialize,
  getQrCode,
  disconnect,
  sendMessage,
  syncWebhooks,
  internalHealth,
} from './whatsapp.controller.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const waProtected = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

const BLOCKED_EVENTS = new Set(['messages-set', 'messageset']);

// ─── Webhook — sem auth, responde sempre 200 ─────────────────────────────────

// Bloqueia rota legada sem :event — Evolution API deve usar webhook_by_events: true
router.post('/webhook', (_req: Request, res: Response): void => {
  logger.warn({ route: '/webhook' }, 'Rota legada /webhook recusada — configure webhook_by_events: true');
  res.status(410).json({
    success: false,
    error: 'Rota removida. Configure webhook_by_events: true e use /webhook/:event',
  });
});

router.post('/webhook/:event', async (req: Request, res: Response): Promise<void> => {
  const rawEvent = String(req.params['event'] ?? '').trim();
  const event = rawEvent
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

  if (BLOCKED_EVENTS.has(event)) {
    logger.info({ event }, 'webhook: evento bloqueado (messages-set)');
    res.status(200).json({ received: true, processed: false, ignored: true });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    await handleWebhookEvent(event, body);
  } catch (err) {
    logger.error({ err, event }, 'webhook: erro inesperado no handler');
  }

  res.status(200).json({ received: true });
});

// ─── Rotas protegidas ─────────────────────────────────────────────────────────

router.get('/status', ...waProtected, getStatus);

router.post('/initialize', ...waProtected, initialize);
router.post('/connect', ...waProtected, initialize);    // alias

router.get('/qrcode', ...waProtected, getQrCode);
router.get('/qr', ...waProtected, getQrCode);           // alias

router.post('/disconnect', ...waProtected, disconnect);
router.post('/logout', ...waProtected, disconnect);     // alias

router.post('/send', ...waProtected, sendMessage);

// ─── Admin — reaplica webhook_by_events em instâncias antigas ─────────────────
// Idempotente. Use para eliminar warnings "Rota legada /webhook" de instâncias
// criadas antes do fix de webhook por eventos.
router.post('/admin/sync-webhooks', authMiddleware, requireAdmin, syncWebhooks);

// ─── Saúde interna — sem auth ─────────────────────────────────────────────────

router.get('/internal/health', internalHealth);

export default router;
