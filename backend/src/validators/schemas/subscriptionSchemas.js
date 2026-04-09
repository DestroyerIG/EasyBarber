import { z } from 'zod';

export const createCheckoutSessionSchema = z.object({
  plan: z.enum(['basico', 'profissional', 'premium']),
  paymentMethod: z.enum(['card', 'pix', 'boleto']),
});
