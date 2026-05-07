import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppError, UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}

interface SupabaseAdminConfig {
  url: string;
  serviceRoleKey: string;
  isConfigured: boolean;
}

interface MappedSupabaseUser {
  id: string | null;
  email: string;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  confirmation_sent_at: string | null;
  raw: Record<string, unknown>;
  emailVerified?: boolean;
}

interface SupabaseResendSummary {
  hasUser: boolean;
  userId: string | null;
  email: string;
  actionLinkHost: string | null;
}

interface SignInResult {
  userId: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  sessionExpiresAt: number | null;
  user: MappedSupabaseUser | null;
}

interface VerifiedIdentityResult {
  userId: string;
  email: string;
  emailVerified: boolean;
  verifiedAt: string;
  user: MappedSupabaseUser | null;
}

interface SignUpResult {
  userId: string | null;
  email: string;
  verificationEmailSent: boolean;
  user: MappedSupabaseUser | null;
}

interface UserByIdResult extends MappedSupabaseUser {
  emailVerified: boolean;
}

interface VerifyEmailTokenResult {
  email: string;
  userId: string | null;
  verifiedAt: string;
  user: MappedSupabaseUser | null;
}

interface UpdateEmailResult {
  userId: string;
  email: string;
  user: MappedSupabaseUser | null;
}

interface UpdatePasswordResult {
  userId: string;
  user: MappedSupabaseUser | null;
}

interface ResendVerificationResult {
  accepted: boolean;
  deliveryConfirmed: boolean;
  classification: 'accepted' | 'ambiguous';
  summary: SupabaseResendSummary | null;
  redirectTo: string | null;
}

// ─── Module-level singletons ─────────────────────────────────────────────────

let supabaseClient: SupabaseClient | undefined;
let supabaseAdminClient: SupabaseClient | undefined;
const DEFAULT_SUPABASE_AUTH_TIMEOUT_MS = 12000;
const DEFAULT_PRODUCTION_APP_URL = 'https://barberpro-saas-2-0.vercel.app';

// ─── Config helpers ───────────────────────────────────────────────────────────

const resolveSupabaseConfig = (): SupabaseConfig => {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
};

const resolveSupabaseAdminConfig = (): SupabaseAdminConfig => {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  return {
    url,
    serviceRoleKey,
    isConfigured: Boolean(url && serviceRoleKey),
  };
};

const resolveSupabaseAuthTimeoutMs = (): number => {
  const parsed = Number.parseInt(process.env.SUPABASE_AUTH_TIMEOUT_MS || '', 10);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_SUPABASE_AUTH_TIMEOUT_MS;
  }

  return parsed;
};

// ─── Timeout fetch ────────────────────────────────────────────────────────────

