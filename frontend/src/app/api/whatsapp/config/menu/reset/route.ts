import { proxyRequest } from '@/lib/server/proxy';

export async function POST(request: Request) {
  return proxyRequest(request, '/whatsapp/config/menu/reset', 'POST');
}
