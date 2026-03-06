import { z } from 'zod';
import { dateYMD } from './common.js';

export const addExpenseSchema = z.object({
  description: z.string().min(2, 'Descrição deve ter pelo menos 2 caracteres').max(255),
  category: z.string().min(1, 'Categoria é obrigatória').max(50),
  amount: z.number().positive('Valor deve ser positivo').multipleOf(0.01, 'Valor deve ter no máximo 2 casas decimais'),
  date: dateYMD,
});

export const updateExpenseSchema = addExpenseSchema.partial();
