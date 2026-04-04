import { NextRequest } from 'next/server';
import {
  AUTH_COOKIE_NAMES,
  buildRefreshCookieHeader,
  clearAuthCookies,
  errorResponse,
  extractAuthTokens,
  requestBackendAuth,
  setAuthCookies,
  successResponse,
} from '@/lib/server/authBff';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(AUTH_COOKIE_NAMES.refresh)?.value;

  if (!refreshToken) {
    const response = errorResponse(401, null, 'Refresh token não fornecido.');
    clearAuthCookies(response);
    return response;
  }

  const upstream = await requestBackendAuth('refresh', {
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
      'Não foi possível renovar a sessão.'
    );
    clearAuthCookies(response);
    return response;
  }

  const { accessToken, refreshToken: nextRefreshToken } = extractAuthTokens(upstream.payload);

  if (!accessToken || !nextRefreshToken) {
    const response = errorResponse(502, upstream.payload, 'Contrato de autenticação inválido.');
    clearAuthCookies(response);
    return response;
  }

  const response = successResponse(upstream.payload, upstream.response.status);
  setAuthCookies(response, accessToken, nextRefreshToken);
  return response;
}
