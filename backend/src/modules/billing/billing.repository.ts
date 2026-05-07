import { prisma } from '../../config/prisma.js';
import type { BillingPayment, BillingWebhookEvent } from '@prisma/client';

export const billingRepository = {
  async findPaymentByProviderPaymentId(
    provider: string,
    providerPaymentId: string
  ): Promise<BillingPayment | null> {
    return prisma.billingPayment.findUnique({
      where: { provider_providerPaymentId: { provider, providerPaymentId } },
    });
  },

  async upsertPayment(data: {
    barbershopId: string;
    provider: string;
    providerPaymentId: string;
    providerSubscriptionId?: string | null;
    paymentMethod?: string | null;
    externalStatus?: string | null;
    internalStatus?: string | null;
    amount?: number | null;
    dueDate?: Date | null;
    paidAt?: Date | null;
    pixCopyPaste?: string | null;
    qrCode?: string | null;
  }): Promise<BillingPayment> {
    return prisma.billingPayment.upsert({
      where: {
        provider_providerPaymentId: {
          provider: data.provider,
          providerPaymentId: data.providerPaymentId,
        },
      },
      update: {
        externalStatus: data.externalStatus,
        internalStatus: data.internalStatus,
        paidAt: data.paidAt,
        pixCopyPaste: data.pixCopyPaste,
        qrCode: data.qrCode,
      },
      create: {
        barbershopId: data.barbershopId,
        provider: data.provider,
        providerPaymentId: data.providerPaymentId,
        providerSubscriptionId: data.providerSubscriptionId ?? null,
        paymentMethod: data.paymentMethod ?? null,
        externalStatus: data.externalStatus ?? null,
        internalStatus: data.internalStatus ?? null,
        amount: data.amount ?? null,
        dueDate: data.dueDate ?? null,
        paidAt: data.paidAt ?? null,
        pixCopyPaste: data.pixCopyPaste ?? null,
        qrCode: data.qrCode ?? null,
      },
    });
  },

  async isWebhookEventDuplicate(
    provider: string,
    eventId: string
  ): Promise<boolean> {
    const existing = await prisma.billingWebhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
      select: { id: true },
    });
    return existing !== null;
  },

  async recordWebhookEvent(data: {
    provider: string;
    eventId: string;
    eventType: string;
    barbershopId?: string | null;
    payload?: unknown;
    status?: string;
  }): Promise<BillingWebhookEvent> {
    return prisma.billingWebhookEvent.create({
      data: {
        provider: data.provider,
        eventId: data.eventId,
        eventType: data.eventType,
        barbershopId: data.barbershopId ?? null,
        payload: data.payload as object ?? undefined,
        status: data.status ?? 'processed',
        processedAt: new Date(),
      },
    });
  },

  async findRecentPayments(
    barbershopId: string,
    limit = 10
  ): Promise<BillingPayment[]> {
    return prisma.billingPayment.findMany({
      where: { barbershopId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
