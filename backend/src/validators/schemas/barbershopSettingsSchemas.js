import { z } from 'zod';
import { passwordSchema } from './common.js';
import { isValidCpfCnpj, normalizeDocumentDigits } from '../../utils/cpfCnpj.js';

export const updateBarbershopSettingsSchema = z.object({
  whatsappInstanceName: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .max(255, 'Nome da instancia deve ter no maximo 255 caracteres')
        .regex(/^[a-zA-Z0-9._-]+$/, 'Nome da instancia aceita apenas letras, numeros, ponto, hifen e underscore'),
      z.null(),
    ])
    .optional()
    .default(''),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário de abertura deve estar no formato HH:MM'),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário de fechamento deve estar no formato HH:MM'),
  diasAbertos: z
    .array(z.enum(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']))
    .min(1, 'Selecione pelo menos um dia de funcionamento')
    .optional()
    .default(['seg', 'ter', 'qua', 'qui', 'sex']),
  slotIntervalMinutes: z.number().int().refine((value) => [0, 15, 20, 30, 45, 60, 90, 120].includes(value), {
    message: 'Intervalo deve ser sem intervalo, 15, 20, 30, 45, 60, 90 ou 120 minutos',
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

export const updateAccountProfileSchema = z.object({
  barbershopName: z.string().trim().min(1, 'Nome da barbearia é obrigatório').max(255),
  ownerName: z.string().trim().min(1, 'Nome do responsável é obrigatório').max(255),
  whatsapp: z
    .string()
    .trim()
    .min(1, 'WhatsApp é obrigatório')
    .transform((value) => value.replace(/\D+/g, ''))
    .refine((value) => value.length >= 10 && value.length <= 18, {
      message: 'WhatsApp inválido',
    }),
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
  email: z.string().trim().email('Email inválido').max(255).transform((value) => value.toLowerCase()),
});

export const updateAccountPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, 'Confirmação da nova senha é obrigatória'),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A confirmação da nova senha não confere.',
        path: ['confirmNewPassword'],
      });
    }
  });
