import type { Request, Response, NextFunction } from 'express';

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const XSS_SCRIPT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const XSS_EVENT_HANDLER_RE = /\bon\w+\s*=/gi;
const XSS_PROTOCOL_RE = /\b(javascript|vbscript|data)\s*:/gi;

function hasPollutionKey(val: unknown): boolean {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return false;
  for (const key of Object.keys(val as Record<string, unknown>)) {
    if (POLLUTION_KEYS.has(key)) return true;
    if (hasPollutionKey((val as Record<string, unknown>)[key])) return true;
  }
  return false;
}

function sanitizeValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return val
      .replace(XSS_SCRIPT_RE, '')
      .replace(XSS_EVENT_HANDLER_RE, '')
      .replace(XSS_PROTOCOL_RE, '')
      .trim();
  }
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return val;
}

export function sanitizeMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.body && hasPollutionKey(req.body)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'Payload inválido.' },
    });
    return;
  }
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query) as typeof req.query;
  next();
}
