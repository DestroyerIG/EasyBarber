import { proxyRequest } from '@/lib/server/proxy';
export async function GET(request: Request) {
  return proxyRequest(request, '/whatsapp/config', 'GET');
}
export async function PUT(request: Request) {
  return proxyRequest(request, '/whatsapp/config', 'PUT');
}
export async function POST(request: Request) {
  return proxyRequest(request, '/whatsapp/config', 'POST');
}
