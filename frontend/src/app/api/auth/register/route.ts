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

  try {
    const upstream = await requestBackendAuth('register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.response || upstream.networkError) {
      const status = upstream.timedOut ? 504 : 502;
      const message = upstream.timedOut
        ? 'Tempo esgotado ao comunicar com o serviço de autenticação.'
        : 'Falha ao comunicar com o serviço de autenticação.';

      console.error('[auth/register][bff] falha no upstream', {
        timedOut: Boolean(upstream.timedOut),
        timeoutMs: upstream.timeoutMs,
        reason:
          upstream.networkError instanceof Error
            ? upstream.networkError.message
            : String(upstream.networkError || 'erro-desconhecido'),
      });

      const response = errorResponse(status, null, message);
      clearAuthCookies(response);
      return response;
    }

    if (!upstream.response.ok) {
      const response = errorResponse(
        upstream.response.status,
        upstream.payload,
        'Falha ao realizar cadastro.'
      );
      clearAuthCookies(response);
      return response;
    }

    const response = successResponse(upstream.payload, upstream.response.status);
    clearAuthCookies(response);
    return response;
  } catch (error) {
    console.error('[auth/register][bff] erro inesperado', {
      reason: error instanceof Error ? error.message : String(error),
    });

    const response = errorResponse(
      502,
      null,
      'Falha inesperada ao encaminhar cadastro para autenticação.'
    );
    clearAuthCookies(response);
    return response;
  }
}
