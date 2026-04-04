import { NextRequest } from 'next/server';
import {
  AUTH_COOKIE_NAMES,
  errorResponse,
  requestBackendAuth,
  successResponse,
} from '@/lib/server/authBff';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(AUTH_COOKIE_NAMES.access)?.value;

  if (!accessToken) {
    return errorResponse(401, null, 'Sessão não autenticada.');
  }

  const upstream = await requestBackendAuth('me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!upstream.response || upstream.networkError) {
    return errorResponse(502, null, 'Falha ao comunicar com o serviço de autenticação.');
  }

  if (!upstream.response.ok) {
    return errorResponse(
      upstream.response.status,
      upstream.payload,
      'Não foi possível carregar a sessão.'
    );
  }

  return successResponse(upstream.payload, upstream.response.status);
}
