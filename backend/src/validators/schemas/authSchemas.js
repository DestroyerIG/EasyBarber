import { z } from 'zod';
import { passwordSchema } from './common.js';

const planSchema = z.enum(['basico', 'profissional', 'premium']);

export const registerSchema = z.object({
  barbershopName: z.string().min(2, 'Nome da barbearia deve ter pelo menos 2 caracteres').max(255),
  ownerName: z.string().min(2, 'Nome do responsável deve ter pelo menos 2 caracteres').max(255),
  email: z.string().email('Email inválido').max(255),
  whatsapp: z.string().min(10, 'WhatsApp inválido').max(20),
  password: passwordSchema,
  desiredPlan: planSchema.default('basico'),
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});
