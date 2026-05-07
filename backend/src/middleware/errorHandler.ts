import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import type { Request, Response, NextFunction } from 'express';

interface PayloadTooLargeError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
  limit?: number;
  length?: number;
}

interface ExtendedAppError extends AppError {
  providerStatus?: unknown;
  providerData?: unknown;
  providerHeaders?: unknown;
  requiredPlan?: string;
  subscriptionStatus?: string;
  feature?: string;
  reason?: string;
  upgradeRequired?: boolean;
  billingActionRequired?: boolean;
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isDebugEnvironment = process.env.NODE_ENV !== 'production';
  const error = err as PayloadTooLargeError & ExtendedAppError & { issues?: unknown[]; errors?: unknown[] };

  if (error?.type === 'entity.too.large' || error?.status === 413 || error?.statusCode === 413) {
    logger.warn(
      {
        type: error?.type,
        statusCode: error?.statusCode ?? error?.status,
        path: req.path,
        requestId: req.requestId,
        limit: error?.limit,
        length: error?.length,
      },
      'Payload excede o limite permitido'
    );
    res.status(413).json({
      success: false,
      message: 'Payload muito grande',
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Payload excede o limite permitido para este endpoint',
      },
    });
    return;
  }

  if (err instanceof ZodError || error?.issues) {
    const items = (error?.issues ?? error?.errors ?? []) as Array<{ path?: unknown[]; message: string }>;
    const details = items.map((e) => {
      const path =
        Array.isArray(e.path) && e.path.length > 0 ? `${e.path.join('.')}: ` : '';
      return `${path}${e.message}`;
    });
    res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details },
    });
    return;
  }

  if (err instanceof AppError) {
    const appErr = err as ExtendedAppError;
    logger.warn(
      {
        code: appErr.code,
        statusCode: appErr.statusCode,
        providerStatus: appErr.providerStatus,
        providerData: appErr.providerData,
        providerHeaders: appErr.providerHeaders,
        path: req.path,
        requestId: req.requestId,
        barbershopId: req.user?.barbershopId,
      },
      appErr.message
    );

    const body: Record<string, unknown> = {
      success: false,
      message: appErr.message,
      error: { code: appErr.code, message: appErr.message },
    };
    const errBody = body['error'] as Record<string, unknown>;
    if (appErr.details) errBody['details'] = appErr.details;
    if (isDebugEnvironment && appErr.providerStatus) errBody['providerStatus'] = appErr.providerStatus;
    if (isDebugEnvironment && appErr.providerData) errBody['providerData'] = appErr.providerData;
    if (isDebugEnvironment && appErr.providerHeaders) errBody['providerHeaders'] = appErr.providerHeaders;
    if (appErr.requiredPlan) errBody['requiredPlan'] = appErr.requiredPlan;
    if (appErr.subscriptionStatus) errBody['subscriptionStatus'] = appErr.subscriptionStatus;
    if (appErr.feature) errBody['feature'] = appErr.feature;
    if (appErr.reason) errBody['reason'] = appErr.reason;
    if (typeof appErr.upgradeRequired === 'boolean') errBody['upgradeRequired'] = appErr.upgradeRequired;
    if (typeof appErr.billingActionRequired === 'boolean') errBody['billingActionRequired'] = appErr.billingActionRequired;

    res.status(appErr.statusCode).json(body);
    return;
  }

  logger.error(
    { err, path: req.path, method: req.method, requestId: req.requestId, barbershopId: req.user?.barbershopId },
    'Erro interno não tratado'
  );

  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
  });
};
