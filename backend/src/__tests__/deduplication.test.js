/**
 * deduplication.test.js
 */

import { jest } from '@jest/globals';
import { MessageDeduplicator, deduplicator } from '../services/whatsapp/utils/deduplication.js';

describe('MessageDeduplicator', () => {
  let dup;

  beforeEach(() => {
    dup = new MessageDeduplicator(500); // 500ms TTL for fast tests
  });

  // ── Basic behaviour ─────────────────────────────────────────────────────────

  it('isDuplicate returns false for unseen id', () => {
    expect(dup.isDuplicate('msg-1')).toBe(false);
  });

  it('isDuplicate returns true after markSeen', () => {
    dup.markSeen('msg-1');
    expect(dup.isDuplicate('msg-1')).toBe(true);
  });

  it('different ids are independent', () => {
    dup.markSeen('msg-1');
    expect(dup.isDuplicate('msg-2')).toBe(false);
  });

  it('markSeen twice does not change isDuplicate result', () => {
    dup.markSeen('msg-1');
    dup.markSeen('msg-1');
    expect(dup.isDuplicate('msg-1')).toBe(true);
  });

  // ── TTL expiry ──────────────────────────────────────────────────────────────

  it('isDuplicate returns false after TTL expires', async () => {
    dup.markSeen('msg-ttl');
    expect(dup.isDuplicate('msg-ttl')).toBe(true);
    await new Promise((r) => setTimeout(r, 520));
    expect(dup.isDuplicate('msg-ttl')).toBe(false);
  });

  // ── Null / empty guards ─────────────────────────────────────────────────────

  it('isDuplicate(null) returns false', () => {
    expect(dup.isDuplicate(null)).toBe(false);
  });

  it('isDuplicate(undefined) returns false', () => {
    expect(dup.isDuplicate(undefined)).toBe(false);
  });

  it('isDuplicate("") returns false', () => {
    expect(dup.isDuplicate('')).toBe(false);
  });

  it('markSeen(null) is a no-op', () => {
    expect(() => dup.markSeen(null)).not.toThrow();
    expect(dup.size).toBe(0);
  });

  // ── _cleanup ────────────────────────────────────────────────────────────────

  it('_cleanup removes expired entries', async () => {
    dup.markSeen('msg-a');
    dup.markSeen('msg-b');
    await new Promise((r) => setTimeout(r, 520));
    dup.markSeen('msg-c'); // still fresh
    dup._cleanup();
    // msg-a and msg-b expired; msg-c still live
    expect(dup.isDuplicate('msg-a')).toBe(false);
    expect(dup.isDuplicate('msg-b')).toBe(false);
    expect(dup.isDuplicate('msg-c')).toBe(true);
  });

  it('_cleanup triggers automatically at 1000 markSeen calls', () => {
    const cleanupSpy = jest.spyOn(dup, '_cleanup');
    for (let i = 0; i < 1000; i++) dup.markSeen(`msg-${i}`);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  // ── size ────────────────────────────────────────────────────────────────────

  it('size reflects store count', () => {
    expect(dup.size).toBe(0);
    dup.markSeen('a');
    dup.markSeen('b');
    expect(dup.size).toBe(2);
  });
});

// ── Singleton export ─────────────────────────────────────────────────────────

describe('deduplicator singleton', () => {
  it('is a MessageDeduplicator instance', () => {
    expect(deduplicator).toBeInstanceOf(MessageDeduplicator);
  });

  it('default TTL is 5 minutes', () => {
    expect(deduplicator._ttlMs).toBe(300_000);
  });
});
