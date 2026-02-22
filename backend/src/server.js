import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import pool from './config/database.js';
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
    console.error(`❌ Variável de ambiente ${envVar} não definida!`);
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
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use('/api', limiter);

// Rate limiting mais restrito para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});
app.use('/api/auth', authLimiter);

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/barbershop', barbershopRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.get('/', (req, res) => {
  res.json({
    message: '💈 BarberPro SaaS API',
    version: '1.0.0',
    status: 'online'
  });
});

// Iniciar servidor após verificar conexão com banco
const start = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Conexão com banco de dados verificada');

    startReminderCron();

    // Inicializar bot WhatsApp (whatsapp-web.js)
    initWhatsApp();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Falha ao conectar ao banco de dados:', error.message);
    process.exit(1);
  }
};

start();
