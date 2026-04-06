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
  const search = requestUrl.search || '';
  return `${BACKEND_URL}${path}${search}`;
}

function copyResponseHeaders(source: Headers, target: Headers) {
  source.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;

    // muito importante para auth
    if (lowerKey === 'set-cookie') {
      target.append(key, value);
      return;
    }

    target.set(key, value);
  });
}

export async function proxyRequest(
  request: Request,
  path: string,
  method?: string
) {
  const requestMethod = method || request.method;
  const backendUrl = buildBackendUrl(request, path);

  const incomingHeaders = new Headers(request.headers);
  const outgoingHeaders = new Headers();

  incomingHeaders.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;

    // repassa headers relevantes
    outgoingHeaders.set(key, value);
  });

  let body: BodyInit | undefined = undefined;

  if (requestMethod !== 'GET' && requestMethod !== 'HEAD') {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      body = await request.text();
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('text/plain') ||
      contentType.includes('multipart/form-data')
    ) {
      body = await request.arrayBuffer();
    } else {
      body = await request.arrayBuffer();
    }
  }

  const backendResponse = await fetch(backendUrl, {
    method: requestMethod,
    headers: outgoingHeaders,
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseBody = await backendResponse.arrayBuffer();

  const responseHeaders = new Headers();
  copyResponseHeaders(backendResponse.headers, responseHeaders);

  return new NextResponse(responseBody, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: responseHeaders,
  });
}