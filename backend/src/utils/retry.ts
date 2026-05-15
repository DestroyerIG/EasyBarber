import logger from './logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
  operationName?: string;
}

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH']);
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 410, 422]);

const defaultIsRetryable = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;

  if (typeof e['status'] === 'number') {
    if (NON_RETRYABLE_STATUSES.has(e['status'] as number)) return false;
    if (RETRYABLE_STATUSES.has(e['status'] as number)) return true;
  }

  if (typeof e['code'] === 'string' && RETRYABLE_CODES.has(e['code'])) return true;

  const msg = typeof e['message'] === 'string' ? e['message'].toLowerCase() : '';
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) return true;

  return false;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const {
    maxAttempts = 3,
    baseDelayMs = 1_000,
    isRetryable = defaultIsRetryable,
    operationName = 'operation',
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts || !isRetryable(err)) {
        throw err;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(
        { operationName, attempt, maxAttempts, delayMs },
        'retryWithBackoff: retrying after transient error',
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
};
