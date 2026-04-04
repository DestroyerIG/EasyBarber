import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.BACKEND_API_URL || 'http://localhost:5000/api/v1';

export async function proxyRequest(
  request: Request,
  path: string,
  method: string
) {
  const cookie = request.headers.get('cookie') || '';

  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body:
      method !== 'GET' && method !== 'HEAD'
        ? await request.text()
        : undefined,
    cache: 'no-store',
  });

  const data = await response.text();

  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('content-type') || 'application/json',
    },
  });
}