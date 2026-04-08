import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { AppError } from '../utils/errors.js';

let supabaseClient;

const resolveSupabaseConfig = () => {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
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

  if (normalizedMessage.includes('already registered')) {
    return new AppError('Usuário já cadastrado no provedor de identidade.', 409, 'SUPABASE_USER_EXISTS');
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
    supabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
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

    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password: buildSyntheticPassword(),
      options: {
        emailRedirectTo: resolveEmailRedirectTo(),
        data: {
          source: 'easybarber',
          provider: 'supabase',
        },
      },
    });

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

    const { error } = await client.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: {
        emailRedirectTo: resolveEmailRedirectTo(),
      },
    });

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
      const { data, error } = await client.auth.verifyOtp({
        token_hash: normalizedTokenHash,
        type: candidateType,
      });

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
