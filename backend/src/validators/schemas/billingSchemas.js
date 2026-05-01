import { z } from 'zod';

export const createBillingCheckoutSessionSchema = z.object({
  plan: z.enum(['basico', 'profissional', 'premium']),
  paymentMethod: z.enum(['card', 'pix']),
  couponCode: z.string().trim().max(50).optional().nullable(),
});

export const billingActionBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(255).optional(),
  })
  .optional();

export const billingPixPaymentParamsSchema = z.object({
  paymentId: z.string().trim().min(3).max(120),
});
