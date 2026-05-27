import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { runWithRequestContext } from './requestContext.js';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  runWithRequestContext({ requestId: id }, () => next());
}
