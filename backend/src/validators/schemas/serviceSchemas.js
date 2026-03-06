import { z } from 'zod';

export const createServiceSchema = z.object({
  name: z.string().min(2, 'Nome do serviço deve ter pelo menos 2 caracteres').max(255),
  price: z.number().positive('Preço deve ser positivo').multipleOf(0.01, 'Preço deve ter no máximo 2 casas decimais'),
  duration_minutes: z.number().int().min(10, 'Duração mínima é 10 minutos').max(300, 'Duração máxima é 300 minutos'),
});

export const updateServiceSchema = createServiceSchema.partial();
