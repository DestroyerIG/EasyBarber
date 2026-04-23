import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request) {
  return proxyRequest(request, '/barbershop/account-profile', 'GET');
}

export async function PUT(request: Request) {
  return proxyRequest(request, '/barbershop/account-profile', 'PUT');
}
