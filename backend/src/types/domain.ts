import { z } from 'zod';

// ─── Core Domain Types ───────────────────────────────────────────────────────

export type UserRole = 'platform_admin' | 'tenant_admin' | 'employee' | 'client';

export type PlanId = 'basico' | 'profissional' | 'premium';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'pending'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'canceled';

export type BillingProvider = 'stripe' | 'asaas' | 'coupon';

export type PaymentMethod = 'card' | 'pix' | 'coupon';

export type AppointmentStatus = 'confirmado' | 'concluido' | 'cancelado';

// ─── Entity Interfaces ───────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  barbershopId: string | null;
  supabaseId: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Barbershop {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  phone: string | null;
  address: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  barbershopId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  provider: BillingProvider;
  providerSubscriptionId: string | null;
  providerPaymentId: string | null;
  paymentMethod: PaymentMethod | null;
  lastPaymentDate: Date | null;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  asaasCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  features: string[];
}

export interface Appointment {
  id: string;
  barbershopId: string;
  clientId: string;
  barberId: string;
  serviceId: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  barbershopId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
}

export interface Barber {
  id: string;
  barbershopId: string;
  name: string;
  phone: string | null;
  active: boolean;
  createdAt: Date;
}

export interface Service {
  id: string;
  barbershopId: string;
  name: string;
  price: number;
  duration: number;
  active: boolean;
  createdAt: Date;
}

export interface Payment {
  id: string;
  barbershopId: string;
  subscriptionId: string | null;
  provider: BillingProvider;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paidAt: Date | null;
  createdAt: Date;
}

// ─── JWT Payload ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  barbershopId: string | null;
  plan: PlanId | null;
  subscriptionStatus: SubscriptionStatus | null;
  iat?: number;
  exp?: number;
}

// ─── Request User Context ────────────────────────────────────────────────────

export interface RequestUser extends JwtPayload {
  subscriptionStatus: SubscriptionStatus;
}

export interface SubscriptionAccessDecision {
  granted: boolean;
  subscriptionStatus: SubscriptionStatus;
  provider: BillingProvider | null;
  paymentMethod: PaymentMethod | null;
  reason: string;
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export interface BarbershopBillingContext {
  barbershop_id: string;
  subscription_status: string | null;
  payment_method: string | null;
  provider_subscription_id: string | null;
  provider_payment_id: string | null;
  stripe_subscription_id: string | null;
  last_payment_date: string | null;
  [key: string]: unknown;
}

// ─── Zod Schemas (z.infer<> pattern) ─────────────────────────────────────────

export const AppointmentCreateSchema = z.object({
  clientId: z.string().uuid(),
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
});
export type AppointmentCreateInput = z.infer<typeof AppointmentCreateSchema>;

export const AppointmentUpdateSchema = AppointmentCreateSchema.partial();
export type AppointmentUpdateInput = z.infer<typeof AppointmentUpdateSchema>;

export const AppointmentStatusUpdateSchema = z.object({
  status: z.enum(['confirmado', 'concluido', 'cancelado']),
});
export type AppointmentStatusUpdateInput = z.infer<typeof AppointmentStatusUpdateSchema>;
