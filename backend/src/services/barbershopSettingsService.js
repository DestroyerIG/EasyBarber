import { barbershopSettingsRepository } from '../repositories/barbershopSettingsRepository.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const ALLOWED_SLOT_INTERVALS = new Set([15, 20, 30, 45, 60]);

const toMinutes = (timeValue) => {
  const [hours, minutes] = timeValue.split(':').map(Number);
  return (hours * 60) + minutes;
};

const normalizeOptionalText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

export const barbershopSettingsService = {
  async getSettings(barbershopId) {
    const settings = await barbershopSettingsRepository.findByBarbershopId(barbershopId);
    if (!settings) {
      throw new NotFoundError('Barbearia');
    }
    return settings;
  },

  async updateSettings(barbershopId, data) {
    if (!ALLOWED_SLOT_INTERVALS.has(data.slotIntervalMinutes)) {
      throw new ValidationError('Intervalo de agenda inválido', ['Use 15, 20, 30, 45 ou 60 minutos.']);
    }

    const openingMinutes = toMinutes(data.openingTime);
    const closingMinutes = toMinutes(data.closingTime);

    if (closingMinutes <= openingMinutes) {
      throw new ValidationError(
        'Horário de fechamento inválido',
        ['O horário de fechamento deve ser maior que o horário de abertura.']
      );
    }

    const payload = {
      shopName: data.shopName.trim(),
      contactPhone: normalizeOptionalText(data.contactPhone),
      address: normalizeOptionalText(data.address),
      openingTime: data.openingTime,
      closingTime: data.closingTime,
      slotIntervalMinutes: data.slotIntervalMinutes,
      allowWalkins: data.allowWalkins,
      autoConfirmAppointments: data.autoConfirmAppointments,
      emailReminders: data.emailReminders,
      whatsappReminders: data.whatsappReminders,
      googleCalendarEnabled: data.googleCalendarEnabled,
      customWebhookUrl: normalizeOptionalText(data.customWebhookUrl) || null,
    };

    const settings = await barbershopSettingsRepository.upsert(barbershopId, payload);
    if (!settings) {
      throw new NotFoundError('Barbearia');
    }

    return settings;
  },
};
