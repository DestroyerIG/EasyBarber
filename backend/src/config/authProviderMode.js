const DEFAULT_AUTH_PROVIDER_MODE = 'supabase';

const normalizeMode = (_value) => {
  // AUTH_PROVIDER_MODE is deprecated. Supabase Auth is the only supported provider.
  return DEFAULT_AUTH_PROVIDER_MODE;
};

export const getAuthProviderMode = () => normalizeMode(process.env.AUTH_PROVIDER_MODE);

export const isLegacyAuthProviderMode = () => false;

export const isSupabaseOnlyAuthProviderMode = () => true;

export const isSupabasePrimaryAuthProviderMode = () => true;

export const allowsLegacyVerificationFlow = () => false;

export const isDeprecatedAuthProviderModeValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'legacy' || normalized === 'dual';
};
