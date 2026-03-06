/**
 * Setup global para testes — mocka dependencias externas (DB, WhatsApp, cron).
 */

import { jest } from '@jest/globals';

// Mock do pool de banco de dados
export const mockPool = {
  query: jest.fn(),
  end: jest.fn(),
  connect: jest.fn(),
};

// Mock do logger (silenciar logs durante testes)
export const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
};
