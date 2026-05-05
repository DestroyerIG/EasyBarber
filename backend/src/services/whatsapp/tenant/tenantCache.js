/**
 * tenantCache.js — Cache em memória com TTL para dados de tenant por instanceName.
 *
 * TTL padrão: 60s. Entradas expiradas são removidas lazily no get e periodicamente
 * no _cleanup (chamado a cada 500 escritas).
 * TODO: substituir por Redis para ambientes multi-pod.
 */

const DEFAULT_TTL_MS = 60_000;

const _store = new Map();      // key → { value, expiresAt }
let _writeCount = 0;

const _cleanup = () => {
  const now = Date.now();
  for (const [key, entry] of _store.entries()) {
    if (now > entry.expiresAt) _store.delete(key);
  }
};

/**
 * Returns cached tenant or undefined if missing/expired.
 * @param {string} key  instanceName
 * @returns {object|undefined}
 */
export const getTenant = (key) => {
  if (!key) return undefined;
  const entry = _store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _store.delete(key);
    return undefined;
  }
  return entry.value;
};

/**
 * Stores tenant data under key with TTL.
 * @param {string} key
 * @param {object} value
 * @param {number} [ttlMs]
 */
export const setTenant = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  if (!key) return;
  _store.set(key, { value, expiresAt: Date.now() + ttlMs });
  _writeCount += 1;
  if (_writeCount >= 500) {
    _cleanup();
    _writeCount = 0;
  }
};

/**
 * Removes a single entry from cache (e.g. on disconnect/logout).
 * @param {string} key
 */
export const invalidateTenant = (key) => {
  if (!key) return;
  _store.delete(key);
};

/** Number of entries currently in store (includes potentially expired). For debug. */
export const cacheSize = () => _store.size;
