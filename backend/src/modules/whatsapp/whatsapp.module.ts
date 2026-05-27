import express, { type Request, type Response } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireAdmin, requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { handleWebhookEvent } from './webhook.handler.js';
import { handleMetaVerification, handleMetaInbound } from './meta-webhook.handler.js';
import {
  getStatus,
  initialize,
  getQrCode,
  disconnect,
  sendMessage,
  syncWebhooks,
  cleanupCorrupted,
  testWebhookConfig,
  internalHealth,
  getMetaConfig,
  saveMetaConfig,
  deleteMetaConfig,
} from './whatsapp.controller.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const waProtected = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

const BLOCKED_EVENTS = new Set(['messages-set', 'messageset']);

const normalizeEventName = (raw: unknown): string =>
  String(raw ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

const extractInstanceFromBody = (body: Record<string, unknown>): string | null => {
  const v =
    body['instance'] ??
    body['instanceName'] ??
    (body['data'] as Record<string, unknown> | undefined)?.['instanceName'];
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const inner = o['instanceName'] ?? o['name'];
    if (typeof inner === 'string' && inner.trim()) return inner.trim();
  }
  return null;
};

// ─── Meta WhatsApp Cloud API webhook — sem auth ──────────────────────────────
// GET: handshake de verificação (hub.challenge). POST: entrega de mensagens,
// roteadas por phone_number_id. Único endpoint para todas as barbearias.
router.get('/meta/webhook', handleMetaVerification);
router.post('/meta/webhook', handleMetaInbound);

// ─── Webhook — sem auth, responde SEMPRE 200 ─────────────────────────────────
//
// Evolution v2 pode despachar de dois jeitos para o mesmo backend:
//   1. webhook_by_events=true  → POST /webhook/{event-kebab}
//   2. webhook_by_events=false → POST /webhook  (event vem no body)
// Ambos caminhos abaixo respondem 200 em qualquer cenário (instance
// desconhecida, evento ignorado, erro interno) — devolver 4xx/5xx faz a
// Evolution retentar em loop e gera 410-spam nos logs dela.

// Catch-all: Evolution global webhook (single endpoint) cai aqui.
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const event = normalizeEventName(body['event'] ?? body['eventType'] ?? body['type']);
  const instanceName = extractInstanceFromBody(body);

  logger.info(
    {
      route: '/webhook',
      method: 'POST',
      event: event || null,
      instanceName,
      bodyKeys: Object.keys(body),
    },
    'webhook-controller: requisição recebida (global)',
  );

  // Responde 200 imediatamente — processamento real é fire-and-forget.
  res.status(200).json({ received: true });

  if (!event) {
    logger.warn({ bodyKeys: Object.keys(body) }, 'webhook: payload global sem campo event, ignorado');
    return;
  }

  if (BLOCKED_EVENTS.has(event)) {
    logger.info({ event }, 'webhook: evento bloqueado (messages-set)');
    return;
  }

  try {
    await handleWebhookEvent(event, body);
  } catch (err) {
    logger.error({ err, event, instanceName }, 'webhook: erro inesperado no handler global');
  }
});

router.post('/webhook/:event', async (req: Request, res: Response): Promise<void> => {
  const event = normalizeEventName(req.params['event'] ?? '');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const instanceName = extractInstanceFromBody(body);

  logger.info(
    {
      route: `/webhook/${event}`,
      method: 'POST',
      event,
      instanceName,
      bodyKeys: Object.keys(body),
    },
    'webhook-controller: requisição recebida (per-event)',
  );

  if (BLOCKED_EVENTS.has(event)) {
    logger.info({ event }, 'webhook: evento bloqueado (messages-set)');
    res.status(200).json({ received: true, processed: false, ignored: true });
    return;
  }

  try {
    await handleWebhookEvent(event, body);
  } catch (err) {
    logger.error({ err, event, instanceName }, 'webhook: erro inesperado no handler per-event');
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

// ─── Meta Cloud API — credenciais por barbearia ──────────────────────────────
router.get('/meta/config', ...waProtected, getMetaConfig);
router.put('/meta/config', ...waProtected, saveMetaConfig);
router.delete('/meta/config', ...waProtected, deleteMetaConfig);

router.post('/send', ...waProtected, sendMessage);

// ─── Admin — reaplica webhook_by_events em instâncias antigas ─────────────────
// Idempotente. Use para eliminar warnings "Rota legada /webhook" de instâncias
// criadas antes do fix de webhook por eventos.
router.post('/admin/sync-webhooks', authMiddleware, requireAdmin, syncWebhooks);

// ─── Admin — remove instâncias órfãs (zumbis sem underscore, etc.) ────────────
// Use ?dryRun=true para apenas listar sem deletar.
router.post('/admin/cleanup-corrupted', authMiddleware, requireAdmin, cleanupCorrupted);

// ─── Admin — diagnóstico do webhook (read-only, sem efeito colateral) ────────
router.get('/admin/test-webhook-config', authMiddleware, requireAdmin, testWebhookConfig);

// ─── Saúde interna — sem auth ─────────────────────────────────────────────────

router.get('/internal/health', internalHealth);

export default router;
