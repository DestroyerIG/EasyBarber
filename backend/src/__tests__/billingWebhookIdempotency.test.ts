import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockSubscriptionRepository = vi.hoisted(() => ({
  getClient: vi.fn(),
  hasProcessedBillingWebhookEvent: vi.fn(),
  getBarbershopBillingContext: vi.fn(),
  findByProviderPaymentId: vi.fn(),
  findBillingPaymentByProviderPaymentId: vi.fn(),
  findByProviderSubscriptionId: vi.fn(),
  findByProviderCustomerId: vi.fn(),
  updateSubscriptionState: vi.fn(),
  upsertBillingPayment: vi.fn(),
  storeBillingWebhookEvent: vi.fn(),
}));

const mockBillingProviderFactory = vi.hoisted(() => ({
  getProvider: vi.fn(),
  resolveProviderByPaymentMethod: vi.fn(),
}));

const mockAsaasService = vi.hoisted(() => ({
  resolveBillingPeriodFromPayment: vi.fn(),
}));

const mockAsaasMapper = vi.hoisted(() => ({
  mapAsaasPaymentToPixData: vi.fn(),
  extractBarbershopIdFromExternalReference: vi.fn(),
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: mockSubscriptionRepository,
}));

vi.mock('../services/billing/billingProviderFactory.js', () => ({
  billingProviderFactory: mockBillingProviderFactory,
}));

vi.mock('../integrations/asaas/service.js', () => ({
  asaasService: mockAsaasService,
}));

vi.mock('../integrations/asaas/mapper.js', () => ({
  asaasMapper: mockAsaasMapper,
}));

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { billingService } = await import('../services/billingService.js');

describe('billing webhook idempotency', () => {
  const normalizedEvent = {
    eventId: 'evt_asaas_1',
    eventType: 'PAYMENT_RECEIVED',
    barbershopId: 'tenant-webhook',
    paymentId: 'pay_asaas_1',
    subscriptionId: 'sub_asaas_1',
    customerId: 'cus_asaas_1',
    externalReference: 'barbershop:tenant-webhook:plan:premium',
    internalStatus: 'active',
    payment: {
      id: 'pay_asaas_1',
      status: 'CONFIRMED',
      dueDate: '2026-04-20',
      confirmedDate: '2026-04-16',
      value: 199.9,
      subscription: 'sub_asaas_1',
      customer: 'cus_asaas_1',
      externalReference: 'barbershop:tenant-webhook:plan:premium',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ASAAS_WEBHOOK_TOKEN;

    mockAsaasService.resolveBillingPeriodFromPayment.mockReturnValue({
      periodStart: new Date('2026-04-16T12:00:00.000Z'),
      periodEnd: new Date('2026-05-16T12:00:00.000Z'),
    });

    mockAsaasMapper.mapAsaasPaymentToPixData.mockReturnValue({
      qrCode: 'data:image/png;base64,abc',
      pixCopyPaste: '000201...',
      expiresAt: '2026-04-20T23:59:00.000Z',
      dueDate: '2026-04-20T00:00:00.000Z',
      confirmedDate: '2026-04-16T12:00:00.000Z',
    });

    mockAsaasMapper.extractBarbershopIdFromExternalReference.mockReturnValue('tenant-webhook');

    mockBillingProviderFactory.getProvider.mockReturnValue({
      handleWebhook: vi.fn().mockResolvedValue(normalizedEvent),
    });
  });

  it('skips duplicated webhook event safely', async () => {
    mockSubscriptionRepository.hasProcessedBillingWebhookEvent.mockResolvedValue(true);

    const result = await billingService.handleAsaasWebhook(
      { event: 'PAYMENT_RECEIVED' },
      {}
    );

    expect(result).toEqual({
      processed: false,
      duplicate: true,
      eventType: 'PAYMENT_RECEIVED',
    });

    expect(mockSubscriptionRepository.updateSubscriptionState).not.toHaveBeenCalled();
    expect(mockSubscriptionRepository.storeBillingWebhookEvent).not.toHaveBeenCalled();
    // No longer calls BEGIN/ROLLBACK/release — those were pg client calls
    expect(mockSubscriptionRepository.getClient).not.toHaveBeenCalled();
  });

  it('processes webhook once and records processed event', async () => {
    mockSubscriptionRepository.hasProcessedBillingWebhookEvent.mockResolvedValue(false);

    mockSubscriptionRepository.getBarbershopBillingContext.mockResolvedValue({
      id: 'tenant-webhook',
      plan: 'premium',
      provider_customer_id: 'cus_asaas_1',
      provider_subscription_id: 'sub_asaas_1',
    });

    mockSubscriptionRepository.updateSubscriptionState.mockResolvedValue({
      id: 'tenant-webhook',
      subscription_status: 'active',
    });

    mockSubscriptionRepository.upsertBillingPayment.mockResolvedValue({
      id: 'bp_asaas_1',
    });

    mockSubscriptionRepository.storeBillingWebhookEvent.mockResolvedValue({
      id: 'we_1',
    });

    const result = await billingService.handleAsaasWebhook(
      { event: 'PAYMENT_RECEIVED' },
      {}
    );

    expect(result).toEqual({
      processed: true,
      duplicate: false,
      eventType: 'PAYMENT_RECEIVED',
    });

    expect(mockSubscriptionRepository.updateSubscriptionState).toHaveBeenCalledWith(
      'tenant-webhook',
      expect.objectContaining({
        provider: 'asaas',
        subscriptionStatus: 'active',
        providerPaymentId: 'pay_asaas_1',
      }),
      null
    );

    expect(mockSubscriptionRepository.storeBillingWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'asaas',
        eventId: 'evt_asaas_1',
        eventType: 'PAYMENT_RECEIVED',
        status: 'processed',
      }),
      null
    );

    // No longer calls getClient/release
    expect(mockSubscriptionRepository.getClient).not.toHaveBeenCalled();
  });
});
