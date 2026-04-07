import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.BACKEND_API_URL || 'http://localhost:5000/api/v1';

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
  return `${BACKEND_URL}${path}${requestUrl.search}`;
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

function buildHeaders(request: Request) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;

    headers.set(key, value);
  });

  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }

  return headers;
}

async function readBody(
  request: Request,
  method: string
): Promise<BodyInit | undefined> {
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }

  const contentLength = request.headers.get('content-length');
  if (!contentLength || contentLength === '0') {
    return undefined;
  }

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return await request.text();
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('text/plain')
  ) {
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

  try {
    const headers = buildHeaders(request);
    const body = await readBody(request, requestMethod);

    if (body === undefined) {
      headers.delete('content-type');
      headers.delete('content-length');
    }

    const backendResponse = await fetch(backendUrl, {
      method: requestMethod,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
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
    console.error('Proxy request failed', {
      backendUrl,
      method: requestMethod,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Erro ao comunicar com o backend',
        error: {
          code: 'PROXY_REQUEST_FAILED',
          details: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 503 }
    );
  }
}