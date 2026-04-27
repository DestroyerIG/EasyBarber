import { jest } from '@jest/globals';

const mockAsaasClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

const mockAsaasMapper = {
  mapAsaasPaymentToPixData: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
};

jest.unstable_mockModule('../integrations/asaas/client.js', () => ({
  asaasClient: mockAsaasClient,
}));

jest.unstable_mockModule('../integrations/asaas/mapper.js', () => ({
  asaasMapper: mockAsaasMapper,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: mockLogger,
}));

const { asaasService } = await import('../integrations/asaas/service.js');

describe('asaasService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsaasClient.get.mockResolvedValue({ data: [] });

    mockAsaasMapper.mapAsaasPaymentToPixData.mockReturnValue({
      qrCode: 'data:image/png;base64,abc',
      pixCopyPaste: '000201...',
      expiresAt: '2026-04-30T23:59:00.000Z',
    });
  });

  it('normalizes brazilian phones to the national format accepted by Asaas', () => {
    expect(asaasService.normalizeBrazilPhone('(55) 99999-9999')).toBe('55999999999');
    expect(asaasService.normalizeBrazilPhone('+55 (83) 99999-9999')).toBe('83999999999');
    expect(asaasService.normalizeBrazilPhone('83999999999')).toBe('83999999999');
    expect(asaasService.normalizeBrazilPhone('123')).toBeNull();
  });

  it('builds Asaas customer payload with sanitized valid fields only and no empty fields', async () => {
    mockAsaasClient.post.mockResolvedValue({ id: 'cus_1' });

    await asaasService.createOrGetCustomer({
      barbershop: {
        id: 'tenant-asaas-1',
        name: 'Easy Barber Premium',
        email: 'tenant-premium@easybarber.local',
        whatsapp: '(11) 99888-7766',
        cpf_cnpj: '12.345.678/0001-95',
        metadata: {
          asaas: {
            notificationDisabled: true,
          },
        },
      },
      idempotencyKey: 'pix-checkout:test-1',
    });

    expect(mockAsaasClient.post).toHaveBeenCalledWith(
      '/customers',
      {
        name: 'Easy Barber Premium',
        cpfCnpj: '12345678000195',
        mobilePhone: '11998887766',
        externalReference: 'tenant-asaas-1',
        notificationDisabled: true,
      },
      {
        idempotencyKey: 'pix-checkout:test-1',
      }
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'asaas_customer_payload_prepared',
      }),
      'Payload de cliente Asaas preparado'
    );
  });

  it('removes empty optional fields from customer payload before sending to Asaas', async () => {
    mockAsaasClient.post.mockResolvedValue({ id: 'cus_no_empty_1' });

    await asaasService.createOrGetCustomer({
      barbershop: {
        id: 'tenant-empty-fields-1',
        owner_name: 'Pedro Lima',
        email: '   ',
        whatsapp: '(11) 97777-6666',
        cpf_cnpj: '12.345.678/0001-95',
      },
    });

    expect(mockAsaasClient.post).toHaveBeenCalledWith(
      '/customers',
      {
        name: 'Pedro Lima',
        cpfCnpj: '12345678000195',
        mobilePhone: '11977776666',
        externalReference: 'tenant-empty-fields-1',
      },
      {
        idempotencyKey: null,
      }
    );
  });

  it('accepts CPF with 11 digits for Pix customer payload', async () => {
    mockAsaasClient.post.mockResolvedValue({ id: 'cus_cpf_1' });

    await asaasService.createOrGetCustomer({
      barbershop: {
        id: 'tenant-asaas-cpf-1',
        owner_name: 'Maria Fernandes',
        email: 'maria@provedor.com.br',
        whatsapp: '(83) 98888-7777',
        cpf_cnpj: '705.960.904-04',
      },
    });

    expect(mockAsaasClient.post).toHaveBeenCalledWith(
      '/customers',
      {
        name: 'Maria Fernandes',
        cpfCnpj: '70596090404',
        mobilePhone: '83988887777',
        email: 'maria@provedor.com.br',
        externalReference: 'tenant-asaas-cpf-1',
      },
      {
        idempotencyKey: null,
      }
    );
  });

  it('rejects Pix customer creation when CPF/CNPJ is missing', async () => {
    await expect(
      asaasService.createOrGetCustomer({
        barbershop: {
          id: 'tenant-asaas-2',
          name: 'Barbearia Sem Documento',
          email: 'cliente@provedor.com.br',
          whatsapp: '(11) 98888-7766',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'CPF_CNPJ_REQUIRED',
      message: 'CPF/CNPJ obrigatório para pagamento via Pix.',
    });
  });

  it('rejects Pix customer creation when CPF/CNPJ has invalid length', async () => {
    await expect(
      asaasService.createOrGetCustomer({
        barbershop: {
          id: 'tenant-asaas-invalid-doc',
          name: 'Barbearia Documento Invalido',
          whatsapp: '(11) 99888-7766',
          cpf_cnpj: '1234567890',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_CPF_CNPJ',
      message: 'CPF/CNPJ inválido. Verifique os dados cadastrais.',
    });
  });

  it('rejects Pix customer creation when phone is missing', async () => {
    await expect(
      asaasService.createOrGetCustomer({
        barbershop: {
          id: 'tenant-asaas-missing-phone',
          name: 'Barbearia Sem Telefone',
          cpf_cnpj: '12.345.678/0001-95',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'MOBILE_PHONE_INVALID',
      message: 'Telefone/WhatsApp inválido. Verifique os dados cadastrais.',
    });
  });

  it('reuses existing customer found by externalReference without creating a new one', async () => {
    mockAsaasClient.get.mockResolvedValueOnce({
      data: [
        {
          id: 'cus_existing_1',
        },
      ],
    });
    mockAsaasClient.put.mockResolvedValue({ id: 'cus_existing_1' });

    const result = await asaasService.createOrGetCustomer({
      barbershop: {
        id: 'tenant-existing-1',
        owner_name: 'Joao da Silva',
        whatsapp: '(83) 99999-9999',
        cpf_cnpj: '12.345.678/0001-95',
      },
      idempotencyKey: 'pix-checkout:reuse-existing',
    });

    expect(mockAsaasClient.post).not.toHaveBeenCalled();
    expect(mockAsaasClient.put).toHaveBeenCalledWith(
      '/customers/cus_existing_1',
      expect.objectContaining({
        cpfCnpj: '12345678000195',
        mobilePhone: '83999999999',
      }),
      {
        idempotencyKey: 'pix-checkout:reuse-existing',
      }
    );
    expect(result).toEqual({ id: 'cus_existing_1' });
  });

  it('keeps Pix flow creating charge after customer creation succeeds', async () => {
    mockAsaasClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ encodedImage: 'qr-image', payload: 'pix-code' });

    mockAsaasClient.post
      .mockResolvedValueOnce({ id: 'cus_pix_1' })
      .mockResolvedValueOnce({ id: 'sub_pix_1' })
      .mockResolvedValueOnce({
        id: 'pay_pix_1',
        status: 'PENDING',
        dueDate: '2026-04-30',
        value: 99.9,
        customer: 'cus_pix_1',
        subscription: 'sub_pix_1',
      });

    const result = await asaasService.createPixSubscription({
      barbershop: {
        id: 'tenant-asaas-3',
        owner_name: 'Joao da Silva',
        email: 'tenant-premium@easybarber.local',
        cpf_cnpj: '12.345.678/0001-95',
        whatsapp: '+55 (83) 99999-9999',
      },
      plan: 'profissional',
      nextDueDate: '2026-04-30',
      idempotencyKey: 'pix-checkout:test-2',
    });

    expect(mockAsaasClient.post).toHaveBeenNthCalledWith(
      1,
      '/customers',
      {
        name: 'Joao da Silva',
        cpfCnpj: '12345678000195',
        mobilePhone: '83999999999',
        externalReference: 'tenant-asaas-3',
      },
      {
        idempotencyKey: 'pix-checkout:test-2',
      }
    );

    expect(mockAsaasClient.post).toHaveBeenNthCalledWith(
      2,
      '/subscriptions',
      expect.objectContaining({
        customer: 'cus_pix_1',
        billingType: 'PIX',
        cycle: 'MONTHLY',
      }),
      {
        idempotencyKey: 'pix-checkout:test-2',
      }
    );

    expect(mockAsaasClient.post).toHaveBeenNthCalledWith(
      3,
      '/payments',
      expect.objectContaining({
        customer: 'cus_pix_1',
        billingType: 'PIX',
        cpfCnpj: '12345678000195',
      }),
      {
        idempotencyKey: 'pix-checkout:test-2:fallback-payment',
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        customer: { id: 'cus_pix_1' },
        subscription: { id: 'sub_pix_1' },
        payment: expect.objectContaining({ id: 'pay_pix_1' }),
        pixData: expect.objectContaining({ pixCopyPaste: '000201...' }),
      })
    );
  });

  it('preserves Asaas 400 response body in internal error context and logs', async () => {
    const providerError = {
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          errors: [
            {
              code: 'invalid_email',
              description: 'E-mail inválido',
            },
          ],
        },
      },
    };

    mockAsaasClient.post.mockRejectedValue(providerError);

    await expect(
      asaasService.createOrGetCustomer({
        barbershop: {
          id: 'tenant-asaas-4',
          name: 'Barbearia Teste',
          email: 'cliente@provedor.com.br',
          whatsapp: '(83) 99999-1111',
          cpf_cnpj: '12.345.678/0001-95',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'ASAAS_CUSTOMER_CREATE_ERROR',
      providerStatus: 400,
      providerData: expect.objectContaining({
        method: 'POST',
        path: '/customers',
        statusCode: 400,
        payload: providerError.response.data,
        errors: providerError.response.data.errors,
      }),
      details: providerError.response.data,
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'asaas_customer_create_error',
        statusCode: 400,
        method: 'POST',
        path: '/customers',
        responseBody: providerError.response.data,
        responseErrors: providerError.response.data.errors,
      }),
      'Falha ao criar cliente Asaas'
    );
  });
});
