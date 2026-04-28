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
    mockAsaasClient.get.mockReset();
    mockAsaasClient.post.mockReset();
    mockAsaasClient.put.mockReset();
    mockAsaasClient.delete.mockReset();
    mockAsaasMapper.mapAsaasPaymentToPixData.mockReset();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.fatal.mockClear();
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

  it('reuses customer already saved in database without calling Asaas', async () => {
    const onCustomerResolved = jest.fn();

    const result = await asaasService.createOrGetCustomer({
      barbershop: {
        id: 'tenant-saved-1',
        asaas_customer_id: 'cus_saved_1',
        owner_name: 'Joao da Silva',
        whatsapp: '(83) 99999-9999',
        cpf_cnpj: '12.345.678/0001-95',
      },
      onCustomerResolved,
    });

    expect(mockAsaasClient.get).not.toHaveBeenCalled();
    expect(mockAsaasClient.post).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'cus_saved_1' });
    expect(onCustomerResolved).toHaveBeenCalledWith('cus_saved_1', {
      source: 'db',
      barbershopId: 'tenant-saved-1',
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'asaas_customer_reuse_from_db',
        customerId: 'cus_saved_1',
      }),
      'Customer Asaas reutilizado a partir do banco'
    );
  });

  it('reuses existing customer found by cpfCnpj before creating', async () => {
    mockAsaasClient.get.mockResolvedValueOnce({
      data: [
        {
          id: 'cus_existing_1',
        },
      ],
    });
    const onCustomerResolved = jest.fn();

    const result = await asaasService.createOrGetCustomer({
      barbershop: {
        id: 'tenant-existing-1',
        owner_name: 'Joao da Silva',
        whatsapp: '(83) 99999-9999',
        cpf_cnpj: '12.345.678/0001-95',
      },
      idempotencyKey: 'pix-checkout:reuse-existing',
      onCustomerResolved,
    });

    expect(mockAsaasClient.get).toHaveBeenCalledWith('/customers', {
      query: {
        cpfCnpj: '12345678000195',
        limit: 1,
        offset: 0,
      },
    });
    expect(mockAsaasClient.post).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'cus_existing_1' });
    expect(onCustomerResolved).toHaveBeenCalledWith('cus_existing_1', {
      source: 'asaas_lookup_before_create',
      barbershopId: 'tenant-existing-1',
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'asaas_customer_reuse_from_asaas_by_cpfcnpj',
        customerId: 'cus_existing_1',
      }),
      'Customer Asaas localizado por CPF/CNPJ'
    );
  });

  it('keeps Pix flow creating charge after customer creation succeeds', async () => {
    mockAsaasClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ encodedImage: 'qr-image', payload: 'pix-code' });

    mockAsaasClient.post
      .mockResolvedValueOnce({ id: 'cus_pix_1' })
      .mockResolvedValueOnce({
        id: 'pay_pix_1',
        status: 'PENDING',
        dueDate: '2026-04-30',
        value: 99.9,
        customer: 'cus_pix_1',
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
      }
    );

    expect(mockAsaasClient.post).toHaveBeenNthCalledWith(
      2,
      '/payments',
      {
        customer: 'cus_pix_1',
        billingType: 'PIX',
        value: 99.9,
        dueDate: '2026-04-30',
        description: 'EasyBarber - Plano profissional (Barbearia)',
        externalReference: 'barbershop:tenant-asaas-3:plan:profissional',
      },
      {
        idempotencyKey: 'pix-checkout:test-2',
      }
    );

    expect(mockAsaasClient.post).toHaveBeenCalledTimes(2);

    expect(result).toEqual(
      expect.objectContaining({
        customer: { id: 'cus_pix_1' },
        subscription: null,
        payment: expect.objectContaining({ id: 'pay_pix_1' }),
        pixData: expect.objectContaining({ pixCopyPaste: '000201...' }),
      })
    );
  });

  it('recovers customer by cpfCnpj after POST /customers returns 400', async () => {
    const providerError = {
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: null,
        headers: {
          'x-request-id': 'asaas-request-1',
        },
      },
    };
    const onCustomerResolved = jest.fn();

    mockAsaasClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'cus_recovered_1' }] });
    mockAsaasClient.post.mockRejectedValue(providerError);

    const result = await asaasService.createOrGetCustomer({
      barbershop: {
        id: 'tenant-asaas-recovered',
        owner_name: 'Maria Fernandes',
        email: 'maria@provedor.com.br',
        whatsapp: '(83) 98888-7777',
        cpf_cnpj: '705.960.904-04',
      },
      onCustomerResolved,
    });

    expect(result).toEqual({ id: 'cus_recovered_1' });
    expect(mockAsaasClient.get).toHaveBeenCalledTimes(2);
    expect(onCustomerResolved).toHaveBeenCalledWith('cus_recovered_1', {
      source: 'asaas_lookup_after_create_error',
      barbershopId: 'tenant-asaas-recovered',
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'asaas_customer_recovered_after_create_error',
        customerId: 'cus_recovered_1',
      }),
      'Customer Asaas recuperado apos falha no create'
    );
  });

  it('returns controlled ASAAS_CUSTOMER_CREATE_ERROR when POST /customers 400 fallback finds nothing', async () => {
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

    mockAsaasClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
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
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'asaas_customer_failed_after_fallback',
        statusCode: 400,
        method: 'POST',
        path: '/customers',
      }),
      'Falha definitiva ao resolver customer Asaas apos fallback'
    );
  });

  it('blocks invalid CPF before calling Asaas', async () => {
    await expect(
      asaasService.createOrGetCustomer({
        barbershop: {
          id: 'tenant-invalid-cpf',
          owner_name: 'Cliente CPF Invalido',
          whatsapp: '(83) 99999-1111',
          cpf_cnpj: '705.960.904-05',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_CPF_CNPJ',
      message: 'CPF/CNPJ inválido. Verifique os dados cadastrais.',
    });

    expect(mockAsaasClient.get).not.toHaveBeenCalled();
    expect(mockAsaasClient.post).not.toHaveBeenCalled();
  });

  it('blocks invalid phone before calling Asaas', async () => {
    await expect(
      asaasService.createOrGetCustomer({
        barbershop: {
          id: 'tenant-invalid-phone',
          owner_name: 'Cliente Telefone Invalido',
          whatsapp: '12345',
          cpf_cnpj: '705.960.904-04',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'MOBILE_PHONE_INVALID',
      message: 'Telefone/WhatsApp inválido. Verifique os dados cadastrais.',
    });

    expect(mockAsaasClient.get).not.toHaveBeenCalled();
    expect(mockAsaasClient.post).not.toHaveBeenCalled();
  });
});
