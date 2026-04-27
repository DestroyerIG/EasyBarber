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

export class FeatureAccessError extends AppError {
  constructor(feature, decision = {}) {
    const statusCode = decision.billingActionRequired ? 402 : 403;
    const message = decision.message || 'Esta funcionalidade está indisponível para a sua assinatura.';

    super(message, statusCode, 'FEATURE_BLOCKED');

    this.feature = feature;
    this.reason = decision.reason || 'subscription_status_restricted';
    this.requiredPlan = decision.requiredPlan || null;
    this.subscriptionStatus = decision.subscriptionStatus || null;
    this.upgradeRequired = Boolean(decision.upgradeRequired);
    this.billingActionRequired = Boolean(decision.billingActionRequired);
  }
}

export class BillingError extends AppError {
  constructor(message = 'Erro ao processar cobrança', statusCode = 502, code = 'BILLING_ERROR') {
    super(message, statusCode, code);
  }
}

export class SubscriptionStatusError extends AppError {
  constructor(subscriptionStatus = 'incomplete') {
    super(
      `Sua assinatura está em estado ${subscriptionStatus}. Regularize o pagamento para continuar.`,
      402,
      'SUBSCRIPTION_INACTIVE'
    );
    this.subscriptionStatus = subscriptionStatus;
  }
}

export class SubscriptionRequiredError extends AppError {
  constructor({
    subscriptionStatus = 'incomplete',
    reason = 'subscription_required',
  } = {}) {
    super(
      'Finalize o pagamento para acessar o sistema.',
      402,
      'SUBSCRIPTION_REQUIRED'
    );
    this.subscriptionStatus = subscriptionStatus;
    this.reason = reason;
    this.billingActionRequired = true;
  }
}
