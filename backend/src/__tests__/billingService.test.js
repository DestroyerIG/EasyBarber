import { jest } from '@jest/globals';

const mockSubscriptionRepository = {
  getBarbershopBillingContext: jest.fn(),
  updateSubscriptionState: jest.fn(),
  upsertBillingPayment: jest.fn(),
  findBillingPaymentByProviderPaymentId: jest.fn(),
};

const mockBillingProviderFactory = {
  resolveProviderByPaymentMethod: jest.fn(),
  getProvider: jest.fn(),
};

const mockAsaasService = {
  resolveBillingPeriodFromPayment: jest.fn(),
};

const mockAsaasMapper = {
  mapAsaasPaymentToPixData: jest.fn(),
  extractBarbershopIdFromExternalReference: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
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
  default: mockLogger,
}));

const { billingService } = await import('../services/billingService.js');

describe('billingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
    mockLogger.debug.mockReset();

    mockAsaasService.resolveBillingPeriodFromPayment.mockReturnValue({
      periodStart: null,
      periodEnd: null,
    });

    mockAsaasMapper.mapAsaasPaymentToPixData.mockReturnValue({
      qrCode: null,
      pixCopyPaste: null,
      expiresAt: null,
      dueDate: null,
      confirmedDate: null,
    });

    mockAsaasMapper.extractBarbershopIdFromExternalReference.mockReturnValue('tenant-3');
  });

  it('creates Stripe checkout session preserving provider response', async () => {
    const stripeProvider = {
      createSubscription: jest.fn().mockResolvedValue({
        provider: 'stripe',
        sessionId: 'cs_test_123',
        checkoutUrl: 'https://checkout.stripe.com/test',
      }),
    };

    mockSubscriptionRepository.getBarbershopBillingContext.mockResolvedValue({
      id: 'tenant-1',
      plan: 'basico',
      desired_plan: 'premium',
    });

    mockBillingProviderFactory.resolveProviderByPaymentMethod.mockReturnValue('stripe');
    mockBillingProviderFactory.getProvider.mockReturnValue(stripeProvider);

    const result = await billingService.createCheckoutSession('tenant-1', 'premium', 'card');

    expect(result).toEqual({
      provider: 'stripe',
      sessionId: 'cs_test_123',
      checkoutUrl: 'https://checkout.stripe.com/test',
      plan: 'premium',
    });

    expect(stripeProvider.createSubscription).toHaveBeenCalledWith({
      barbershopId: 'tenant-1',
      plan: 'premium',
      paymentMethod: 'card',
    });
  });

  it('creates Pix checkout session via Asaas and stores billing state', async () => {
    const asaasProvider = {
      createSubscription: jest.fn().mockResolvedValue({
        customer: { id: 'cus_asaas' },
        subscription: { id: 'sub_asaas' },
        payment: {
          id: 'pay_asaas',
          status: 'PENDING',
          dueDate: '2026-04-20',
          value: 99.9,
          externalReference: 'barbershop:tenant-2:plan:profissional',
        },
        pixData: {
          qrCode: 'data:image/png;base64,abc',
          pixCopyPaste: '000201...',
          expiresAt: '2026-04-20T23:59:00.000Z',
        },
      }),
      mapExternalStatusToInternalStatus: jest.fn().mockReturnValue('pending'),
    };

    mockSubscriptionRepository.getBarbershopBillingContext.mockResolvedValue({
      id: 'tenant-2',
      name: 'Barbearia Teste',
      owner_name: 'Joao',
      email: 'teste@barber.com',
      whatsapp: '11999999999',
      plan: 'basico',
      desired_plan: 'profissional',
    });

    mockSubscriptionRepository.updateSubscriptionState.mockResolvedValue({
      id: 'tenant-2',
      subscription_status: 'pending',
    });

    mockSubscriptionRepository.upsertBillingPayment.mockResolvedValue({ id: 'bp_1' });

    mockBillingProviderFactory.resolveProviderByPaymentMethod.mockReturnValue('asaas');
    mockBillingProviderFactory.getProvider.mockReturnValue(asaasProvider);

    const result = await billingService.createCheckoutSession('tenant-2', 'profissional', 'pix');

    expect(result).toEqual({
      provider: 'asaas',
      paymentId: 'pay_asaas',
      subscriptionId: 'sub_asaas',
      status: 'pending',
      plan: 'profissional',
      qrCode: 'data:image/png;base64,abc',
      pixCopyPaste: '000201...',
      expiresAt: '2026-04-20T23:59:00.000Z',
    });

    expect(mockSubscriptionRepository.updateSubscriptionState).toHaveBeenCalledWith(
      'tenant-2',
      expect.objectContaining({
        provider: 'asaas',
        providerCustomerId: 'cus_asaas',
        providerSubscriptionId: 'sub_asaas',
        providerPaymentId: 'pay_asaas',
        paymentMethod: 'pix',
        subscriptionStatus: 'pending',
      }),
      null
    );

    expect(mockSubscriptionRepository.upsertBillingPayment).toHaveBeenCalled();
  });

  it('maps Asaas customer create failures to controlled Pix checkout error', async () => {
    const asaasProvider = {
      createSubscription: jest.fn().mockRejectedValue({
        code: 'ASAAS_CUSTOMER_CREATE_ERROR',
        statusCode: 400,
        providerStatus: 400,
        providerData: {
          method: 'POST',
          path: '/customers',
          statusCode: 400,
          payload: {
            errors: [
              {
                code: 'invalid_field',
                description: 'Campo inválido',
              },
            ],
          },
          errors: [
            {
              code: 'invalid_field',
              description: 'Campo inválido',
            },
          ],
        },
      }),
      mapExternalStatusToInternalStatus: jest.fn(),
    };

    mockSubscriptionRepository.getBarbershopBillingContext.mockResolvedValue({
      id: 'tenant-asaas-error-1',
      name: 'Barbearia Teste',
      owner_name: 'Joao',
      email: 'teste@barber.com',
      whatsapp: '11999999999',
      plan: 'basico',
      desired_plan: 'profissional',
    });

    mockBillingProviderFactory.resolveProviderByPaymentMethod.mockReturnValue('asaas');
    mockBillingProviderFactory.getProvider.mockReturnValue(asaasProvider);

    await expect(
      billingService.createCheckoutSession('tenant-asaas-error-1', 'profissional', 'pix')
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'ASAAS_CUSTOMER_CREATE_ERROR',
      message:
        'Não foi possível criar o cliente no Asaas. Verifique os dados cadastrais e tente novamente.',
      details: {
        traceCode: expect.any(String),
      },
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'billing_checkout_error',
        barbershopId: 'tenant-asaas-error-1',
        paymentMethod: 'pix',
        code: 'ASAAS_CUSTOMER_CREATE_ERROR',
      }),
      'Falha ao criar checkout de billing'
    );
  });

  it('refreshes Pix payment status and updates local subscription state', async () => {
    const asaasProvider = {
      getPaymentStatus: jest.fn().mockResolvedValue({
        payment: {
          id: 'pay_refresh',
          subscription: 'sub_refresh',
          customer: 'cus_refresh',
          status: 'CONFIRMED',
          confirmedDate: '2026-04-16',
          dueDate: '2026-04-16',
          value: 49.9,
          externalReference: 'barbershop:tenant-3:plan:basico',
        },
        pixData: {
          qrCode: null,
          pixCopyPaste: '000201...',
          expiresAt: '2026-04-16T23:59:59.000Z',
          dueDate: '2026-04-16T00:00:00.000Z',
          confirmedDate: '2026-04-16T12:00:00.000Z',
        },
      }),
      mapExternalStatusToInternalStatus: jest.fn().mockReturnValue('active'),
    };

    mockBillingProviderFactory.getProvider.mockReturnValue(asaasProvider);

    mockSubscriptionRepository.findBillingPaymentByProviderPaymentId.mockResolvedValue({
      provider: 'asaas',
      provider_payment_id: 'pay_refresh',
      barbershop_id: 'tenant-3',
    });

    mockSubscriptionRepository.getBarbershopBillingContext.mockResolvedValue({
      id: 'tenant-3',
      plan: 'basico',
      provider_subscription_id: 'sub_refresh',
      provider_customer_id: 'cus_refresh',
    });

    mockSubscriptionRepository.updateSubscriptionState.mockResolvedValue({
      id: 'tenant-3',
      subscription_status: 'active',
    });

    mockSubscriptionRepository.upsertBillingPayment.mockResolvedValue({ id: 'bp_refresh' });

    const result = await billingService.getPixPaymentStatus('tenant-3', 'pay_refresh');

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'asaas',
        paymentId: 'pay_refresh',
        subscriptionId: 'sub_refresh',
        status: 'active',
      })
    );

    expect(mockSubscriptionRepository.updateSubscriptionState).toHaveBeenCalledWith(
      'tenant-3',
      expect.objectContaining({
        subscriptionStatus: 'active',
        provider: 'asaas',
      }),
      null
    );
  });
});
