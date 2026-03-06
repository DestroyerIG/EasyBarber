import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000,
});

// Interceptor de resposta: redirecionar em 401, tentar refresh automaticamente
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => {
    // Auto-unwrap standardized backend responses { success: true, data: ... }
    if (response.data && typeof response.data === 'object' && response.data.success === true && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    // Normalize error: preserve details array, flatten message
    if (error.response?.data?.error?.message) {
      const details = error.response.data.error.details;
      error.response.data.error = error.response.data.error.message;
      if (details) {
        error.response.data.details = details;
      }
    }

    const originalRequest = error.config;

    // Se o erro for 401 e não for uma tentativa de refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login')
    ) {
      if (isRefreshing) {
        // Enfileirar requests enquanto refresh está em andamento
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
