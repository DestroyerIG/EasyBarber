import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : '';
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolveSupabaseUrl = () => normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const resolveSupabaseAnonKey = () => normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isSupabaseBrowserClientConfigured = () => {
  return Boolean(resolveSupabaseUrl() && resolveSupabaseAnonKey());
};

export const getSupabaseBrowserClient = () => {
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      'Configuração Supabase ausente no frontend. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  return browserClient;
};

export const resolveFrontendAppUrl = () => {
  const configuredAppUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL);

  if (configuredAppUrl) {
    return trimTrailingSlash(configuredAppUrl);
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return trimTrailingSlash(window.location.origin);
  }

  return 'http://localhost:3000';
};

export const resolveAuthConfirmRedirectUrl = () => {
  return `${resolveFrontendAppUrl()}/auth/confirm`;
};
