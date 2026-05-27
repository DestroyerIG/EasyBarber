import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request) {
  return proxyRequest(request, '/whatsapp/meta/config', 'GET');
}

export async function PUT(request: Request) {
  return proxyRequest(request, '/whatsapp/meta/config', 'PUT');
}

export async function DELETE(request: Request) {
  return proxyRequest(request, '/whatsapp/meta/config', 'DELETE');
}
