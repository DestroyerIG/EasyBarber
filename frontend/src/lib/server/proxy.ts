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

export async function proxyRequest(
  request: Request,
  path: string,
  method?: string
) {
  const requestMethod = method || request.method;
  const backendUrl = buildBackendUrl(request, path);

  try {
    const headers = buildHeaders(request);

    const backendResponse = await fetch(backendUrl, {
      method: requestMethod,
      headers,
      body:
        requestMethod === 'GET' || requestMethod === 'HEAD'
          ? undefined
          : request.body,
    });

    const text = await backendResponse.text();

    const responseHeaders = new Headers();
    copyResponseHeaders(backendResponse.headers, responseHeaders);

    return new NextResponse(text, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Erro ao comunicar com o backend',
      },
      { status: 503 }
    );
  }
}