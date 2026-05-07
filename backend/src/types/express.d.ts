import type { RequestUser, SubscriptionAccessDecision } from './domain.js';

declare global {
  namespace Express {
    interface Request {
      user: RequestUser;
      subscriptionAccess?: SubscriptionAccessDecision;
      requestId?: string;
    }
  }
}

export {};
