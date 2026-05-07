/**
 * Setup global para testes — mocka dependencias externas (DB, WhatsApp, cron).
 */

import { vi } from 'vitest';

// Mock do pool de banco de dados
export const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
};

// Mock do logger (silenciar logs durante testes)
export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
};
