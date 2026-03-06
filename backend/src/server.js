import express from 'express';
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
import { startReminderCron } from './services/cronService.js';
import { initWhatsApp } from './services/whatsappClient.js';

dotenv.config();

// Validar variáveis de ambiente obrigatórias
const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.fatal(`Variável de ambiente ${envVar} não definida!`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Segurança
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Request ID + logging
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
});

// Prefixo versionado da API
const API_V1 = '/api/v1';

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Tente novamente em 15 minutos.' } }
});
app.use(API_V1, limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' } }
});
app.use(`${API_V1}/auth`, authLimiter);

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// Rotas v1
app.use(`${API_V1}/auth`, authRoutes);
app.use(`${API_V1}/dashboard`, dashboardRoutes);
app.use(`${API_V1}/appointments`, appointmentRoutes);
app.use(`${API_V1}/clients`, clientRoutes);
app.use(`${API_V1}/finance`, financeRoutes);
app.use(`${API_V1}/barbershop`, barbershopRoutes);
app.use(`${API_V1}/whatsapp`, whatsappRoutes);

// Backward-compat: redireciona /api/<recurso> para /api/v1/<recurso>
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/v1')) {
    return res.redirect(301, `${API_V1}${req.path}`);
  }
  next();
});

app.get('/', (req, res) => {
  res.json({
    message: '💈 BarberPro SaaS API',
    version: '1.0.0',
    status: 'online'
  });
});

// 404 handler para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Rota ${req.method} ${req.path} não encontrada`,
    },
  });
});

// Error handler global — DEVE ser o último middleware
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

    server = app.listen(PORT, () => {
      logger.info(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Falha ao conectar ao banco de dados');
    process.exit(1);
  }
};

start();
