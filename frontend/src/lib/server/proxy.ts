import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.BACKEND_API_URL || 'http://localhost:5000/api/v1';

const PROXY_TIMEOUT_MS = Number.parseInt(
  process.env.PROXY_TIMEOUT_MS || '30000',
  10
);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
  'accept-encoding',
  'content-encoding',
]);

function buildBackendUrl(request: Request, path: string) {
  const requestUrl = new URL(request.url);
  const search = requestUrl.search || '';
  return `${BACKEND_URL}${path}${search}`;
}

function copyResponseHeaders(source: Headers, target: Headers) {
  source.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;

    if (lowerKey === 'set-cookie') {
      target.append(key, value);
      return;
    }

    target.set(key, value);
  });
}

function buildOutgoingHeaders(request: Request) {
  const incomingHeaders = new Headers(request.headers);
  const outgoingHeaders = new Headers();

  incomingHeaders.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;

    outgoingHeaders.set(key, value);
  });

  const cookie = request.headers.get('cookie');
  if (cookie) {
    outgoingHeaders.set('cookie', cookie);
  }

  const requestUrl = new URL(request.url);
  outgoingHeaders.set('x-forwarded-host', requestUrl.host);
  outgoingHeaders.set(
    'x-forwarded-proto',
    requestUrl.protocol.replace(':', '')
  );

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    outgoingHeaders.set('x-forwarded-for', forwardedFor);
  }

  return outgoingHeaders;
}

async function readRequestBody(
  request: Request,
  requestMethod: string
): Promise<BodyInit | undefined> {
  if (requestMethod === 'GET' || requestMethod === 'HEAD') {
    return undefined;
  }

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return await request.text();
  }

  return await request.arrayBuffer();
}

export async function proxyRequest(
  request: Request,
  path: string,
  method?: string
) {
  const requestMethod = method || request.method;
  const backendUrl = buildBackendUrl(request, path);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const outgoingHeaders = buildOutgoingHeaders(request);
    const body = await readRequestBody(request, requestMethod);

    const backendResponse = await fetch(backendUrl, {
      method: requestMethod,
      headers: outgoingHeaders,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });

    const responseText = await backendResponse.text();

    const responseHeaders = new Headers();
    copyResponseHeaders(backendResponse.headers, responseHeaders);

    return new NextResponse(responseText, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const isAbortError =
      error instanceof Error && error.name === 'AbortError';

    console.error('Proxy request failed', {
      backendUrl,
      method: requestMethod,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        message: isAbortError
          ? 'Tempo limite ao comunicar com o backend'
          : 'Falha ao comunicar com o backend',
        error: {
          code: isAbortError ? 'PROXY_TIMEOUT' : 'PROXY_REQUEST_FAILED',
        },
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}