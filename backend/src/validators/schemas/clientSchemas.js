import { z } from 'zod';
import { optionalString } from './common.js';

export const createClientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
  phone: z.string().min(10, 'Telefone inválido').max(20),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  birthDate: optionalString(),
  address: optionalString(500),
  notes: optionalString(1000),
});

export const updateClientSchema = createClientSchema.partial();
