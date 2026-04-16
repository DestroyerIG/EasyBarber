import { proxyRequest } from '@/lib/server/proxy';

export async function GET(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await context.params;

  return proxyRequest(request, `/billing/pix/${paymentId}`, 'GET');
}
