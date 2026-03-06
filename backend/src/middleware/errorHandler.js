import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Error handler global — DEVE ser o último middleware registrado.
 * Trata erros operacionais (AppError) com resposta limpa,
 * e erros inesperados com log de stack trace completo.
 */
export const errorHandler = (err, req, res, _next) => {
  // Erros de validação Zod (compatível com Zod 3 e 4)
  if (err instanceof ZodError || err.issues) {
    const items = err.issues || err.errors || [];
    const details = items.map((e) => {
      const path = Array.isArray(e.path) && e.path.length > 0 ? `${e.path.join('.')}: ` : '';
      return `${path}${e.message}`;
    });
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details,
      },
    });
  }

  // Erros operacionais (esperados)
  if (err instanceof AppError) {
    logger.warn(
      { code: err.code, statusCode: err.statusCode, path: req.path, requestId: req.id, barbershopId: req.user?.barbershopId },
      err.message
    );

    const body = {
      success: false,
      message: err.message,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.details) body.error.details = err.details;
    if (err.requiredPlan) body.error.requiredPlan = err.requiredPlan;
    return res.status(err.statusCode).json(body);
  }

  // Erros inesperados (bugs) — logar stack, retornar mensagem genérica
  logger.error(
    { err, path: req.path, method: req.method, requestId: req.id, barbershopId: req.user?.barbershopId },
    'Erro interno não tratado'
  );

  return res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    },
  });
};
