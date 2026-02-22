import cron from 'node-cron';
import pool from '../config/database.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';

export const startReminderCron = () => {
  cron.schedule('*/10 * * * *', async () => {
    try {
      console.log('⏰ Verificando lembretes...');

      const twoHoursFromNow = new Date();
      twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);

      const targetTime = twoHoursFromNow.toTimeString().split(' ')[0];
      const targetDate = twoHoursFromNow.toISOString().split('T')[0];

      const appointments = await pool.query(
        `SELECT 
          a.id,
          a.date,
          a.time,
          c.phone,
          c.name as client_name,
          s.name as service_name,
          b.name as barber_name
         FROM appointments a
         JOIN clients c ON a.client_id = c.id
         JOIN services s ON a.service_id = s.id
         JOIN barbers b ON a.barber_id = b.id
         WHERE a.date = $1 
         AND a.time BETWEEN $2 AND ($2::time + INTERVAL '10 minutes')
         AND a.status = 'confirmado'
         AND a.reminder_sent = false`,
        [targetDate, targetTime]
      );

      for (const appointment of appointments.rows) {
        // Buscar configuração de mensagens da barbearia
        const configResult = await pool.query(
          'SELECT reminder_message FROM whatsapp_bot_config WHERE barbershop_id = $1',
          [appointment.barbershop_id]
        );

        let template = '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👨‍🦱 Barbeiro: {barbeiro}\n⏰ {horario}\n\nTe esperamos! 💈';

        if (configResult.rows.length > 0 && configResult.rows[0].reminder_message) {
          template = configResult.rows[0].reminder_message;
        }

        const message = template
          .replace(/{nome_cliente}/g, appointment.client_name)
          .replace(/{servico}/g, appointment.service_name)
          .replace(/{barbeiro}/g, appointment.barber_name)
          .replace(/{horario}/g, appointment.time.substring(0, 5));

        const sent = await sendWhatsAppMessage(appointment.phone, message);

        if (sent) {
          await pool.query(
            'UPDATE appointments SET reminder_sent = true WHERE id = $1',
            [appointment.id]
          );
          console.log(`✅ Lembrete enviado para ${appointment.phone}`);
        }
      }

    } catch (error) {
      console.error('❌ Erro ao enviar lembretes:', error);
    }
  });

  console.log('✅ Cron de lembretes iniciado');
};
