import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import appointmentRoutes from './routes/appointments.js';
import clientRoutes from './routes/clients.js';
import financeRoutes from './routes/finance.js';
import barbershopRoutes from './routes/barbershop.js';
import whatsappRoutes from './routes/whatsapp.js';
import { startReminderCron } from './services/cronService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

startReminderCron();

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
