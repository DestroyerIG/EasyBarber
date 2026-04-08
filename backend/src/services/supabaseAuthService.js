import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

let supabaseClient;
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
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
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

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const supabaseAuthService = {
  resolveEmailRedirectTo,

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
};
