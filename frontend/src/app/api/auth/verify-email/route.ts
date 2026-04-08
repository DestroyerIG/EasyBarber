import { NextRequest } from 'next/server';
import { errorResponse, requestBackendAuth, successResponse } from '@/lib/server/authBff';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
    || request.nextUrl.searchParams.get('tokenHash');
  const type = request.nextUrl.searchParams.get('type');

  if (!token && !tokenHash) {
    return errorResponse(400, null, 'Token de verificação é obrigatório.');
  }

  const params = new URLSearchParams();

  if (token) {
    params.set('token', token);
  }

  if (tokenHash) {
    params.set('token_hash', tokenHash);
  }

  if (type) {
    params.set('type', type);
  }

  const upstream = await requestBackendAuth(`verify-email?${params.toString()}`, {
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
