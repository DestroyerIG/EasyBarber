/**
 * tenantCache.ts — Cache em memória com TTL para dados de tenant por instanceName.
 *
 * TTL padrão: 60s. Entradas expiradas são removidas lazily no get e periodicamente
 * no _cleanup (chamado a cada 500 escritas).
 * TODO: substituir por Redis para ambientes multi-pod.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

const _store = new Map<string, CacheEntry<unknown>>();
let _writeCount = 0;

const _cleanup = (): void => {
  const now = Date.now();
  for (const [key, entry] of _store.entries()) {
    if (now > entry.expiresAt) _store.delete(key);
  }
};

/**
 * Returns cached tenant or undefined if missing/expired.
 * @param key  instanceName
 */
export const getTenant = <T = unknown>(key: string): T | undefined => {
  if (!key) return undefined;
  const entry = _store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _store.delete(key);
    return undefined;
  }
  return entry.value;
};

/**
 * Stores tenant data under key with TTL.
 */
export const setTenant = <T = unknown>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void => {
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
 */
export const invalidateTenant = (key: string): void => {
  if (!key) return;
  _store.delete(key);
};

/** Number of entries currently in store (includes potentially expired). For debug. */
export const cacheSize = (): number => _store.size;
