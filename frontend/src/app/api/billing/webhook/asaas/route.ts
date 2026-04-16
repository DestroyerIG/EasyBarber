import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('asaas-access-token');

    if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();

    console.log('📩 Webhook Asaas recebido:', body);

    const event = body.event;
    const payment = body.payment;

    if (!payment) {
      return NextResponse.json({ success: true });
    }

    const paymentId = payment.id;

    // 🔥 Aqui você deve buscar no banco pelo paymentId
    // Ex: const subscription = await findByPaymentId(paymentId)

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        console.log('✅ Pagamento confirmado:', paymentId);

        // atualizar assinatura → active
        break;

      case 'PAYMENT_OVERDUE':
        console.log('⚠️ Pagamento vencido:', paymentId);

        // atualizar → past_due
        break;

      case 'PAYMENT_DELETED':
        console.log('❌ Pagamento removido:', paymentId);

        // atualizar → canceled/unpaid
        break;

      default:
        console.log('Evento ignorado:', event);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Erro webhook Asaas:', error);

    return NextResponse.json(
      { success: false },
      { status: 500 }
    );
  }
}