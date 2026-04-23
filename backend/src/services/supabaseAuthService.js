import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { AppError, UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';

let supabaseClient;
let supabaseAdminClient;
const DEFAULT_SUPABASE_AUTH_TIMEOUT_MS = 12000;

const resolveSupabaseConfig = () => {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
};

const resolveSupabaseAdminConfig = () => {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  return {
    url,
    serviceRoleKey,
    isConfigured: Boolean(url && serviceRoleKey),
  };
};

const resolveSupabaseAuthTimeoutMs = () => {
  const parsed = Number.parseInt(process.env.SUPABASE_AUTH_TIMEOUT_MS || '', 10);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_SUPABASE_AUTH_TIMEOUT_MS;
  }

  return parsed;
};

const buildTimeoutFetch = (timeoutMs) => {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    let didTimeout = false;

    const abortFromUpstream = () => {
      controller.abort();
    };

    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
      }
    }

    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (didTimeout) {
        const timeoutError = new Error(`Supabase Auth timeout after ${timeoutMs}ms`);
        timeoutError.name = 'SupabaseTimeoutError';
        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);

      if (upstreamSignal) {
        upstreamSignal.removeEventListener('abort', abortFromUpstream);
      }
    }
  };
};

const isTimeoutLikeError = (error) => {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  return (
    name.includes('timeout') ||
    name === 'aborterror' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  );
};

const runSupabaseOperation = async ({ operation, context = {} }, action) => {
  const startedAt = Date.now();
  const timeoutMs = resolveSupabaseAuthTimeoutMs();

  logger.info(
    {
      operation,
      timeoutMs,
      ...context,
    },
    'Supabase Auth: operação iniciada'
  );

  try {
    const result = await action();

    if (
      result &&
      typeof result === 'object' &&
      'error' in result &&
      result.error
    ) {
      logger.warn(
        {
          operation,
          durationMs: Date.now() - startedAt,
          errorMessage: result.error?.message || 'erro sem mensagem',
          ...context,
        },
        'Supabase Auth: operação retornou erro'
      );
      return result;
    }

    logger.info(
      {
        operation,
        durationMs: Date.now() - startedAt,
        ...context,
      },
      'Supabase Auth: operação concluída'
    );

    return result;
  } catch (error) {
    logger.error(
      {
        err: error,
        operation,
        durationMs: Date.now() - startedAt,
        ...context,
      },
      'Supabase Auth: operação falhou'
    );
    throw error;
  }
};

const resolveFrontendBaseUrl = () => {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    'http://localhost:3000';
  return baseUrl.replace(/\/+$/, '');
};

const resolveEmailRedirectTo = () => {
  const explicitRedirect = String(process.env.AUTH_SUPABASE_REDIRECT_TO || '').trim();

  if (explicitRedirect) {
    return explicitRedirect;
  }

  return `${resolveFrontendBaseUrl()}/auth/confirm`;
};

const buildSyntheticPassword = () => {
  return `${crypto.randomBytes(32).toString('base64url')}Aa1!`;
};

const buildOtpTypeCandidates = (requestedType) => {
  const normalizedType = String(requestedType || '').trim().toLowerCase();
  const candidates = [normalizedType, 'email', 'signup'];

  return [...new Set(candidates.filter(Boolean))];
};

const mapSupabaseError = (error, fallbackMessage) => {
  const message = String(error?.message || fallbackMessage || 'Erro no Supabase Auth').trim();
  const normalizedMessage = message.toLowerCase();

  if (isTimeoutLikeError(error)) {
    return new AppError(
      'Tempo esgotado ao comunicar com o provedor de identidade. Tente novamente.',
      504,
      'SUPABASE_TIMEOUT'
    );
  }

  if (normalizedMessage.includes('already registered')) {
    return new AppError('Usuário já cadastrado no provedor de identidade.', 409, 'SUPABASE_USER_EXISTS');
  }

  if (normalizedMessage.includes('fetch failed') || normalizedMessage.includes('network')) {
    return new AppError(
      'Falha de rede ao comunicar com o provedor de identidade.',
      502,
      'SUPABASE_NETWORK_ERROR'
    );
  }

  if (normalizedMessage.includes('expired') || normalizedMessage.includes('has expired')) {
    return new AppError(
      'Link de verificação expirado. Solicite um novo e-mail de verificação.',
      400,
      'EXPIRED_VERIFICATION_TOKEN'
    );
  }

  if (
    normalizedMessage.includes('otp') ||
    normalizedMessage.includes('token') ||
    normalizedMessage.includes('invalid') ||
    normalizedMessage.includes('not found')
  ) {
    return new AppError(
      'Link de verificação inválido ou já utilizado. Solicite um novo e-mail.',
      400,
      'INVALID_VERIFICATION_TOKEN'
    );
  }

  return new AppError(fallbackMessage || 'Falha ao processar autenticação externa.', 502, 'SUPABASE_AUTH_ERROR');
};

