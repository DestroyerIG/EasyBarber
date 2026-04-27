import { NextRequest } from 'next/server';
import { errorResponse, requestBackendAuth, successResponse } from '@/lib/server/authBff';

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, null, 'Corpo JSON inválido.');
  }

  const upstream = await requestBackendAuth('confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.response || upstream.networkError) {
    return errorResponse(502, null, 'Falha ao comunicar com o serviço de autenticação.');
  }

  if (!upstream.response.ok) {
    return errorResponse(
      upstream.response.status,
      upstream.payload,
      'Não foi possível finalizar o cadastro.'
    );
  }

  return successResponse(upstream.payload, upstream.response.status);
}
