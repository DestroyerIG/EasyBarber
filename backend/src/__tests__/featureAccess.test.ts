import { describe, expect, it } from 'vitest';
import { evaluateFeatureAccess } from '../services/featureAccessService.js';
import { normalizePlan, SubscriptionFeature } from '../config/planPermissions.js';

describe('evaluateFeatureAccess', () => {
  describe('normal active subscription', () => {
    it('allows basico features on basico plan', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.APPOINTMENTS, plan: 'basico', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(true);
    });

    it('blocks whatsapp on basico plan', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'basico', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('plan_upgrade_required');
      expect(result.requiredPlan).toBe('profissional');
      expect(result.upgradeRequired).toBe(true);
    });

    it('allows whatsapp on profissional plan', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'profissional', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(true);
    });

    it('allows whatsapp on premium plan', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'premium', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(true);
    });

    it('allows reports on profissional plan', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.REPORTS, plan: 'profissional', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(true);
    });

    it('blocks reports on basico plan', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.REPORTS, plan: 'basico', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(false);
    });
  });

  describe('coupon-activated subscription', () => {
    it('allows whatsapp when coupon activates profissional plan', () => {
      // Simulates the exact scenario: coupon → plan updated to profissional → active
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'profissional', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('ok');
    });

    it('allows all profissional features after coupon upgrade', () => {
      const features = [SubscriptionFeature.WHATSAPP, SubscriptionFeature.REPORTS, SubscriptionFeature.EXPORTS];
      for (const feature of features) {
        const result = evaluateFeatureAccess({ feature, plan: 'profissional', subscriptionStatus: 'active' });
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('trialing subscription', () => {
    it('allows whatsapp on profissional trialing', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'profissional', subscriptionStatus: 'trialing' });
      expect(result.allowed).toBe(true);
    });

    it('blocks whatsapp on basico trialing', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'basico', subscriptionStatus: 'trialing' });
      expect(result.allowed).toBe(false);
      expect(result.upgradeRequired).toBe(true);
    });
  });

  describe('restricted subscription statuses', () => {
    const restrictedStatuses = ['pending', 'past_due', 'unpaid', 'incomplete', 'canceled'] as const;

    it.each(restrictedStatuses)('blocks whatsapp on status=%s', (status) => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'profissional', subscriptionStatus: status });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('subscription_status_restricted');
    });

    it.each(restrictedStatuses)('allows billing on status=%s', (status) => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.BILLING, plan: 'basico', subscriptionStatus: status });
      expect(result.allowed).toBe(true);
    });
  });

  describe('feature blocked error response shape', () => {
    it('returns requiredPlan in decision', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'basico', subscriptionStatus: 'active' });
      expect(result.requiredPlan).toBe('profissional');
      expect(result.message).toContain('Profissional');
      expect(result.upgradeRequired).toBe(true);
      expect(result.billingActionRequired).toBe(false);
    });
  });

  describe('unknown feature', () => {
    it('blocks unknown feature', () => {
      const result = evaluateFeatureAccess({ feature: 'nonexistent_feature', plan: 'premium', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('unknown_feature');
    });
  });

  describe('upgrade / downgrade scenarios', () => {
    it('downgrade: blocks profissional-only feature after downgrade to basico', () => {
      const result = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'basico', subscriptionStatus: 'active' });
      expect(result.allowed).toBe(false);
    });

    it('upgrade: unlocks profissional features after upgrade', () => {
      const before = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'basico', subscriptionStatus: 'active' });
      const after = evaluateFeatureAccess({ feature: SubscriptionFeature.WHATSAPP, plan: 'profissional', subscriptionStatus: 'active' });
      expect(before.allowed).toBe(false);
      expect(after.allowed).toBe(true);
    });
  });
});

describe('normalizePlan', () => {
  it('returns basico for null/undefined/unknown', () => {
    expect(normalizePlan(null)).toBe('basico');
    expect(normalizePlan(undefined)).toBe('basico');
    expect(normalizePlan('unknown')).toBe('basico');
    expect(normalizePlan('')).toBe('basico');
  });

  it('normalizes valid plans', () => {
    expect(normalizePlan('basico')).toBe('basico');
    expect(normalizePlan('profissional')).toBe('profissional');
    expect(normalizePlan('premium')).toBe('premium');
    expect(normalizePlan('PROFISSIONAL')).toBe('profissional');
  });
});

describe('SubscriptionFeature const', () => {
  it('WHATSAPP maps to whatsapp_automation feature key', () => {
    expect(SubscriptionFeature.WHATSAPP).toBe('whatsapp_automation');
  });

  it('all values are valid feature keys', () => {
    for (const key of Object.values(SubscriptionFeature)) {
      const result = evaluateFeatureAccess({ feature: key, plan: 'premium', subscriptionStatus: 'active' });
      expect(result.reason).not.toBe('unknown_feature');
    }
  });
});
