import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryWithBackoff } from '../utils/retry.js';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds', async () => {
    const networkErr = Object.assign(new Error('network'), { code: 'ECONNRESET' });
    const fn = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce('ok');

    const promise = retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 404', async () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    const fn = vi.fn().mockRejectedValue(err);

    const promise = retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401', async () => {
    const err = Object.assign(new Error('unauthorized'), { status: 401 });
    const fn = vi.fn().mockRejectedValue(err);

    const promise = retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 502 status', async () => {
    const err = Object.assign(new Error('bad gateway'), { status: 502 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const promise = retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after maxAttempts exhausted', async () => {
    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    const fn = vi.fn().mockRejectedValue(err);

    const promise = retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom isRetryable predicate', async () => {
    const err = new Error('custom error');
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      isRetryable: () => true,
    });
    await vi.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
