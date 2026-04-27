import { NextRequest } from 'next/server';
import { proxyRequest } from '@/lib/server/proxy';

export async function POST(request: NextRequest) {
  return proxyRequest(request, '/billing/webhook/stripe', 'POST');
}
