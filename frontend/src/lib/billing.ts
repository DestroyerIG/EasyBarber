import api from '@/lib/api';
import type { PlanId } from '@/lib/plans';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
export type CheckoutPaymentMethod = 'card' | 'pix' | 'boleto';

export interface CheckoutSessionResponse {
  sessionId: string;
  checkoutUrl: string;
}

export interface SubscriptionStatusResponse {
  plan: string;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  paymentMode?: 'subscription' | 'payment' | null;
  paymentMethod?: CheckoutPaymentMethod | null;
}

export const billingApi = {
  async createCheckoutSession(
    plan: PlanId,
    paymentMethod: CheckoutPaymentMethod = 'card'
  ): Promise<CheckoutSessionResponse> {
    const response = await api.post('/subscriptions/checkout-session', { plan, paymentMethod });
    return response.data;
  },

  async getStatus(): Promise<SubscriptionStatusResponse> {
    const response = await api.get('/subscriptions/status');
    return response.data;
  },

  async createPortalSession(): Promise<{ portalUrl: string }> {
    const response = await api.post('/subscriptions/portal');
    return response.data;
  },
};
