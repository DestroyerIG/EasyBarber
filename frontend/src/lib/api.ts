import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

type ApiSuccessPayload<T = unknown> = {
  success: true;
  data: T;
  meta?: unknown;
  message?: string;
};

type RefreshResponse = {
  user?: unknown;
};

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 150000, // 150s — comporta o wake-up do Render free tier (~120s)
});

let refreshPromise: Promise<void> | null = null;

const shouldSkipRefreshByUrl = (url: string) => {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/verify-email') ||
    url.includes('/auth/resend-verification') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
};

const notifySessionExpired = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event('auth:session-expired'));

  const currentPath = window.location.pathname;
  if (currentPath !== '/login' && currentPath !== '/cadastro') {
    window.location.replace('/login');
  }
};

const ensureSessionRefresh = async () => {
  if (!refreshPromise) {
    refreshPromise = api
      .post<RefreshResponse>('/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

api.interceptors.response.use(
  (response: AxiosResponse) => {
    if (
      response.data &&
      typeof response.data === 'object' &&
      (response.data as Record<string, unknown>).success === true &&
      'data' in (response.data as Record<string, unknown>)
    ) {
      const payload = response.data as ApiSuccessPayload;

      response.data = payload.data;

      if (payload.meta !== undefined) {
        (response as AxiosResponse & { meta?: unknown }).meta = payload.meta;
      }

      if (payload.message !== undefined) {
        (response as AxiosResponse & { message?: string }).message = payload.message;
      }
    }

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (error.response?.data && typeof error.response.data === 'object') {
      const data = error.response.data as {
        error?: { code?: string; message?: string; details?: string[] } | string;
        details?: string[];
        errorCode?: string;
      };

      if (typeof data.error === 'object' && data.error?.message) {
        const details = data.error.details;
        const code = data.error.code;
        (error.response.data as Record<string, unknown>).error = data.error.message;

        if (typeof code === 'string' && code.trim().length > 0) {
          (error.response.data as Record<string, unknown>).errorCode = code;
        }

        if (details) {
          (error.response.data as Record<string, unknown>).details = details;
        }
      }
    }

    const status = error.response?.status;
    const url = originalRequest?.url || '';

    if (!originalRequest || status !== 401) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    if (shouldSkipRefreshByUrl(url)) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await ensureSessionRefresh();
      return api(originalRequest);
    } catch (refreshError) {
      if (!url.includes('/auth/me')) {
        notifySessionExpired();
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;