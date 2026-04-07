import { proxyRequest } from '@/lib/server/proxy';

export async function PUT(request: Request) {
  return proxyRequest(request, '/whatsapp/config/menu-reorder', 'PUT');
}
