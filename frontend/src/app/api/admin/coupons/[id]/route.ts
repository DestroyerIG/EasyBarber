import { proxyRequest } from '@/lib/server/proxy';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/admin/coupons/${id}`, 'PATCH');
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/admin/coupons/${id}`, 'DELETE');
}
