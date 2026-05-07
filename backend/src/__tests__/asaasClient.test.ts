import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  default: mockLogger,
}));

const {
  asaasClient,
  getAsaasApiKeyDiagnostics,
  normalizeAsaasApiKey,
} = await import('../integrations/asaas/client.js');

describe('asaasClient', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      ASAAS_API_KEY: 'aact_prod_test_key_123456',
      ASAAS_BASE_URL: 'https://api.asaas.com/v3',
      ASAAS_TIMEOUT_MS: '12000',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('sends the expected headers and preserves json error details from Asaas', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({
        'content-type': 'application/json',
        'x-request-id': 'req_asaas_1',
      }),
      text: async () =>
        JSON.stringify({
          errors: [
            {
              code: 'invalid_field',
              description: 'Campo inválido',
            },
          ],
        }),
    }) as unknown as typeof global.fetch;

    await expect(
      asaasClient.post(
        '/customers',
        {
          name: 'Itallo Gabriel',
          cpfCnpj: '70596090404',
          mobilePhone: '83996311811',
        },
        {
          idempotencyKey: 'pix-checkout:test-client-1',
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      response: {
        status: 400,
        data: {
          errors: [
            {
              code: 'invalid_field',
              description: 'Campo inválido',
            },
          ],
        },
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req_asaas_1',
        },
      },
      details: expect.objectContaining({
        payload: {
          errors: [
            {
              code: 'invalid_field',
              description: 'Campo inválido',
            },
          ],
        },
        requestBody: JSON.stringify({
          name: 'Itallo Gabriel',
          cpfCnpj: '70596090404',
          mobilePhone: '83996311811',
        }),
      }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      new URL('https://api.asaas.com/v3/customers'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          accept: 'application/json',
          'content-type': 'application/json',
          access_token: 'aact_prod_test_key_123456',
          'user-agent': 'EasyBarber/1.0',
        }),
        body: JSON.stringify({
          name: 'Itallo Gabriel',
          cpfCnpj: '70596090404',
          mobilePhone: '83996311811',
        }),
      })
    );
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers['Idempotency-Key']).toBeUndefined();
  });

  it('preserves empty raw response body as an empty string on edge 400 errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({
        'x-cache': 'Error from cloudfront',
      }),
      text: async () => '',
    }) as unknown as typeof global.fetch;

    await expect(
      asaasClient.post('/customers', {
        name: 'Cliente Teste',
        cpfCnpj: '70596090404',
        mobilePhone: '83999998888',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      response: {
        status: 400,
        data: null,
        headers: {
          'x-cache': 'Error from cloudfront',
        },
      },
      details: expect.objectContaining({
        payload: null,
        responseText: '',
        responseBodyRaw: '',
        responseJson: null,
      }),
    });
  });

  it('normalizes Asaas API key before sending access_token header', async () => {
    process.env.ASAAS_API_KEY = '  "Bearer $aact_prod_test_key_quoted"  ';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
      }),
      text: async () => JSON.stringify({ data: [] }),
    }) as unknown as typeof global.fetch;

    await asaasClient.get('/customers', {
      query: {
        cpfCnpj: '70596090404',
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      new URL('https://api.asaas.com/v3/customers?cpfCnpj=70596090404'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          access_token: '$aact_prod_test_key_quoted',
        }),
      })
    );
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('exposes safe Asaas API key diagnostics for boot logs', () => {
    expect(normalizeAsaasApiKey('  "$aact_prod_test_key_123456" ')).toBe(
      '$aact_prod_test_key_123456'
    );
    expect(getAsaasApiKeyDiagnostics('  "$aact_prod_test_key_123456" ')).toEqual({
      startsWithAact: true,
      startsWithDollar: true,
      hasWhitespace: true,
      length: '$aact_prod_test_key_123456'.length,
      maskedPrefix: '$aact_pr...3456',
    });
    expect(getAsaasApiKeyDiagnostics('$aact_prod_test_key_123456')).toEqual(
      expect.objectContaining({
        startsWithAact: true,
        startsWithDollar: true,
      })
    );
  });

  it('infers Asaas environment from keys that preserve the dollar prefix', async () => {
    process.env.ASAAS_API_KEY = '$aact_hmlg_test_key_123456';
    process.env.ASAAS_BASE_URL = 'https://api.asaas.com/v3';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
      }),
      text: async () => JSON.stringify({ data: [] }),
    }) as unknown as typeof global.fetch;

    await asaasClient.get('/customers');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ASAAS_ENVIRONMENT_MISMATCH',
        keyEnvironment: 'sandbox',
        urlEnvironment: 'production',
        maskedApiKey: '$aact_hm...3456',
      }),
      'Ambiente da chave Asaas difere da URL configurada'
    );
  });

  it('maps invalid_access_token to administrative configuration error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({
        'content-type': 'application/json',
        'x-request-id': 'req_invalid_token_1',
      }),
      text: async () =>
        JSON.stringify({
          errors: [
            {
              code: 'invalid_access_token',
              description: 'A chave de API fornecida é inválida',
            },
          ],
        }),
    }) as unknown as typeof global.fetch;

    await expect(asaasClient.get('/customers')).rejects.toThrow(
      'Configuração Asaas inválida. Verifique ASAAS_API_KEY no Render.'
    );
    await expect(asaasClient.get('/customers')).rejects.toMatchObject({
      statusCode: 503,
      code: 'ASAAS_INVALID_ACCESS_TOKEN',
      response: {
        status: 401,
        data: {
          errors: [
            {
              code: 'invalid_access_token',
              description: 'A chave de API fornecida é inválida',
            },
          ],
        },
      },
    });
  });

  it('preserves raw response text and headers when Asaas returns non-json errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({
        'content-type': 'text/plain',
        server: 'asaas-edge',
      }),
      text: async () => 'Bad Request',
    }) as unknown as typeof global.fetch;

    await expect(
      asaasClient.post('/customers', { name: 'Cliente Teste', cpfCnpj: '70596090404' })
    ).rejects.toMatchObject({
      statusCode: 400,
      response: {
        status: 400,
        data: {
          rawBody: 'Bad Request',
        },
        headers: {
          'content-type': 'text/plain',
          server: 'asaas-edge',
        },
      },
      details: expect.objectContaining({
        payload: {
          rawBody: 'Bad Request',
        },
        responseText: 'Bad Request',
        responseHeaders: {
          'content-type': 'text/plain',
          server: 'asaas-edge',
        },
      }),
    });
  });

  it('normalizes axios-like errors preserving json payload and responseText', async () => {
    global.fetch = vi.fn().mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req_asaas_axios_1',
        },
        data: {
          errors: [
            {
              code: 'invalid_cpf',
              description: 'CPF inválido',
            },
          ],
        },
      },
    }) as unknown as typeof global.fetch;

    await expect(
      asaasClient.post('/customers', {
        name: 'Cliente Teste',
        cpfCnpj: '12345678901',
        mobilePhone: '83999998888',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      response: {
        status: 400,
        data: {
          errors: [
            {
              code: 'invalid_cpf',
              description: 'CPF inválido',
            },
          ],
        },
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req_asaas_axios_1',
        },
      },
      details: expect.objectContaining({
        payload: {
          errors: [
            {
              code: 'invalid_cpf',
              description: 'CPF inválido',
            },
          ],
        },
        responseText: JSON.stringify({
          errors: [
            {
              code: 'invalid_cpf',
              description: 'CPF inválido',
            },
          ],
        }),
      }),
    });
  });
});
