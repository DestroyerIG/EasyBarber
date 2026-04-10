import { proxyRequest } from '@/lib/server/proxy';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyRequest(request, `/appointments/${id}/status`, 'PUT');
}