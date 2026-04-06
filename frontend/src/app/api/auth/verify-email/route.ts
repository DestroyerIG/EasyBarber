import { NextRequest } from 'next/server';
import { errorResponse, requestBackendAuth, successResponse } from '@/lib/server/authBff';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return errorResponse(400, null, 'Token de verificação é obrigatório.');
  }

  const upstream = await requestBackendAuth(`verify-email?token=${encodeURIComponent(token)}`, {
    method: 'GET',
  });

  if (!upstream.response || upstream.networkError) {
    return errorResponse(502, null, 'Falha ao comunicar com o serviço de autenticação.');
  }

  if (!upstream.response.ok) {
    return errorResponse(
      upstream.response.status,
      upstream.payload,
      'Não foi possível verificar o e-mail.'
    );
  }

  return successResponse(upstream.payload, upstream.response.status);
}
