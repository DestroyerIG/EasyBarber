/**
 * evolutionClient.js — Cliente HTTP para a Evolution API.
 *
 * Nunca lança exceção para cima — todos os métodos retornam { ok, data?, error? }.
 * Retry: 2 tentativas com delay de 1s entre elas.
 * Timeout: 10s por requisição.
 */

import logger from '../../../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchWithTimeout = async (url, options, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// ── EvolutionClient ───────────────────────────────────────────────────────────

export class EvolutionClient {
  /**
   * @param {{ baseUrl: string, apiKey: string }} config
   */
  constructor({ baseUrl, apiKey }) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._apiKey = apiKey;
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      apikey: this._apiKey,
    };
  }

  async _request(method, path, body = null, attempt = 1) {
    const url = `${this._baseUrl}${path}`;
    const options = {
      method,
      headers: this._headers(),
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    };

    try {
      const res = await fetchWithTimeout(url, options);
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { data = text; }

      if (!res.ok) {
        logger.warn(
          { method, path, status: res.status, attempt },
          'evolutionClient: HTTP error',
        );
        return { ok: false, status: res.status, error: data };
      }

      return { ok: true, status: res.status, data };
    } catch (err) {
      const isAbort = err?.name === 'AbortError';
      logger.warn(
        { method, path, attempt, timeout: isAbort },
        `evolutionClient: request failed — ${err?.message}`,
      );

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        return this._request(method, path, body, attempt + 1);
      }

      return { ok: false, error: err?.message ?? 'unknown', timedOut: isAbort };
    }
  }

  /**
   * Sends a text message via Evolution API.
   * POST /message/sendText/{instanceName}
   *
   * @param {{ instanceName: string, to: string, text: string }} params
   * @returns {Promise<{ ok: boolean, data?: object, error?: any }>}
   */
  async sendText({ instanceName, to, text }) {
    if (!instanceName || !to || !text) {
      return { ok: false, error: 'missing required params: instanceName, to, text' };
    }
    return this._request('POST', `/message/sendText/${instanceName}`, {
      number: to,
      text,
    });
  }

  /**
   * Gets the connection state of an instance.
   * GET /instance/connectionState/{instanceName}
   *
   * @param {string} instanceName
   * @returns {Promise<{ ok: boolean, data?: object, error?: any }>}
   */
  async getInstanceStatus(instanceName) {
    if (!instanceName) return { ok: false, error: 'instanceName required' };
    return this._request('GET', `/instance/connectionState/${instanceName}`);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates an EvolutionClient from environment variables.
 * Throws if EVOLUTION_API_URL or EVOLUTION_API_KEY are not set.
 * @returns {EvolutionClient}
 */
export const createEvolutionClient = () => {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl) throw new Error('EVOLUTION_API_URL environment variable is not set');
  if (!apiKey) throw new Error('EVOLUTION_API_KEY environment variable is not set');

  return new EvolutionClient({ baseUrl, apiKey });
};
