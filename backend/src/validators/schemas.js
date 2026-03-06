import { z } from 'zod';
import { authService } from '../services/authService.js';

// --- Campos reutilizáveis ---

const uuid = (label) => z.string().uuid(`ID do ${label} inválido`);
const dateYMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');
const timeHM = z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM');
const optionalString = (max = 500) => z.string().max(max).optional().or(z.literal(''));

const passwordSchema = z.string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
  .refine(
    (val) => !authService.isCommonPassword(val),
    'Esta senha é muito comum. Escolha uma senha mais segura.'
  );

// --- Auth ---

export const registerSchema = z.object({
  barbershopName: z.string().min(2, 'Nome da barbearia deve ter pelo menos 2 caracteres').max(255),
  ownerName: z.string().min(2, 'Nome do responsável deve ter pelo menos 2 caracteres').max(255),
  email: z.string().email('Email inválido').max(255),
  whatsapp: z.string().min(10, 'WhatsApp inválido').max(20),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

// --- Appointments ---

export const createAppointmentSchema = z.object({
  clientId: uuid('cliente'),
  barberId: uuid('barbeiro'),
  serviceId: uuid('serviço'),
  date: dateYMD,
  time: timeHM,
});

export const updateAppointmentSchema = createAppointmentSchema;

export const updateStatusSchema = z.object({
  status: z.enum(['confirmado', 'concluido', 'cancelado'], {
    errorMap: () => ({ message: 'Status deve ser: confirmado, concluido ou cancelado' }),
  }),
});

// --- Clients ---

export const createClientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
  phone: z.string().min(10, 'Telefone inválido').max(20),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  birthDate: optionalString(),
  address: optionalString(500),
  notes: optionalString(1000),
});

export const updateClientSchema = createClientSchema.partial();

// --- Finance ---

export const addExpenseSchema = z.object({
  description: z.string().min(2, 'Descrição deve ter pelo menos 2 caracteres').max(255),
  category: z.string().min(1, 'Categoria é obrigatória').max(50),
  amount: z.number().positive('Valor deve ser positivo').multipleOf(0.01, 'Valor deve ter no máximo 2 casas decimais'),
  date: dateYMD,
});

export const updateExpenseSchema = addExpenseSchema.partial();

// --- Services & Barbers ---

export const createServiceSchema = z.object({
  name: z.string().min(2, 'Nome do serviço deve ter pelo menos 2 caracteres').max(255),
  price: z.number().positive('Preço deve ser positivo').multipleOf(0.01, 'Preço deve ter no máximo 2 casas decimais'),
  duration_minutes: z.number().int().min(10, 'Duração mínima é 10 minutos').max(300, 'Duração máxima é 300 minutos'),
});

export const updateServiceSchema = createServiceSchema.partial();

export const createBarberSchema = z.object({
  name: z.string().min(2, 'Nome do barbeiro deve ter pelo menos 2 caracteres').max(255),
  photo: z.string().url('URL da foto inválida').optional().nullable(),
});

export const updateBarberSchema = createBarberSchema.partial();
