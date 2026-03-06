/**
 * Cria instância Express isolada para testes com todos os middlewares e rotas,
 * sem chamar app.listen() e sem inicializar WhatsApp/Cron.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { errorHandler } from '../../middleware/errorHandler.js';
import authRoutes from '../../routes/auth.js';
import appointmentRoutes from '../../routes/appointments.js';
import clientRoutes from '../../routes/clients.js';
import financeRoutes from '../../routes/finance.js';
import dashboardRoutes from '../../routes/dashboard.js';
import barbershopRoutes from '../../routes/barbershop.js';

export const createTestApp = () => {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Request ID
  app.use((req, res, next) => {
    req.id = 'test-request-id';
    next();
  });

  const API_V1 = '/api/v1';
  app.use(`${API_V1}/auth`, authRoutes);
  app.use(`${API_V1}/dashboard`, dashboardRoutes);
  app.use(`${API_V1}/appointments`, appointmentRoutes);
  app.use(`${API_V1}/clients`, clientRoutes);
  app.use(`${API_V1}/finance`, financeRoutes);
  app.use(`${API_V1}/barbershop`, barbershopRoutes);

  // 404
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Rota ${req.method} ${req.path} não encontrada` },
    });
  });

  app.use(errorHandler);
  return app;
};
