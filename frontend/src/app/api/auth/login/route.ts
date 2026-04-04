import { NextRequest } from 'next/server';
import {
  clearAuthCookies,
  errorResponse,
  extractAuthTokens,
  requestBackendAuth,
  setAuthCookies,
  successResponse,
} from '@/lib/server/authBff';

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, null, 'Corpo JSON inválido.');
  }

  const upstream = await requestBackendAuth('login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
    return errorResponse(upstream.response.status, upstream.payload, 'Falha ao realizar login.');
  }

  const { accessToken, refreshToken } = extractAuthTokens(upstream.payload);

  if (!accessToken || !refreshToken) {
    const response = errorResponse(502, upstream.payload, 'Contrato de autenticação inválido.');
    clearAuthCookies(response);
    return response;
  }

  const response = successResponse(upstream.payload, upstream.response.status);
  setAuthCookies(response, accessToken, refreshToken);
  return response;
}
