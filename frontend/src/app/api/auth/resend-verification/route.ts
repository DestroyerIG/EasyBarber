import { NextRequest } from 'next/server';
import { errorResponse, requestBackendAuth, successResponse } from '@/lib/server/authBff';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
};

const normalizeEmailRedirectTo = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/\/+$/, '') === '/auth/confirm' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, null, 'Corpo JSON inválido.');
  }

  const email = normalizeEmail((body as { email?: unknown } | null)?.email);
  const emailRedirectTo = normalizeEmailRedirectTo(
    (body as { emailRedirectTo?: unknown } | null)?.emailRedirectTo
  );

  if (!email || !EMAIL_REGEX.test(email)) {
    return errorResponse(400, null, 'E-mail inválido.');
  }

  console.info('[auth/resend-verification][bff] request received', {
    email,
  });

  const upstream = await requestBackendAuth('resend-verification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    }),
  });

  if (!upstream.response || upstream.networkError) {
    const status = upstream.timedOut ? 504 : 502;

    console.error('[auth/resend-verification][bff] upstream unavailable', {
      email,
      timedOut: Boolean(upstream.timedOut),
      timeoutMs: upstream.timeoutMs,
      reason:
        upstream.networkError instanceof Error
          ? upstream.networkError.message
          : String(upstream.networkError || 'erro-desconhecido'),
      finalStatus: status,
    });

    return errorResponse(
      status,
      null,
      upstream.timedOut
        ? 'Tempo esgotado ao comunicar com o serviço de autenticação.'
        : 'Falha ao comunicar com o serviço de autenticação.'
    );
  }

  if (!upstream.response.ok) {
    console.warn('[auth/resend-verification][bff] upstream returned error', {
      email,
      upstreamStatus: upstream.response.status,
      payload: upstream.payload,
      finalStatus: upstream.response.status,
    });

    return errorResponse(
      upstream.response.status,
      upstream.payload,
      'Não foi possível processar o reenvio de verificação.'
    );
  }

  console.info('[auth/resend-verification][bff] upstream returned success', {
    email,
    upstreamStatus: upstream.response.status,
    payload: upstream.payload,
    finalStatus: upstream.response.status,
  });

  return successResponse(upstream.payload, upstream.response.status);
}