const mapSupabaseSignInError = (error) => {
  const message = String(error?.message || '').trim();
  const normalizedMessage = message.toLowerCase();
  const normalizedCode = String(error?.code || error?.error_code || '').trim().toLowerCase();

  if (isTimeoutLikeError(error)) {
    return new AppError(
      'Tempo esgotado ao comunicar com o provedor de identidade. Tente novamente.',
      504,
      'SUPABASE_TIMEOUT'
    );
  }

  if (
    normalizedCode === 'email_not_confirmed' ||
    normalizedMessage.includes('email not confirmed')
  ) {
    return new AppError(
      'Conta não verificada. Verifique seu e-mail antes de fazer login.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }

  if (
    normalizedCode === 'invalid_credentials' ||
    normalizedMessage.includes('invalid login credentials') ||
    normalizedMessage.includes('invalid email or password') ||
    normalizedMessage.includes('user not found')
  ) {
    return new UnauthorizedError('Email ou senha incorretos');
  }

  if (normalizedMessage.includes('fetch failed') || normalizedMessage.includes('network')) {
    return new AppError(
      'Falha de rede ao comunicar com o provedor de identidade.',
      502,
      'SUPABASE_NETWORK_ERROR'
    );
  }

  return new AppError(
    'Não foi possível autenticar no provedor de identidade.',
    502,
    'SUPABASE_AUTH_ERROR'
  );
};

const getSupabaseClient = () => {
  const config = resolveSupabaseConfig();

  if (!config.isConfigured) {
    throw new AppError(
      'Supabase Auth não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY.',
      503,
      'SUPABASE_AUTH_NOT_CONFIGURED'
    );
  }

  if (!supabaseClient) {
    const timeoutMs = resolveSupabaseAuthTimeoutMs();

    supabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: buildTimeoutFetch(timeoutMs),
      },
    });
  }

  return supabaseClient;
};

