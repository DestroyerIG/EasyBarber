export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;
  details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', details: unknown[] = []) {
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
  requiredPlan: string;

  constructor(requiredPlan: string) {
    super(
      `Esta funcionalidade requer o plano ${requiredPlan} ou superior`,
      403,
      'PLAN_LIMIT'
    );
    this.requiredPlan = requiredPlan;
  }
}

export interface FeatureAccessDecision {
  allowed?: boolean;
  billingActionRequired?: boolean;
  message?: string;
  reason?: string;
  requiredPlan?: string | null;
  subscriptionStatus?: string | null;
  upgradeRequired?: boolean;
}

export class FeatureAccessError extends AppError {
  feature: string;
  reason: string;
  requiredPlan: string | null;
  subscriptionStatus: string | null;
  upgradeRequired: boolean;
  billingActionRequired: boolean;

  constructor(feature: string, decision: FeatureAccessDecision = {}) {
    const statusCode = decision.billingActionRequired ? 402 : 403;
    const message =
      decision.message ||
      'Esta funcionalidade está indisponível para a sua assinatura.';

    super(message, statusCode, 'FEATURE_BLOCKED');

    this.feature = feature;
    this.reason = decision.reason || 'subscription_status_restricted';
    this.requiredPlan = decision.requiredPlan ?? null;
    this.subscriptionStatus = decision.subscriptionStatus ?? null;
    this.upgradeRequired = Boolean(decision.upgradeRequired);
    this.billingActionRequired = Boolean(decision.billingActionRequired);
  }
}

export class BillingError extends AppError {
  constructor(
    message = 'Erro ao processar cobrança',
    statusCode = 502,
    code = 'BILLING_ERROR'
  ) {
    super(message, statusCode, code);
  }
}

export class SubscriptionStatusError extends AppError {
  subscriptionStatus: string;

  constructor(subscriptionStatus = 'incomplete') {
    super(
      `Sua assinatura está em estado ${subscriptionStatus}. Regularize o pagamento para continuar.`,
      402,
      'SUBSCRIPTION_INACTIVE'
    );
    this.subscriptionStatus = subscriptionStatus;
  }
}

export interface SubscriptionRequiredOptions {
  subscriptionStatus?: string;
  reason?: string;
}

export class SubscriptionRequiredError extends AppError {
  subscriptionStatus: string;
  reason: string;
  billingActionRequired: boolean;

  constructor({
    subscriptionStatus = 'incomplete',
    reason = 'subscription_required',
  }: SubscriptionRequiredOptions = {}) {
    super('Finalize o pagamento para acessar o sistema.', 402, 'SUBSCRIPTION_REQUIRED');
    this.subscriptionStatus = subscriptionStatus;
    this.reason = reason;
    this.billingActionRequired = true;
  }
}
