import { z } from 'zod';

export const createBarberSchema = z.object({
  name: z.string().min(2, 'Nome do barbeiro deve ter pelo menos 2 caracteres').max(255),
  photo: z.string().url('URL da foto inválida').optional().nullable(),
});

export const updateBarberSchema = createBarberSchema.partial();
