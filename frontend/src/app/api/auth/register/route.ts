import { NextRequest } from 'next/server';
import {
  clearAuthCookies,
  errorResponse,
  requestBackendAuth,
  successResponse,
} from '@/lib/server/authBff';

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, null, 'Corpo JSON inválido.');
  }

  const upstream = await requestBackendAuth('register', {
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
    return errorResponse(upstream.response.status, upstream.payload, 'Falha ao realizar cadastro.');
  }

  const response = successResponse(upstream.payload, upstream.response.status);
  clearAuthCookies(response);
  return response;
}