const buildTimeoutFetch = (timeoutMs: number) => {
  return async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal as AbortSignal | undefined;
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
    } catch (error: unknown) {
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

// ─── Error helpers ────────────────────────────────────────────────────────────

const isTimeoutLikeError = (error: unknown): boolean => {
  const name = String((error as Record<string, unknown>)?.name || '').toLowerCase();
  const message = String((error as Record<string, unknown>)?.message || '').toLowerCase();

  return (
    name.includes('timeout') ||
    name === 'aborterror' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  );
};

const runSupabaseOperation = async <T>(
  { operation, context = {} }: { operation: string; context?: Record<string, unknown> },
  action: () => Promise<T>
): Promise<T> => {
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
      (result as Record<string, unknown>).error
    ) {
      const err = (result as Record<string, unknown>).error as Record<string, unknown>;
      logger.warn(
        {
          operation,
          durationMs: Date.now() - startedAt,
          errorMessage: err?.message || 'erro sem mensagem',
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
  } catch (error: unknown) {
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

// ─── URL helpers ──────────────────────────────────────────────────────────────

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const ensureAbsoluteUrl = (value: unknown, envName: string): string | null => {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return null;
  }

  const withProtocol =
    normalized.startsWith('http://') || normalized.startsWith('https://')
      ? normalized
      : `https://${normalized}`;

  try {
    const parsed = new URL(withProtocol);
    return trimTrailingSlash(parsed.toString());
  } catch {
    throw new AppError(
      `URL pública inválida em ${envName}.`,
      500,
      'INVALID_PUBLIC_APP_URL'
    );
  }
};

const resolveFrontendBaseUrl = (): string => {
  const candidates: Array<[string, string | undefined]> = [
    ['APP_URL', process.env.APP_URL],
    ['NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL],
    ['FRONTEND_URL', process.env.FRONTEND_URL],
  ];

  for (const [envName, envValue] of candidates) {
    const resolved = ensureAbsoluteUrl(envValue, envName);

    if (resolved) {
      return resolved;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_PRODUCTION_APP_URL;
  }

  const vercelUrl = ensureAbsoluteUrl(process.env.VERCEL_URL, 'VERCEL_URL');
  if (vercelUrl) {
    return vercelUrl;
  }

  return 'http://localhost:3000';
};

const normalizeEmailRedirectTo = (value: unknown): string | null => {
  const resolved = ensureAbsoluteUrl(value, 'emailRedirectTo');

  if (!resolved) {
    return null;
  }

  const parsed = new URL(resolved);
  if (parsed.pathname.replace(/\/+$/, '') !== '/auth/confirm') {
    throw new AppError(
      'URL de confirmação deve apontar para /auth/confirm.',
      400,
      'INVALID_EMAIL_REDIRECT_TO'
    );
  }

  return resolved;
};

const resolveEmailRedirectTo = (emailRedirectTo: string | null = null): string | null => {
  const providedRedirect = normalizeEmailRedirectTo(emailRedirectTo);

  if (providedRedirect) {
    return providedRedirect;
  }

  const explicitRedirect = String(process.env.AUTH_SUPABASE_REDIRECT_TO || '').trim();

  if (explicitRedirect) {
    return normalizeEmailRedirectTo(explicitRedirect);
  }

  return new URL('/auth/confirm', `${resolveFrontendBaseUrl()}/`).toString().replace(/\/$/, '');
};

const buildOtpTypeCandidates = (requestedType: unknown): string[] => {
  const normalizedType = String(requestedType || '').trim().toLowerCase();
  const candidates = [normalizedType, 'email', 'signup'];

  return [...new Set(candidates.filter(Boolean))];
};

// ─── Error mappers ────────────────────────────────────────────────────────────

const mapSupabaseError = (error: unknown, fallbackMessage?: string): AppError => {
  const message = String((error as Record<string, unknown>)?.message || fallbackMessage || 'Erro no Supabase Auth').trim();
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

const mapSupabaseSignInError = (error: unknown): AppError | UnauthorizedError => {
  const message = String((error as Record<string, unknown>)?.message || '').trim();
  const normalizedMessage = message.toLowerCase();
  const normalizedCode = String(
    (error as Record<string, unknown>)?.code ||
    (error as Record<string, unknown>)?.error_code ||
    ''
  ).trim().toLowerCase();

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

// ─── Client factories ─────────────────────────────────────────────────────────

const getSupabaseClient = (): SupabaseClient => {
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
        fetch: buildTimeoutFetch(timeoutMs) as typeof fetch,
      },
    });
  }

  return supabaseClient;
};

const getSupabaseAdminClient = (): SupabaseClient => {
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
        fetch: buildTimeoutFetch(timeoutMs) as typeof fetch,
      },
    });
  }

  return supabaseAdminClient;
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

const normalizeEmail = (email: unknown): string =>
  String(email || '').trim().toLowerCase();

const summarizeSupabaseResendResult = (data: unknown): SupabaseResendSummary | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const dataObj = data as Record<string, unknown>;
  const user = dataObj.user && typeof dataObj.user === 'object'
    ? (dataObj.user as Record<string, unknown>)
    : null;

  return {
    hasUser: Boolean(user),
    userId: (user?.id as string) || null,
    email: normalizeEmail(user?.email || ''),
    actionLinkHost: (() => {
      const actionLink = typeof dataObj.action_link === 'string' ? dataObj.action_link : '';

      if (!actionLink) {
        return null;
      }

      try {
        return new URL(actionLink).host;
      } catch {
        return 'invalid-url';
      }
    })(),
  };
};

const isSupabaseUserEmailConfirmed = (user: MappedSupabaseUser | null | undefined): boolean =>
  Boolean(user?.email_confirmed_at || user?.confirmed_at);

