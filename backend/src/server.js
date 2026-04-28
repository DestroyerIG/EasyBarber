import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import pool from './config/database.js';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import appointmentRoutes from './routes/appointments.js';
import clientRoutes from './routes/clients.js';
import financeRoutes from './routes/finance.js';
import barbershopRoutes from './routes/barbershop.js';
import whatsappRoutes from './routes/whatsapp.js';
import subscriptionRoutes from './routes/subscriptions.js';
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';
import debugRoutes from './routes/debug.js';
import { stripeWebhook } from './controllers/subscriptionController.js';
import { startReminderCron } from './services/cronService.js';
import { initWhatsApp } from './services/whatsappClient.js';
import { getAsaasApiKeyDiagnostics } from './integrations/asaas/client.js';

dotenv.config();

// Validar variáveis de ambiente obrigatórias
const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.fatal(`Variável de ambiente ${envVar} não definida!`);
    process.exit(1);
  }
}

const stripeRequiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID_BASICO',
  'STRIPE_PRICE_ID_PROFISSIONAL',
  'STRIPE_PRICE_ID_PREMIUM',
];

const stripeOptionalOneTimeEnvVars = [
  'STRIPE_PRICE_ID_BASICO_ONE_TIME',
  'STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME',
  'STRIPE_PRICE_ID_PREMIUM_ONE_TIME',
];

const stripeBillingEnabled =
  stripeRequiredEnvVars.some((envVar) => Boolean(process.env[envVar])) ||
  stripeOptionalOneTimeEnvVars.some((envVar) => Boolean(process.env[envVar]));

if (stripeBillingEnabled) {
  const missingStripeEnvVars = stripeRequiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingStripeEnvVars.length > 0) {
    logger.fatal(
      { missingEnvVars: missingStripeEnvVars },
      'Configuração Stripe incompleta para billing híbrido'
    );
    process.exit(1);
  }

  const oneTimeConfiguredCount = stripeOptionalOneTimeEnvVars.filter((envVar) => Boolean(process.env[envVar])).length;
  if (oneTimeConfiguredCount > 0 && oneTimeConfiguredCount < stripeOptionalOneTimeEnvVars.length) {
    logger.warn(
      {
        missingOneTimePriceEnvVars: stripeOptionalOneTimeEnvVars.filter((envVar) => !process.env[envVar]),
      },
      'Configuração Stripe one-time parcial: o fluxo legado pix/boleto em Stripe ficará indisponível'
    );
  }
}

if (process.env.ASAAS_BASE_URL && !process.env.ASAAS_API_KEY) {
  logger.fatal('ASAAS_BASE_URL definido sem ASAAS_API_KEY');
  process.exit(1);
}

if (process.env.ASAAS_API_KEY) {
  logger.info(
    {
      event: 'asaas_api_key_diagnostics',
      ...getAsaasApiKeyDiagnostics(),
    },
    'Diagnóstico da chave Asaas no boot'
  );
}

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const API_V1 = '/api/v1';
const API_JSON_BODY_LIMIT = process.env.API_JSON_BODY_LIMIT || '1mb';
const WHATSAPP_WEBHOOK_BODY_LIMIT = process.env.WHATSAPP_WEBHOOK_BODY_LIMIT || '6mb';
const BLOCKED_WHATSAPP_WEBHOOK_EVENTS = new Set(['messages-set', 'messageset']);

const normalizeWebhookEventName = (value) =>
  String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

// Segurança básica
app.use(helmet());

// CORS corrigido para localhost, domínio fixo da Vercel, previews da Vercel e FRONTEND_URL opcional
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://barberpro-saas-2-0.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

const vercelProjectPrefix = process.env.VERCEL_PROJECT_PREFIX || 'barberpro-saas-2-0';

