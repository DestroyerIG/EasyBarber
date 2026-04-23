import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
};

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: mockLogger,
}));

const { asaasClient } = await import('../integrations/asaas/client.js');

describe('asaasClient', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ASAAS_API_KEY: '$aact_prod_test_key_123456',
      ASAAS_BASE_URL: 'https://api.asaas.com/v3',
      ASAAS_TIMEOUT_MS: '12000',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('sends the expected headers and preserves json error details from Asaas', async () => {
    global.fetch = jest.fn().mockResolvedValue({
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
    });

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
          access_token: '$aact_prod_test_key_123456',
          'user-agent': 'EasyBarber/1.0',
          'idempotency-key': 'pix-checkout:test-client-1',
          'Idempotency-Key': 'pix-checkout:test-client-1',
        }),
        body: JSON.stringify({
          name: 'Itallo Gabriel',
          cpfCnpj: '70596090404',
          mobilePhone: '83996311811',
        }),
      })
    );
  });

  it('preserves raw response text and headers when Asaas returns non-json errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({
        'content-type': 'text/plain',
        server: 'asaas-edge',
      }),
      text: async () => 'Bad Request',
    });

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
        responseText: 'Bad Request',
        responseHeaders: {
          'content-type': 'text/plain',
          server: 'asaas-edge',
        },
      }),
    });
  });
});
