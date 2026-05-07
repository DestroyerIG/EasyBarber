import cron from 'node-cron';
import { prisma } from '../config/prisma.js';
import logger from '../utils/logger.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';

// @ts-ignore — sendWhatsAppMessage is a legacy JS service not yet typed
import { sendWhatsAppMessage } from './whatsapp/index.js';

export const startReminderCron = (): void => {
  cron.schedule('*/10 * * * *', async () => {
    try {
      logger.debug('Verificando lembretes...');

      const twoHoursFromNow = new Date();
      twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);

      const targetTime = twoHoursFromNow.toTimeString().split(' ')[0];
      const targetDate = new Date(twoHoursFromNow.toISOString().split('T')[0]!);
      const targetTimeDate = new Date(`1970-01-01T${targetTime}`);
      const targetTimePlus10 = new Date(targetTimeDate.getTime() + 10 * 60 * 1000);

      const appointments = await prisma.appointment.findMany({
        where: {
          date: targetDate,
          time: {
            gte: targetTimeDate,
            lte: targetTimePlus10,
          },
          status: 'confirmado',
          reminderSent: false,
        },
        include: {
          client: { select: { phone: true, name: true } },
          service: { select: { name: true } },
          barber: { select: { name: true } },
        },
      });

      for (const appointment of appointments) {
        const config = await prisma.whatsappBotConfig.findFirst({
          where: { barbershopId: appointment.barbershopId },
          select: { reminderMessage: true },
        });

        let template =
          '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👨‍🦱 Barbeiro: {barbeiro}\n⏰ {horario}\n\nTe esperamos! 💈';

        if (config?.reminderMessage) template = config.reminderMessage;

        const timeStr = appointment.time.toISOString().substring(11, 16);
        const message = template
          .replace(/{nome_cliente}/g, appointment.client.name)
          .replace(/{servico}/g, appointment.service.name)
          .replace(/{barbeiro}/g, appointment.barber.name)
          .replace(/{horario}/g, timeStr);

        const sent = await sendWhatsAppMessage(appointment.client.phone, message, {
          barbershopId: appointment.barbershopId,
        });

        if (sent) {
          await prisma.appointment.update({
            where: { id: appointment.id },
            data: { reminderSent: true },
          });
          logger.info({ phone: appointment.client.phone }, 'Lembrete enviado');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao enviar lembretes');
    }
  });

  cron.schedule('15 * * * *', async () => {
    try {
      const { expiredCount, barbershopIds } = await subscriptionRepository.expireOneTimeSubscriptions();

      if (expiredCount > 0) {
        logger.info({ expiredCount, barbershopIds }, 'Assinaturas one-time marcadas como inadimplentes automaticamente');
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao expirar assinaturas one-time');
    }
  });

  logger.info('Cron de lembretes iniciado');
};
