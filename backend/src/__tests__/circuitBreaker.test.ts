import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker('test', 3, 1_000);
  });

  it('starts closed', () => {
    expect(cb.getState()).toBe('closed');
  });

  it('executes function successfully in closed state', async () => {
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe('closed');
  });

  it('opens after threshold consecutive failures', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow('boom');
    }
    expect(cb.getState()).toBe('open');
  });

  it('throws CIRCUIT_OPEN error when open', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    await expect(cb.execute(() => Promise.resolve(1))).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
  });

  it('transitions to half-open after recoveryMs', async () => {
    vi.useFakeTimers();
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.getState()).toBe('open');
    vi.advanceTimersByTime(1_001);
    expect(cb.getState()).toBe('half-open');
    vi.useRealTimers();
  });

  it('closes from half-open after successful probe', async () => {
    vi.useFakeTimers();
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    vi.advanceTimersByTime(1_001);
    expect(cb.getState()).toBe('half-open');
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('closed');
    vi.useRealTimers();
  });

  it('re-opens from half-open after failed probe', async () => {
    vi.useFakeTimers();
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    vi.advanceTimersByTime(1_001);
    await expect(cb.execute(fail)).rejects.toThrow('boom');
    expect(cb.getState()).toBe('open');
    vi.useRealTimers();
  });

  it('resets failures on success in closed state', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getStats().failures).toBe(0);
    expect(cb.getState()).toBe('closed');
  });

  it('reset() clears state', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getStats().failures).toBe(0);
  });

  it('getStats reflects current state', () => {
    const stats = cb.getStats();
    expect(stats).toMatchObject({ state: 'closed', failures: 0, openSince: null });
  });
});
