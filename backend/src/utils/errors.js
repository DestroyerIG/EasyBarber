/**
 * Hierarquia de erros da aplicação.
 * Todos os erros operacionais estendem AppError, permitindo
 * distingui-los de erros de programação no error handler global.
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} não encontrado`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito de dados') {
    super(message, 409, 'CONFLICT');
  }
}

export class PlanLimitError extends AppError {
  constructor(requiredPlan) {
    super(
      `Esta funcionalidade requer o plano ${requiredPlan} ou superior`,
      403,
      'PLAN_LIMIT'
    );
    this.requiredPlan = requiredPlan;
  }
}
