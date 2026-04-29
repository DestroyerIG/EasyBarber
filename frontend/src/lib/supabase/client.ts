import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveAppUrl } from '@/lib/appUrl';

let browserClient: SupabaseClient | null = null;

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : '';
};

const resolveSupabaseUrl = () => normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const resolveSupabaseAnonKey = () => normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const maskSupabaseUrl = (url: string) => {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    const [projectRef = ''] = parsedUrl.host.split('.');
    const maskedProjectRef =
      projectRef.length > 8 ? `${projectRef.slice(0, 6)}...${projectRef.slice(-2)}` : projectRef;

    return `${parsedUrl.protocol}//${maskedProjectRef}.${parsedUrl.host.split('.').slice(1).join('.')}`;
  } catch {
    return 'url-invalida';
  }
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(`${normalized}${padding}`);
  }

  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf-8');
};

const tryExtractProjectRefFromJwt = (token: string) => {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { ref?: unknown };
    return typeof payload.ref === 'string' && payload.ref.trim().length > 0 ? payload.ref.trim() : null;
  } catch {
    return null;
  }
};

export const getMissingSupabasePublicEnvVars = () => {
  const missing: string[] = [];

  if (!resolveSupabaseUrl()) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!resolveSupabaseAnonKey()) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return missing;
};

export const isSupabaseClientConfigured = () => {
  return Boolean(resolveSupabaseUrl() && resolveSupabaseAnonKey());
};

export const getSupabaseClientDiagnostics = () => {
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabaseAnonKey();
  const urlHost = (() => {
    if (!url) return null;

    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  })();
  const urlProjectRef = urlHost?.split('.')[0] || null;
  const anonKeyProjectRef = anonKey ? tryExtractProjectRefFromJwt(anonKey) : null;

  return {
    hasSupabaseUrl: Boolean(url),
    hasSupabaseAnonKey: Boolean(anonKey),
    supabaseUrlHost: urlHost,
    supabaseUrlMasked: maskSupabaseUrl(url),
    supabaseUrlProjectRef: urlProjectRef,
    anonKeyProjectRef,
    canCompareProjectRef: Boolean(urlProjectRef && anonKeyProjectRef),
    isProjectRefMismatch:
      Boolean(urlProjectRef && anonKeyProjectRef) && urlProjectRef !== anonKeyProjectRef,
  };
};

export const getSupabaseClient = () => {
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabaseAnonKey();

  if (!url || !anonKey) {
    const missingVars = getMissingSupabasePublicEnvVars();
    console.error('[supabase-client] configuração pública ausente no browser', {
      missingVars,
      hasSupabaseUrl: Boolean(url),
      hasSupabaseAnonKey: Boolean(anonKey),
      supabaseUrl: maskSupabaseUrl(url),
    });

    throw new Error(
      `Configuração Supabase ausente no frontend. Defina ${missingVars.join(' e ')}.`
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
  return resolveAppUrl();
};

export const resolveAuthConfirmRedirectUrl = () => {
  return `${resolveFrontendAppUrl()}/auth/confirm`;
};
