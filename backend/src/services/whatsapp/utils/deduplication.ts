/**
 * deduplication.ts — Deduplicação de mensagens WhatsApp por messageId.
 *
 * Usa Map em memória com TTL por entrada.
 * _cleanup() é chamado a cada 1000 markSeen para evitar crescimento ilimitado.
 * TODO: substituir por Redis (SET NX EX) para deduplicação entre múltiplos pods.
 */

export class MessageDeduplicator {
  private readonly _ttlMs: number;
  private readonly _store: Map<string, number>;
  private _markCount: number;

  /**
   * @param ttlMs  Tempo de vida de cada entrada em ms (padrão: 5 min)
   */
  constructor(ttlMs: number = 300_000) {
    this._ttlMs = ttlMs;
    this._store = new Map();
    this._markCount = 0;
  }

  /**
   * Returns true if messageId was already seen and is still within TTL.
   */
  isDuplicate(messageId: string | null): boolean {
    if (!messageId) return false;
    const expiresAt = this._store.get(messageId);
    if (expiresAt === undefined) return false;
    if (Date.now() > expiresAt) {
      this._store.delete(messageId);
      return false;
    }
    return true;
  }

  /**
   * Marks messageId as seen. No-op for null/empty ids.
   */
  markSeen(messageId: string | null): void {
    if (!messageId) return;
    this._store.set(messageId, Date.now() + this._ttlMs);
    this._markCount += 1;
    if (this._markCount >= 1000) {
      this._cleanup();
      this._markCount = 0;
    }
  }

  /**
   * Removes all expired entries from the store.
   * Called automatically every 1000 markSeen calls.
   */
  private _cleanup(): void {
    const now = Date.now();
    for (const [id, expiresAt] of this._store.entries()) {
      if (now > expiresAt) this._store.delete(id);
    }
  }

  /** Number of live (non-expired) entries. For testing/health checks. */
  get size(): number {
    return this._store.size;
  }
}

/** Singleton — use this instance throughout the application. */
export const deduplicator = new MessageDeduplicator();