const isAllowedVercelPreview = (origin) => {
  try {
    const hostname = new URL(origin).hostname;
    if (!hostname.endsWith('.vercel.app')) {
      return false;
    }

    return (
      hostname === `${vercelProjectPrefix}.vercel.app` ||
      hostname.startsWith(`${vercelProjectPrefix}-`)
    );
  } catch {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    // Permite ferramentas sem origin definido (Postman, curl, apps locais)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (isAllowedVercelPreview(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(cookieParser());

// Stripe webhook precisa vir antes do express.json
app.post(
  `${API_V1}/subscriptions/webhook`,
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

app.post(
  `${API_V1}/billing/webhook/stripe`,
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

app.post(`${API_V1}/whatsapp/webhook/:event`, (req, res, next) => {
  const eventName = normalizeWebhookEventName(req.params.event || '');

  if (!BLOCKED_WHATSAPP_WEBHOOK_EVENTS.has(eventName)) {
    return next();
  }

  logger.info(
    {
      event: eventName,
      route: req.originalUrl,
      ignoredBeforeParser: true,
    },
    'Webhook WhatsApp pesado ignorado antes do parser'
  );

  return res.status(200).json({
    success: true,
    data: {
      received: true,
      processed: false,
      ignored: true,
      reason: 'blocked_event',
      event: eventName,
    },
  });
});

// Webhook da Evolution pode incluir payloads maiores (ex.: eventos com anexos/captions).
app.use(`${API_V1}/whatsapp/webhook`, express.json({ limit: WHATSAPP_WEBHOOK_BODY_LIMIT }));

app.use(express.json({ limit: API_JSON_BODY_LIMIT }));

// Request ID + logging
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level =
      res.statusCode >= 500 ? 'error' :
      res.statusCode >= 400 ? 'warn' :
      'info';

    logger[level](
      {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: duration,
      },
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
});

// Rate limit geral da API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.method === 'OPTIONS' ||
    req.originalUrl.startsWith(`${API_V1}/subscriptions/webhook`) ||
    req.originalUrl.startsWith(`${API_V1}/billing/webhook/stripe`) ||
    req.originalUrl.startsWith(`${API_V1}/billing/webhooks/asaas`) ||
    req.originalUrl.startsWith(`${API_V1}/billing/webhook/asaas`),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Muitas requisições. Tente novamente em alguns minutos.',
    },
  },
});

app.use(API_V1, apiLimiter);

// Rate limit específico para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    },
  },
});

// Rate limit específico para cadastro
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Muitas tentativas de cadastro. Tente novamente em 15 minutos.',
    },
  },
});

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Muitas tentativas de reenvio. Tente novamente em alguns minutos.',
    },
  },
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'connected',
      uptime: process.uptime(),
    });
  } catch {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
    });
  }
});

app.get('/debug/ip', async (req, res) => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();

    return res.json({
      success: true,
      ip: data.ip,
    });
  } catch (err) {
    console.error('Erro ao obter IP público:', err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Auth com limitadores específicos
app.use(`${API_V1}/auth/login`, loginLimiter);
app.use(`${API_V1}/auth/register`, registerLimiter);
app.use(`${API_V1}/auth/resend-verification`, resendVerificationLimiter);

// Rotas v1
app.use(`${API_V1}/auth`, authRoutes);
app.use(`${API_V1}/dashboard`, dashboardRoutes);
app.use(`${API_V1}/appointments`, appointmentRoutes);
app.use(`${API_V1}/clients`, clientRoutes);
app.use(`${API_V1}/finance`, financeRoutes);
app.use(`${API_V1}/barbershop`, barbershopRoutes);
app.use(`${API_V1}/whatsapp`, whatsappRoutes);
app.use(`${API_V1}/subscriptions`, subscriptionRoutes);
app.use(`${API_V1}/billing`, billingRoutes);
app.use(`${API_V1}/admin`, adminRoutes);
app.use(`${API_V1}/debug`, debugRoutes);
app.use('/debug', debugRoutes);

// Backward-compat: redireciona /api/<recurso> para /api/v1/<recurso>
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/v1')) {
    return res.redirect(301, `${API_V1}${req.path}`);
  }
  next();
});

app.get('/', (req, res) => {
  res.json({
    message: '💈 EasyBarber SaaS API',
    version: '1.0.0',
    status: 'online',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Rota ${req.method} ${req.path} não encontrada`,
    },
  });
});

// Error handler global
app.use(errorHandler);

// Graceful shutdown
let server;

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'Sinal de shutdown recebido. Encerrando...');

  if (server) {
    server.close(() => {
      logger.info('Servidor HTTP encerrado');
    });
  }

  try {
    await pool.end();
    logger.info('Pool de conexões encerrado');
  } catch (err) {
    logger.error({ err }, 'Erro ao encerrar pool');
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled Rejection — encerrando processo');
  process.exit(1);
});

// Iniciar servidor
const start = async () => {
  try {
    await pool.query('SELECT 1');
    logger.info('Conexão com banco de dados verificada');

    startReminderCron();
    initWhatsApp();

    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Falha ao conectar ao banco de dados');
    process.exit(1);
  }
};

start();
