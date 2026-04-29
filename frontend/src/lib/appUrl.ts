const DEFAULT_PRODUCTION_APP_URL = 'https://barberpro-saas-2-0.vercel.app';

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : '';
};

export const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export const ensureAbsoluteUrl = (value: string | undefined) => {
  const normalized = normalizeEnvValue(value);

  if (!normalized) {
    return '';
  }

  const withProtocol =
    normalized.startsWith('http://') || normalized.startsWith('https://')
      ? normalized
      : `https://${normalized}`;

  try {
    return trimTrailingSlash(new URL(withProtocol).toString());
  } catch {
    return '';
  }
};

export const resolveAppUrl = () => {
  const configuredAppUrl = ensureAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL);

  if (configuredAppUrl) {
    return configuredAppUrl;
  }

  if (typeof window === 'undefined') {
    const serverConfiguredUrl =
      ensureAbsoluteUrl(process.env.FRONTEND_URL)
      || (process.env.NODE_ENV === 'production' ? '' : ensureAbsoluteUrl(process.env.VERCEL_URL));

    if (serverConfiguredUrl) {
      return serverConfiguredUrl;
    }
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return trimTrailingSlash(window.location.origin);
  }

  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_PRODUCTION_APP_URL;
  }

  return 'http://localhost:3000';
};

export const resolveResetPasswordRedirectUrl = (fallbackAppUrl?: string) => {
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${trimTrailingSlash(window.location.origin)}/auth/redefinir-senha`;
  }

  const appUrl = ensureAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL) || fallbackAppUrl || resolveAppUrl();

  return `${trimTrailingSlash(appUrl)}/auth/redefinir-senha`;
};
