import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
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
    vi.clearAllMocks();
    process.env.EVOLUTION_API_URL = 'http://evolution.local';
    process.env.EVOLUTION_API_KEY = 'test-key';
    process.env.EVOLUTION_INSTANCE_NAME = 'easybarber';
    process.env.EVOLUTION_WEBHOOK_URL = 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert';
    process.env.EVOLUTION_WEBHOOK_EVENTS = 'MESSAGES_UPSERT, CONNECTION_UPDATE, MESSAGES_SET, chats-update';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ instance: { instanceName: 'easybarber' } }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('envia configuracao minima segura e filtra eventos pesados na criacao da instancia', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
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

    const [url, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const parsedBody = JSON.parse(requestInit.body as string);

    expect(url).toBe('http://evolution.local/instance/create');
    // Newer Evolution payload nests webhook config under a `webhook` object
    // instead of flat top-level fields.
    expect(parsedBody).toMatchObject({
      instanceName: 'easybarber',
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert',
        webhook_by_events: true,
        webhook_base64: false,
      },
    });
    expect(parsedBody.webhook.events).toEqual(['MESSAGES_UPSERT', 'CONNECTION_UPDATE']);
    expect(parsedBody.webhook.events).not.toContain('MESSAGES_SET');
  });

  it('reaplica webhook minimo seguro quando a instancia existente diverge da configuracao desejada', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
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

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('http://evolution.local/webhook/find/easybarber');
    expect(calls[1][0]).toBe('http://evolution.local/webhook/set/easybarber');

    const setWebhookBody = JSON.parse(calls[1][1].body as string);
    expect(setWebhookBody).toEqual({
      webhook: {
        enabled: true,
        url: 'https://api.easybarber.test/api/v1/whatsapp/webhook/messages-upsert',
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        webhook_by_events: true,
        webhook_base64: false,
      },
    });
  });
});
