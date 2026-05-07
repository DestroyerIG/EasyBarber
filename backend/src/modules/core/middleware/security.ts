import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Application, Request } from 'express';

export function applySecurityMiddleware(app: Application): void {
  // Replace basic helmet with hardened config
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    })
  );

  // Per-tenant rate limit (keyed by barbershopId from JWT, falls back to IP)
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        const user = (req as Request & { user?: { barbershopId?: string } }).user;
        return user?.barbershopId ?? req.ip ?? 'unknown';
      },
      skip: (req: Request) =>
        req.method === 'OPTIONS' ||
        req.originalUrl.includes('/webhook'),
      message: {
        success: false,
        error: { code: 'RATE_LIMIT_TENANT', message: 'Limite de requisições por tenant excedido.' },
      },
    })
  );
}
