const DEFAULT_AUTH_PROVIDER_MODE = 'supabase';

const normalizeMode = (_value: unknown): string => DEFAULT_AUTH_PROVIDER_MODE;

export const getAuthProviderMode = (): string =>
  normalizeMode(process.env.AUTH_PROVIDER_MODE);

export const isLegacyAuthProviderMode = (): false => false;

export const isSupabaseOnlyAuthProviderMode = (): true => true;

export const isSupabasePrimaryAuthProviderMode = (): true => true;

export const allowsLegacyVerificationFlow = (): false => false;

export const isDeprecatedAuthProviderModeValue = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'legacy' || normalized === 'dual';
};
