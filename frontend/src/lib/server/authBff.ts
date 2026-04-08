import { NextResponse } from 'next/server';

type BackendEnvelope = {
  success?: boolean;
  data?: unknown;
  message?: string;
  error?: unknown;
  meta?: unknown;
};

type BackendRequestResult = {
  response?: Response;
  payload: BackendEnvelope | null;
  networkError?: unknown;
  timedOut?: boolean;
  timeoutMs?: number;
};

type AuthTokens = {
  accessToken?: string;
  refreshToken?: string;
};

const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_BACKEND_AUTH_TIMEOUT_MS = 20000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export const AUTH_COOKIE_NAMES = {
  access: ACCESS_TOKEN_COOKIE_NAME,
  refresh: REFRESH_TOKEN_COOKIE_NAME,
} as const;

const resolveBackendAuthTimeoutMs = () => {
  const parsed = Number.parseInt(process.env.AUTH_BFF_UPSTREAM_TIMEOUT_MS || '', 10);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_BACKEND_AUTH_TIMEOUT_MS;
  }

  return parsed;
};

const createTimeoutSignal = (
  timeoutMs: number,
  upstreamSignal?: AbortSignal | null
) => {
  const controller = new AbortController();
  let timedOut = false;

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
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);

    if (upstreamSignal) {
      upstreamSignal.removeEventListener('abort', abortFromUpstream);
    }
  };

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup,
  };
};

const resolveBackendApiBaseUrl = () => {
  const rawBase =
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';

  const normalized = rawBase.replace(/\/+$/, '');
  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
};

const getBackendAuthUrl = (path: string) => {
  const normalizedPath = path.replace(/^\/+/, '');
  return `${resolveBackendApiBaseUrl()}/auth/${normalizedPath}`;
};

const parseResponsePayload = async (response: Response): Promise<BackendEnvelope | null> => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as BackendEnvelope;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const pickPayloadMessage = (payload: BackendEnvelope | null): string | null => {
  if (!payload) return null;

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error;
  }

  if (
    payload.error &&
    typeof payload.error === 'object' &&
    typeof (payload.error as { message?: unknown }).message === 'string'
  ) {
    return ((payload.error as { message?: string }).message || '').trim() || null;
  }

  return null;
};

const getErrorCodeByStatus = (status: number) => {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'REQUEST_ERROR';
};

const normalizeErrorEnvelope = (
  status: number,
  payload: BackendEnvelope | null,
  fallbackMessage: string
): BackendEnvelope => {
  if (payload?.success === false) {
    return payload;
  }

  const message = pickPayloadMessage(payload) || fallbackMessage;

  return {
    success: false,
    message,
    error: {
      code: getErrorCodeByStatus(status),
      message,
    },
  };
};

const stripTokensFromData = (data: unknown): unknown => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  const safeData = { ...(data as Record<string, unknown>) };
  delete safeData.token;
  delete safeData.refreshToken;
  return safeData;
};

const sanitizeSuccessEnvelope = (payload: BackendEnvelope | null): BackendEnvelope => {
  if (!payload || typeof payload !== 'object') {
    return {
      success: true,
      data: {},
    };
  }

  if (payload.success !== true) {
    return payload;
  }

  if (!('data' in payload)) {
    return payload;
  }

  return {
    ...payload,
    data: stripTokensFromData(payload.data),
  };
};

export const requestBackendAuth = async (
  path: string,
  init: RequestInit = {}
): Promise<BackendRequestResult> => {
  const timeoutMs = resolveBackendAuthTimeoutMs();
  const { signal, didTimeout, cleanup } = createTimeoutSignal(timeoutMs, init.signal);

  try {
    const response = await fetch(getBackendAuthUrl(path), {
      ...init,
      cache: 'no-store',
      signal,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });

    const payload = await parseResponsePayload(response);
    return {
      response,
      payload,
      timeoutMs,
    };
  } catch (networkError) {
    return {
      payload: null,
      networkError,
      timedOut: didTimeout(),
      timeoutMs,
    };
  } finally {
    cleanup();
  }
};

export const extractAuthTokens = (payload: BackendEnvelope | null): AuthTokens => {
  if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    return {};
  }

  const data = payload.data as Record<string, unknown>;

  return {
    accessToken: typeof data.token === 'string' ? data.token : undefined,
    refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : undefined,
  };
};

export const successResponse = (payload: BackendEnvelope | null, status = 200) => {
  return NextResponse.json(sanitizeSuccessEnvelope(payload), { status });
};

export const errorResponse = (
  status: number,
  payload: BackendEnvelope | null,
  fallbackMessage: string
) => {
  return NextResponse.json(normalizeErrorEnvelope(status, payload, fallbackMessage), {
    status,
  });
};

export const setAuthCookies = (
  response: NextResponse,
  accessToken: string,
  refreshToken: string
) => {
  response.cookies.set({
    ...COOKIE_OPTIONS,
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: accessToken,
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });

  response.cookies.set({
    ...COOKIE_OPTIONS,
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: refreshToken,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
};

export const clearAuthCookies = (response: NextResponse) => {
  response.cookies.set({
    ...COOKIE_OPTIONS,
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: '',
    maxAge: 0,
  });

  response.cookies.set({
    ...COOKIE_OPTIONS,
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: '',
    maxAge: 0,
  });
};

export const buildRefreshCookieHeader = (refreshToken: string) => {
  return `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`;
};
