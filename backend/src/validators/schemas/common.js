import { z } from 'zod';
import { authService } from '../../services/authService.js';

export const uuid = (label) => z.string().uuid(`ID do ${label} inválido`);
export const dateYMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');
export const timeHM = z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM');
export const optionalString = (max = 500) => z.string().max(max).optional().or(z.literal(''));

export const passwordSchema = z.string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
  .refine(
    (val) => !authService.isCommonPassword(val),
    'Esta senha é muito comum. Escolha uma senha mais segura.'
  );