const getSupabaseAdminClient = () => {
  const config = resolveSupabaseAdminConfig();

  if (!config.isConfigured) {
    throw new AppError(
      'Supabase Admin não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
      503,
      'SUPABASE_ADMIN_NOT_CONFIGURED'
    );
  }

  if (!supabaseAdminClient) {
    const timeoutMs = resolveSupabaseAuthTimeoutMs();

    supabaseAdminClient = createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: buildTimeoutFetch(timeoutMs),
      },
    });
  }

  return supabaseAdminClient;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const supabaseAuthService = {
  resolveEmailRedirectTo,

  async signInWithPassword(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const rawPassword = String(password || '');

    if (!normalizedEmail || !rawPassword) {
      throw new UnauthorizedError('Email ou senha incorretos');
    }

    const client = getSupabaseClient();

    let data;
    let error;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'signInWithPassword',
          context: { email: normalizedEmail },
        },
        () => client.auth.signInWithPassword({
          email: normalizedEmail,
          password: rawPassword,
        })
      ));
    } catch (operationError) {
      throw mapSupabaseSignInError(operationError);
    }

    if (error) {
      throw mapSupabaseSignInError(error);
    }

    const resolvedUserId = data?.user?.id || null;
    const confirmedAt =
      data?.user?.email_confirmed_at ||
      data?.user?.confirmed_at ||
      null;

    if (!resolvedUserId) {
      throw new AppError(
        'Não foi possível validar identidade no provedor externo.',
        502,
        'SUPABASE_AUTH_ERROR'
      );
    }

    return {
      userId: resolvedUserId,
      email: normalizeEmail(data?.user?.email || normalizedEmail),
      emailVerified: Boolean(confirmedAt),
      emailVerifiedAt: confirmedAt,
      sessionExpiresAt: data?.session?.expires_at || null,
    };
  },

  async getVerifiedIdentityFromAccessToken(accessToken) {
    const normalizedAccessToken = String(accessToken || '').trim();

    if (!normalizedAccessToken) {
      throw new AppError('Sessão de confirmação inválida ou expirada.', 401, 'INVALID_CONFIRMATION_SESSION');
    }

    const client = getSupabaseClient();
    let data;
    let error;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'getVerifiedIdentityFromAccessToken',
          context: {
            accessTokenPrefix: normalizedAccessToken.slice(0, 8),
          },
        },
        () => client.auth.getUser(normalizedAccessToken)
      ));
    } catch (operationError) {
      throw mapSupabaseError(operationError, 'Não foi possível validar a sessão de confirmação.');
    }

    if (error) {
      const message = String(error?.message || '').toLowerCase();
      if (
        message.includes('jwt') ||
        message.includes('token') ||
        message.includes('session') ||
        message.includes('invalid')
      ) {
        throw new AppError('Sessão de confirmação inválida ou expirada.', 401, 'INVALID_CONFIRMATION_SESSION');
      }

      throw mapSupabaseError(error, 'Não foi possível validar a sessão de confirmação.');
    }

    const userId = data?.user?.id || null;
    const email = normalizeEmail(data?.user?.email || '');
    const confirmedAt =
      data?.user?.email_confirmed_at ||
      data?.user?.confirmed_at ||
      null;

    if (!userId || !email) {
      throw new AppError('Sessão de confirmação inválida ou expirada.', 401, 'INVALID_CONFIRMATION_SESSION');
    }

    return {
      userId,
      email,
      emailVerified: Boolean(confirmedAt),
      verifiedAt: confirmedAt || new Date().toISOString(),
    };
  },

  async signUpForEmailVerification(email) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      throw new AppError('Email inválido para cadastro externo.', 400, 'INVALID_EMAIL');
    }

    const client = getSupabaseClient();

    let data;
    let error;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'signUpForEmailVerification',
          context: { email: normalizedEmail },
        },
        () => client.auth.signUp({
          email: normalizedEmail,
          password: buildSyntheticPassword(),
          options: {
            emailRedirectTo: resolveEmailRedirectTo(),
            data: {
              source: 'easybarber',
              provider: 'supabase',
            },
          },
        })
      ));
    } catch (operationError) {
      throw mapSupabaseError(operationError, 'Não foi possível iniciar o cadastro no Supabase Auth.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível iniciar o cadastro no Supabase Auth.');
    }

    return {
      userId: data?.user?.id || null,
      email: data?.user?.email || normalizedEmail,
      verificationEmailSent: true,
    };
  },

  async resendVerificationEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      throw new AppError('Email inválido para reenvio de verificação.', 400, 'INVALID_EMAIL');
    }

    const client = getSupabaseClient();

    let error;

    try {
      ({ error } = await runSupabaseOperation(
        {
          operation: 'resendVerificationEmail',
          context: { email: normalizedEmail },
        },
        () => client.auth.resend({
          type: 'signup',
          email: normalizedEmail,
          options: {
            emailRedirectTo: resolveEmailRedirectTo(),
          },
        })
      ));
    } catch (operationError) {
      throw mapSupabaseError(operationError, 'Não foi possível reenviar o e-mail de verificação.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível reenviar o e-mail de verificação.');
    }

    return {
      delivered: true,
    };
  },

  async verifyEmailToken({ tokenHash, type }) {
    const normalizedTokenHash = String(tokenHash || '').trim();

    if (!normalizedTokenHash) {
      throw new AppError('Token de verificação inválido.', 400, 'INVALID_VERIFICATION_TOKEN');
    }

    const client = getSupabaseClient();
    const candidateTypes = buildOtpTypeCandidates(type);
    let lastError = null;

    for (const candidateType of candidateTypes) {
      let data;
      let error;

      try {
        ({ data, error } = await runSupabaseOperation(
          {
            operation: 'verifyEmailToken',
            context: {
              otpType: candidateType,
              tokenHashPrefix: normalizedTokenHash.slice(0, 8),
            },
          },
          () => client.auth.verifyOtp({
            token_hash: normalizedTokenHash,
            type: candidateType,
          })
        ));
      } catch (operationError) {
        throw mapSupabaseError(operationError, 'Não foi possível confirmar o e-mail no Supabase Auth.');
      }

      if (!error && data?.user?.email) {
        return {
          email: normalizeEmail(data.user.email),
          userId: data.user.id || null,
          verifiedAt: new Date().toISOString(),
        };
      }

      if (error) {
        lastError = error;
      }
    }

    throw mapSupabaseError(lastError, 'Não foi possível confirmar o e-mail no Supabase Auth.');
  },

  async updateUserEmailById(userId, email) {
    const normalizedEmail = normalizeEmail(email);

    if (!userId || !normalizedEmail) {
      throw new AppError('Dados inválidos para atualizar e-mail no Supabase Auth.', 400, 'INVALID_EMAIL_UPDATE');
    }

    const client = getSupabaseAdminClient();
    let data;
    let error;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'updateUserEmailById',
          context: { userId, email: normalizedEmail },
        },
        () => client.auth.admin.updateUserById(userId, {
          email: normalizedEmail,
          email_confirm: true,
        })
      ));
    } catch (operationError) {
      throw mapSupabaseError(operationError, 'Não foi possível atualizar o e-mail no provedor de identidade.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível atualizar o e-mail no provedor de identidade.');
    }

    return {
      userId: data?.user?.id || userId,
      email: normalizeEmail(data?.user?.email || normalizedEmail),
    };
  },

  async updateUserPasswordById(userId, password) {
    const normalizedPassword = String(password || '');

    if (!userId || !normalizedPassword) {
      throw new AppError('Dados inválidos para atualizar senha no Supabase Auth.', 400, 'INVALID_PASSWORD_UPDATE');
    }

    const client = getSupabaseAdminClient();
    let data;
    let error;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'updateUserPasswordById',
          context: { userId },
        },
        () => client.auth.admin.updateUserById(userId, {
          password: normalizedPassword,
        })
      ));
    } catch (operationError) {
      throw mapSupabaseError(operationError, 'Não foi possível atualizar a senha no provedor de identidade.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível atualizar a senha no provedor de identidade.');
    }

    return {
      userId: data?.user?.id || userId,
    };
  },
};
