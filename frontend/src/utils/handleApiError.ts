import axios from 'axios';

/**
 * Extrai mensagem de erro amigável de qualquer tipo de erro HTTP.
 * Substitui catches genéricos com `any` nos componentes.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Ocorreu um erro inesperado'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;

    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.error?.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;

    if (error.response?.status === 429) return 'Muitas requisições. Aguarde um momento.';
    if (error.response?.status === 403) return 'Acesso negado.';
    if (error.response?.status === 404) return 'Recurso não encontrado.';
    if (error.code === 'ECONNABORTED') return 'Tempo de conexão esgotado.';
    if (!error.response) return 'Erro de conexão. Verifique sua internet.';
  }

  if (error instanceof Error) return error.message;

  return fallback;
}
