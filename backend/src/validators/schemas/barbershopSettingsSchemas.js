import { z } from 'zod';
import { isValidCpfCnpj, normalizeDocumentDigits } from '../../utils/cpfCnpj.js';

export const updateBarbershopSettingsSchema = z.object({
  shopName: z.string().trim().min(2, 'Nome da barbearia deve ter pelo menos 2 caracteres').max(255),
  contactPhone: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(255).optional().default(''),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário de abertura deve estar no formato HH:MM'),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário de fechamento deve estar no formato HH:MM'),
  slotIntervalMinutes: z.number().int().refine((value) => [15, 20, 30, 45, 60].includes(value), {
    message: 'Intervalo deve ser 15, 20, 30, 45 ou 60 minutos',
  }),
  allowWalkins: z.boolean(),
  autoConfirmAppointments: z.boolean(),
  emailReminders: z.boolean(),
  whatsappReminders: z.boolean(),
  googleCalendarEnabled: z.boolean(),
  customWebhookUrl: z
    .union([z.literal(''), z.string().url('Webhook deve ser uma URL válida')])
    .optional()
    .default(''),
});

export const updateBarbershopProfileSchema = z.object({
  cpfCnpj: z
    .string()
    .trim()
    .min(1, 'CPF/CNPJ é obrigatório')
    .transform((value) => normalizeDocumentDigits(value))
    .refine((value) => value.length === 11 || value.length === 14, {
      message: 'CPF/CNPJ deve ter 11 ou 14 dígitos',
    })
    .refine((value) => isValidCpfCnpj(value), {
      message: 'CPF/CNPJ inválido',
    }),
});
