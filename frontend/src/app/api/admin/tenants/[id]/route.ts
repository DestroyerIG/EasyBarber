import { proxyRequest } from '@/lib/server/proxy';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/admin/tenants/${id}`, 'GET');
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/admin/tenants/${id}`, 'DELETE');
}
