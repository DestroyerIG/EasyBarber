import { jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

const mockSubscriptionRepository = {
  getClient: jest.fn().mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  }),
  hasProcessedBillingWebhookEvent: jest.fn(),
  getBarbershopBillingContext: jest.fn(),
  findByProviderPaymentId: jest.fn(),
  findBillingPaymentByProviderPaymentId: jest.fn(),
  findByProviderSubscriptionId: jest.fn(),
  findByProviderCustomerId: jest.fn(),
  updateSubscriptionState: jest.fn(),
  upsertBillingPayment: jest.fn(),
  storeBillingWebhookEvent: jest.fn(),
};

const mockBillingProviderFactory = {
  getProvider: jest.fn(),
  resolveProviderByPaymentMethod: jest.fn(),
};

const mockAsaasService = {
  resolveBillingPeriodFromPayment: jest.fn(),
};

const mockAsaasMapper = {
  mapAsaasPaymentToPixData: jest.fn(),
  extractBarbershopIdFromExternalReference: jest.fn(),
};

jest.unstable_mockModule('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: mockSubscriptionRepository,
}));

jest.unstable_mockModule('../services/billing/billingProviderFactory.js', () => ({
  billingProviderFactory: mockBillingProviderFactory,
}));

jest.unstable_mockModule('../integrations/asaas/service.js', () => ({
  asaasService: mockAsaasService,
}));

jest.unstable_mockModule('../integrations/asaas/mapper.js', () => ({
  asaasMapper: mockAsaasMapper,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
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
    jest.clearAllMocks();
    delete process.env.ASAAS_WEBHOOK_TOKEN;

    mockClientQuery.mockResolvedValue({ rows: [] });

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
      handleWebhook: jest.fn().mockResolvedValue(normalizedEvent),
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
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
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
      expect.anything()
    );

    expect(mockSubscriptionRepository.storeBillingWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'asaas',
        eventId: 'evt_asaas_1',
        eventType: 'PAYMENT_RECEIVED',
        status: 'processed',
      }),
      expect.anything()
    );

    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockClientRelease).toHaveBeenCalled();
  });
});
