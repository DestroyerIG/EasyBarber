import { NextRequest } from 'next/server';
import {
  AUTH_COOKIE_NAMES,
  buildRefreshCookieHeader,
  clearAuthCookies,
  errorResponse,
  requestBackendAuth,
  successResponse,
} from '@/lib/server/authBff';

const FALLBACK_LOGOUT_RESPONSE = {
  success: true,
  data: {
    message: 'Logout realizado com sucesso',
  },
};

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(AUTH_COOKIE_NAMES.refresh)?.value;

  if (!refreshToken) {
    const response = successResponse(FALLBACK_LOGOUT_RESPONSE, 200);
    clearAuthCookies(response);
    return response;
  }

  const upstream = await requestBackendAuth('logout', {
    method: 'POST',
    headers: {
      Cookie: buildRefreshCookieHeader(refreshToken),
    },
  });

  if (!upstream.response || upstream.networkError) {
    const response = errorResponse(
      502,
      null,
      'Falha ao comunicar com o serviço de autenticação.'
    );
    clearAuthCookies(response);
    return response;
  }

  if (!upstream.response.ok) {
    const response = errorResponse(
      upstream.response.status,
      upstream.payload,
      'Não foi possível encerrar a sessão.'
    );
    clearAuthCookies(response);
    return response;
  }

  const response = successResponse(upstream.payload, upstream.response.status);
  clearAuthCookies(response);
  return response;
}
