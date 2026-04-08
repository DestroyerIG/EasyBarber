const ALLOWED_AUTH_PROVIDER_MODES = new Set(['legacy', 'dual', 'supabase']);
const DEFAULT_AUTH_PROVIDER_MODE = 'dual';

const normalizeMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (ALLOWED_AUTH_PROVIDER_MODES.has(normalized)) {
    return normalized;
  }
  return DEFAULT_AUTH_PROVIDER_MODE;
};

export const getAuthProviderMode = () => normalizeMode(process.env.AUTH_PROVIDER_MODE);

export const isLegacyAuthProviderMode = () => getAuthProviderMode() === 'legacy';

export const isSupabaseOnlyAuthProviderMode = () => getAuthProviderMode() === 'supabase';

export const isSupabasePrimaryAuthProviderMode = () => {
  const mode = getAuthProviderMode();
  return mode === 'dual' || mode === 'supabase';
};

export const allowsLegacyVerificationFlow = () => !isSupabaseOnlyAuthProviderMode();
