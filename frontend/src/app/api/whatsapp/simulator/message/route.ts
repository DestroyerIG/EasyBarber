import { NextResponse } from 'next/server';
import { proxyRequest } from '@/lib/server/proxy';

const normalizeBarbershopId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

export async function POST(request: Request) {
  try {
    const body = await request.clone().json();
    const barbershopId = normalizeBarbershopId(body?.barbershopId);

    if (!barbershopId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Campo barbershopId e obrigatorio para o simulador do WhatsApp.',
          error: {
            code: 'WHATSAPP_SIMULATOR_BARBERSHOP_REQUIRED',
            message: 'Campo barbershopId e obrigatorio para o simulador do WhatsApp.',
          },
        },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: 'Payload JSON invalido para o simulador do WhatsApp.',
        error: {
          code: 'WHATSAPP_SIMULATOR_INVALID_PAYLOAD',
          message: 'Payload JSON invalido para o simulador do WhatsApp.',
        },
      },
      { status: 400 }
    );
  }

  return proxyRequest(request, '/whatsapp/simulator/message', 'POST');
}
