import api from '@/lib/api';
import type { PlanId } from '@/lib/plans';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'pending'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete';
export type CheckoutPaymentMethod = 'card' | 'pix' | 'boleto';
export type BillingProvider = 'stripe' | 'asaas';

export interface StripeCheckoutSessionResponse {
  provider: 'stripe';
  sessionId: string;
  checkoutUrl: string;
  plan?: PlanId;
}

export interface PixCheckoutSessionResponse {
  provider: 'asaas';
  paymentId: string | null;
  subscriptionId: string | null;
  status: SubscriptionStatus;
  plan?: PlanId;
  qrCode: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
}

export type CheckoutSessionResponse =
  | StripeCheckoutSessionResponse
  | PixCheckoutSessionResponse;

export interface SubscriptionStatusResponse {
  plan: string;
  desiredPlan?: PlanId | string | null;
  provider: BillingProvider | null;
  subscriptionStatus: SubscriptionStatus;
  paymentRequired?: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextDueDate?: string | null;
  lastPaymentDate?: string | null;
  canceledAt?: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  paymentMode?: 'subscription' | 'payment' | null;
  paymentMethod?: CheckoutPaymentMethod | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerPaymentId?: string | null;
}

export interface PixPaymentStatusResponse {
  provider: 'asaas';
  paymentId: string;
  subscriptionId: string | null;
  status: SubscriptionStatus;
  externalStatus: string | null;
  qrCode: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
  dueDate?: string | null;
  confirmedDate?: string | null;
}

export const billingApi = {
  async createCheckoutSession(
    plan: PlanId,
    paymentMethod: CheckoutPaymentMethod = 'card'
  ): Promise<CheckoutSessionResponse> {
    const response = await api.post('/billing/checkout/session', { plan, paymentMethod });
    return response.data;
  },

  async getStatus(): Promise<SubscriptionStatusResponse> {
    const response = await api.get('/billing/status');
    return response.data;
  },

  async createPortalSession(): Promise<{ portalUrl: string }> {
    const response = await api.post('/subscriptions/portal');
    return response.data;
  },

  async cancelSubscription(reason?: string): Promise<{
    provider: BillingProvider;
    subscriptionStatus: SubscriptionStatus;
    canceledAt?: string | null;
  }> {
    const payload = reason ? { reason } : {};
    const response = await api.post('/billing/cancel', payload);
    return response.data;
  },

  async reactivateSubscription(reason?: string): Promise<CheckoutSessionResponse & {
    reactivationMode?: 'new_pix_checkout';
  }> {
    const payload = reason ? { reason } : {};
    const response = await api.post('/billing/reactivate', payload);
    return response.data;
  },

  async getPixPaymentStatus(paymentId: string): Promise<PixPaymentStatusResponse> {
    const response = await api.get(`/billing/pix/${encodeURIComponent(paymentId)}`);
    return response.data;
  },
};