const mapSupabaseUser = (user: unknown, fallbackEmail: string | null = null): MappedSupabaseUser | null => {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const u = user as Record<string, unknown>;

  return {
    id: (u.id as string) || null,
    email: normalizeEmail(u.email || fallbackEmail || ''),
    email_confirmed_at: (u.email_confirmed_at as string) || null,
    confirmed_at: (u.confirmed_at as string) || null,
    confirmation_sent_at: (u.confirmation_sent_at as string) || null,
    raw: u,
  };
};

// ─── Exported service ─────────────────────────────────────────────────────────

export const supabaseAuthService = {
  resolveEmailRedirectTo,

  async signInWithPassword(email: string, password: string): Promise<SignInResult> {
    const normalizedEmail = normalizeEmail(email);
    const rawPassword = String(password || '');

    if (!normalizedEmail || !rawPassword) {
      throw new UnauthorizedError('Email ou senha incorretos');
    }

    const client = getSupabaseClient();

    let data: Record<string, unknown> | undefined;
    let error: unknown;

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
      ) as { data: Record<string, unknown>; error: unknown });
    } catch (operationError: unknown) {
      throw mapSupabaseSignInError(operationError);
    }

    if (error) {
      throw mapSupabaseSignInError(error);
    }

    const userData = data?.user as Record<string, unknown> | undefined;
    const sessionData = data?.session as Record<string, unknown> | undefined;
    const resolvedUserId = (userData?.id as string) || null;
    const confirmedAt =
      (userData?.email_confirmed_at as string) ||
      (userData?.confirmed_at as string) ||
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
      email: normalizeEmail(userData?.email || normalizedEmail),
      emailVerified: Boolean(confirmedAt),
      emailVerifiedAt: confirmedAt,
      sessionExpiresAt: (sessionData?.expires_at as number) || null,
      user: mapSupabaseUser(userData, normalizedEmail),
    };
  },

  async getVerifiedIdentityFromAccessToken(accessToken: string): Promise<VerifiedIdentityResult> {
    const normalizedAccessToken = String(accessToken || '').trim();

    if (!normalizedAccessToken) {
      throw new AppError('Sessão de confirmação inválida ou expirada.', 401, 'INVALID_CONFIRMATION_SESSION');
    }

    const client = getSupabaseClient();
    let data: Record<string, unknown> | undefined;
    let error: unknown;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'getVerifiedIdentityFromAccessToken',
          context: {
            accessTokenPrefix: normalizedAccessToken.slice(0, 8),
          },
        },
        () => client.auth.getUser(normalizedAccessToken)
      ) as { data: Record<string, unknown>; error: unknown });
    } catch (operationError: unknown) {
      throw mapSupabaseError(operationError, 'Não foi possível validar a sessão de confirmação.');
    }

    if (error) {
      const message = String((error as Record<string, unknown>)?.message || '').toLowerCase();
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

    const userData = data?.user as Record<string, unknown> | undefined;
    const userId = (userData?.id as string) || null;
    const email = normalizeEmail(userData?.email || '');
    const confirmedAt =
      (userData?.email_confirmed_at as string) ||
      (userData?.confirmed_at as string) ||
      null;

    if (!userId || !email) {
      throw new AppError('Sessão de confirmação inválida ou expirada.', 401, 'INVALID_CONFIRMATION_SESSION');
    }

    return {
      userId,
      email,
      emailVerified: Boolean(confirmedAt),
      verifiedAt: confirmedAt || new Date().toISOString(),
      user: mapSupabaseUser(userData, email),
    };
  },

  async signUpForEmailVerification(
    email: string,
    password: string,
    emailRedirectTo: string | null = null
  ): Promise<SignUpResult> {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = String(password || '');

    if (!normalizedEmail || !normalizedPassword) {
      throw new AppError('Email inválido para cadastro externo.', 400, 'INVALID_EMAIL');
    }

    const client = getSupabaseClient();
    const redirectTo = resolveEmailRedirectTo(emailRedirectTo);

    logger.info(
      {
        operation: 'confirmSignup',
        email: normalizedEmail,
        redirectTo,
        reason: 'signup_redirect_configured',
      },
      'Supabase Auth: redirect de confirmação configurado'
    );

    let data: Record<string, unknown> | undefined;
    let error: unknown;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'signUpForEmailVerification',
          context: { email: normalizedEmail, redirectTo },
        },
        () => client.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
          options: {
            emailRedirectTo: redirectTo ?? undefined,
            data: {
              source: 'easybarber',
              provider: 'supabase',
            },
          },
        })
      ) as { data: Record<string, unknown>; error: unknown });
    } catch (operationError: unknown) {
      throw mapSupabaseError(operationError, 'Não foi possível iniciar o cadastro no Supabase Auth.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível iniciar o cadastro no Supabase Auth.');
    }

    const userData = data?.user as Record<string, unknown> | undefined;

    return {
      userId: (userData?.id as string) || null,
      email: (userData?.email as string) || normalizedEmail,
      verificationEmailSent: true,
      user: mapSupabaseUser(userData, normalizedEmail),
    };
  },

  async getUserById(userId: string): Promise<UserByIdResult | null> {
    if (!userId) {
      throw new AppError('Usuário Supabase inválido.', 400, 'INVALID_SUPABASE_USER');
    }

    const client = getSupabaseAdminClient();
    let data: Record<string, unknown> | undefined;
    let error: unknown;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'getSupabaseUserById',
          context: { userId },
        },
        () => client.auth.admin.getUserById(userId)
      ) as { data: Record<string, unknown>; error: unknown });
    } catch (operationError: unknown) {
      throw mapSupabaseError(operationError, 'Não foi possível consultar o usuário no Supabase Auth.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível consultar o usuário no Supabase Auth.');
    }

    const user = mapSupabaseUser(data?.user);

    return user
      ? {
          ...user,
          emailVerified: isSupabaseUserEmailConfirmed(user),
        }
      : null;
  },

  async getUserByEmail(email: string): Promise<UserByIdResult | null> {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      throw new AppError('Email inválido para consulta no Supabase Auth.', 400, 'INVALID_EMAIL');
    }

    const client = getSupabaseAdminClient();
    let page = 1;
    const perPage = 200;

    while (page <= 50) {
      let data: Record<string, unknown> | undefined;
      let error: unknown;

      try {
        ({ data, error } = await runSupabaseOperation(
          {
            operation: 'getSupabaseUserByEmail',
            context: { email: normalizedEmail, page, perPage },
          },
          () => client.auth.admin.listUsers({ page, perPage })
        ) as { data: Record<string, unknown>; error: unknown });
      } catch (operationError: unknown) {
        throw mapSupabaseError(operationError, 'Não foi possível consultar o usuário no Supabase Auth.');
      }

      if (error) {
        throw mapSupabaseError(error, 'Não foi possível consultar o usuário no Supabase Auth.');
      }

      const users = data?.users;
      const matchedUser = Array.isArray(users)
        ? users.find(
            (candidate: unknown) =>
              normalizeEmail((candidate as Record<string, unknown>)?.email || '') === normalizedEmail
          )
        : null;

      if (matchedUser) {
        const user = mapSupabaseUser(matchedUser, normalizedEmail);

        return user
          ? {
              ...user,
              emailVerified: isSupabaseUserEmailConfirmed(user),
            }
          : null;
      }

      if (!data?.nextPage || !Array.isArray(users) || users.length < perPage) {
        break;
      }

      page = data.nextPage as number;
    }

    return null;
  },

  async resendVerificationEmail(
    email: string,
    emailRedirectTo: string | null = null
  ): Promise<ResendVerificationResult> {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      throw new AppError('Email inválido para reenvio de verificação.', 400, 'INVALID_EMAIL');
    }

    const client = getSupabaseClient();
    const redirectTo = resolveEmailRedirectTo(emailRedirectTo);

    let data: unknown;
    let error: unknown;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'resendVerificationEmail',
          context: {
            email: normalizedEmail,
            redirectTo,
          },
        },
        () => client.auth.resend({
          type: 'signup',
          email: normalizedEmail,
          options: {
            emailRedirectTo: redirectTo ?? undefined,
          },
        })
      ) as { data: unknown; error: unknown });
    } catch (operationError: unknown) {
      logger.error(
        {
          email: normalizedEmail,
          redirectTo,
          reason: operationError instanceof Error ? operationError.message : String(operationError),
        },
        'Supabase Auth: falha inesperada ao reenviar verificacao'
      );
      throw mapSupabaseError(operationError, 'Não foi possível reenviar o e-mail de verificação.');
    }

    if (error) {
      const errObj = error as Record<string, unknown>;
      logger.warn(
        {
          email: normalizedEmail,
          redirectTo,
          errorCode: errObj?.code || errObj?.error_code || null,
          errorMessage: errObj?.message || null,
          data: summarizeSupabaseResendResult(data),
        },
        'Supabase Auth: reenvio de verificacao retornou erro'
      );
      throw mapSupabaseError(error, 'Não foi possível reenviar o e-mail de verificação.');
    }

    logger.info(
      {
        email: normalizedEmail,
        redirectTo,
        data: summarizeSupabaseResendResult(data),
        error: null,
      },
      'Supabase Auth: reenvio de verificacao concluido'
    );

    const summary = summarizeSupabaseResendResult(data);
    const classification: 'accepted' | 'ambiguous' =
      summary?.hasUser && summary?.userId && summary?.email && summary?.actionLinkHost
        ? 'accepted'
        : 'ambiguous';

    return {
      accepted: true,
      deliveryConfirmed: false,
      classification,
      summary,
      redirectTo,
    };
  },

  async verifyEmailToken({
    tokenHash,
    type,
  }: {
    tokenHash: string;
    type?: string;
  }): Promise<VerifyEmailTokenResult> {
    const normalizedTokenHash = String(tokenHash || '').trim();

    if (!normalizedTokenHash) {
      throw new AppError('Token de verificação inválido.', 400, 'INVALID_VERIFICATION_TOKEN');
    }

    const client = getSupabaseClient();
    const candidateTypes = buildOtpTypeCandidates(type);
    let lastError: unknown = null;

    for (const candidateType of candidateTypes) {
      let data: Record<string, unknown> | undefined;
      let error: unknown;

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
          } as Parameters<typeof client.auth.verifyOtp>[0])
        ) as { data: Record<string, unknown>; error: unknown });
      } catch (operationError: unknown) {
        throw mapSupabaseError(operationError, 'Não foi possível confirmar o e-mail no Supabase Auth.');
      }

      const userData = data?.user as Record<string, unknown> | undefined;
      if (!error && userData?.email) {
        return {
          email: normalizeEmail(userData.email),
          userId: (userData.id as string) || null,
          verifiedAt: new Date().toISOString(),
          user: mapSupabaseUser(userData),
        };
      }

      if (error) {
        lastError = error;
      }
    }

    throw mapSupabaseError(lastError, 'Não foi possível confirmar o e-mail no Supabase Auth.');
  },

  async updateUserEmailById(userId: string, email: string): Promise<UpdateEmailResult> {
    const normalizedEmail = normalizeEmail(email);

    if (!userId || !normalizedEmail) {
      throw new AppError('Dados inválidos para atualizar e-mail no Supabase Auth.', 400, 'INVALID_EMAIL_UPDATE');
    }

    const client = getSupabaseAdminClient();
    let data: Record<string, unknown> | undefined;
    let error: unknown;

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
      ) as { data: Record<string, unknown>; error: unknown });
    } catch (operationError: unknown) {
      throw mapSupabaseError(operationError, 'Não foi possível atualizar o e-mail no provedor de identidade.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível atualizar o e-mail no provedor de identidade.');
    }

    const userData = data?.user as Record<string, unknown> | undefined;

    return {
      userId: (userData?.id as string) || userId,
      email: normalizeEmail(userData?.email || normalizedEmail),
      user: mapSupabaseUser(userData, normalizedEmail),
    };
  },

  async updateUserPasswordById(userId: string, password: string): Promise<UpdatePasswordResult> {
    const normalizedPassword = String(password || '');

    if (!userId || !normalizedPassword) {
      throw new AppError('Dados inválidos para atualizar senha no Supabase Auth.', 400, 'INVALID_PASSWORD_UPDATE');
    }

    const client = getSupabaseAdminClient();
    let data: Record<string, unknown> | undefined;
    let error: unknown;

    try {
      ({ data, error } = await runSupabaseOperation(
        {
          operation: 'updateUserPasswordById',
          context: { userId },
        },
        () => client.auth.admin.updateUserById(userId, {
          password: normalizedPassword,
        })
      ) as { data: Record<string, unknown>; error: unknown });
    } catch (operationError: unknown) {
      throw mapSupabaseError(operationError, 'Não foi possível atualizar a senha no provedor de identidade.');
    }

    if (error) {
      throw mapSupabaseError(error, 'Não foi possível atualizar a senha no provedor de identidade.');
    }

    const userData = data?.user as Record<string, unknown> | undefined;

    return {
      userId: (userData?.id as string) || userId,
      user: mapSupabaseUser(userData),
    };
  },
};
