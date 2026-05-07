import { z } from 'zod';
import type { PlanId, BillingProvider, PaymentMethod } from '../../types/domain.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateCheckoutSessionSchema = z.object({
  plan: z.enum(['basico', 'profissional', 'premium']),
  paymentMethod: z.enum(['card', 'pix']),
  couponCode: z.string().trim().max(50).optional().nullable(),
});

export const BillingActionBodySchema = z
  .object({ reason: z.string().trim().min(3).max(255).optional() })
  .optional();

export const PixPaymentParamsSchema = z.object({
  paymentId: z.string().trim().min(3).max(120),
});

export const ValidateCouponBodySchema = z.object({
  code: z.string().trim().min(1).max(50),
  plan: z.enum(['basico', 'profissional', 'premium']),
});

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateCheckoutSessionInput = z.infer<typeof CreateCheckoutSessionSchema>;
export type PixPaymentParams = z.infer<typeof PixPaymentParamsSchema>;
export type ValidateCouponBody = z.infer<typeof ValidateCouponBodySchema>;

// ─── Checkout result ──────────────────────────────────────────────────────────

export interface CheckoutSessionResult {
  url?: string;
  pixCopyPaste?: string;
  qrCode?: string;
  paymentId?: string;
  provider: BillingProvider;
  paymentMethod: PaymentMethod;
}

// ─── Billing status ───────────────────────────────────────────────────────────

export interface BillingStatus {
  plan: PlanId;
  subscriptionStatus: string;
  provider: BillingProvider | null;
  paymentMethod: PaymentMethod | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  providerSubscriptionId: string | null;
  providerPaymentId: string | null;
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export interface WebhookResult {
  received: boolean;
  processed: boolean;
  duplicate: boolean;
  eventType: string | null;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface IBillingProvider {
  createCheckout(
    barbershopId: string,
    plan: PlanId,
    paymentMethod: PaymentMethod,
    couponCode?: string | null
  ): Promise<CheckoutSessionResult>;
  cancelSubscription(barbershopId: string): Promise<void>;
  reactivateSubscription(barbershopId: string): Promise<void>;
  getPixPaymentStatus(barbershopId: string, paymentId: string): Promise<unknown>;
}
