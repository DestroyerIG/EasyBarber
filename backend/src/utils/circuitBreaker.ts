import logger from './logger.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  openSince: number | null;
  lastFailureAt: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private openSince: number | null = null;
  private lastFailureAt: number | null = null;

  constructor(
    private readonly name: string,
    private readonly threshold = 5,
    private readonly recoveryMs = 60_000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkTransition();

    if (this.state === 'open') {
      const err = new Error(`Circuit breaker [${this.name}] is OPEN — requests blocked`);
      (err as unknown as Record<string, unknown>)['code'] = 'CIRCUIT_OPEN';
      throw err;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  getState(): CircuitState {
    this.checkTransition();
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    this.checkTransition();
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      openSince: this.openSince,
      lastFailureAt: this.lastFailureAt,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.openSince = null;
    this.lastFailureAt = null;
  }

  private checkTransition(): void {
    if (this.state === 'open' && this.openSince !== null) {
      if (Date.now() - this.openSince >= this.recoveryMs) {
        this.state = 'half-open';
        logger.info({ name: this.name }, 'CircuitBreaker: transitioning to half-open');
      }
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
      this.successes = 0;
      this.openSince = null;
      logger.info({ name: this.name }, 'CircuitBreaker: closed after half-open probe succeeded');
      return;
    }
    this.failures = 0;
    this.successes++;
  }

  private onFailure(err: unknown): void {
    this.lastFailureAt = Date.now();
    this.failures++;

    if (this.state === 'half-open') {
      this.state = 'open';
      this.openSince = Date.now();
      logger.warn({ name: this.name, err }, 'CircuitBreaker: re-opened after half-open probe failed');
      return;
    }

    if (this.state === 'closed' && this.failures >= this.threshold) {
      this.state = 'open';
      this.openSince = Date.now();
      logger.warn(
        { name: this.name, failures: this.failures, threshold: this.threshold },
        'CircuitBreaker: OPENED due to consecutive failures',
      );
    }
  }
}

export const evolutionCircuitBreaker = new CircuitBreaker('evolution-api', 5, 60_000);
