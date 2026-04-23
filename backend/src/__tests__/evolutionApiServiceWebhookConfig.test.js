import { jest, describe, it, beforeEach, afterEach, expect } from '@jest/globals';

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
}));

const {
  createInstance,
  ensureInstanceWebhookConfig,
} = await import('../services/evolutionApiService.js');

describe('evolutionApiService webhook configuration', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EVOLUTION_API_URL = 'http://evolution.local';
    process.env.EVOLUTION_API_KEY = 'test-key';
    process.env.EVOLUTION_INSTANCE_NAME = 'easybarber';
    process.env.EVOLUTION_WEBHOOK_URL = 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert';
    process.env.EVOLUTION_WEBHOOK_EVENTS = 'MESSAGES_UPSERT, CONNECTION_UPDATE, MESSAGES_SET, chats-update';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ instance: { instanceName: 'easybarber' } }),
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('envia configuracao minima segura e filtra eventos pesados na criacao da instancia', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ instance: { instanceName: 'easybarber' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          enabled: true,
          url: 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert',
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          webhook_by_events: true,
          webhook_base64: false,
        }),
      });

    await createInstance({ instanceName: 'easybarber' });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    const [url, requestInit] = global.fetch.mock.calls[0];
    const parsedBody = JSON.parse(requestInit.body);

    expect(url).toBe('http://evolution.local/instance/create');
    expect(parsedBody).toMatchObject({
      instanceName: 'easybarber',
      integration: 'WHATSAPP-BAILEYS',
      webhook: 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert',
      webhook_by_events: true,
      webhook_base64: false,
    });
    expect(parsedBody.webhook_events).toEqual(['MESSAGES_UPSERT', 'CONNECTION_UPDATE']);
    expect(parsedBody.webhook_events).not.toContain('MESSAGES_SET');
  });

  it('reaplica webhook minimo seguro quando a instancia existente diverge da configuracao desejada', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          enabled: true,
          url: 'https://old.example.com/webhook',
          events: ['MESSAGES_SET', 'MESSAGES_UPSERT'],
          webhook_by_events: false,
          webhook_base64: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({
          webhook: {
            instanceName: 'easybarber',
            webhook: {
              url: 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert',
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
              enabled: true,
              webhook_by_events: true,
              webhook_base64: false,
            },
          },
        }),
      });

    const result = await ensureInstanceWebhookConfig({ instanceName: 'easybarber' });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        reapplied: true,
      })
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('http://evolution.local/webhook/find/easybarber');
    expect(global.fetch.mock.calls[1][0]).toBe('http://evolution.local/webhook/set/easybarber');

    const setWebhookBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(setWebhookBody).toEqual({
      url: 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert',
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      webhook_by_events: true,
      webhook_base64: false,
    });
  });
});
