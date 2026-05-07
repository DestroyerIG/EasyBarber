/**
 * whatsappSessionService.ts — Gerenciamento de sessões do bot WhatsApp.
 * Cada sessão representa uma conversa ativa entre o bot e um número de phone.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { SESSION_TIMEOUT_MS, STEPS } from './whatsappConstants.js';

export interface WhatsAppSession {
  id: string;
  phone: string;
  barbershopId: string;
  step: string;
  data: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Busca sessão ativa para o phone/barbershop.
 * Retorna null se não encontrada.
 */
export const getSession = async (phone: string, barbershopId: string): Promise<WhatsAppSession | null> => {
  const session = await prisma.whatsappSession.findFirst({
    where: { phone, barbershopId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!session) return null;
  return {
    id: session.id,
    phone: session.phone,
    barbershopId: session.barbershopId,
    step: session.step,
    data: (session.data as Record<string, unknown>) ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

/**
 * Verifica se a sessão expirou (30 min de inatividade por padrão).
 */
export const isSessionExpired = (session: WhatsAppSession | null): boolean => {
  if (!session) return true;
  return (Date.now() - new Date(session.updatedAt).getTime()) > SESSION_TIMEOUT_MS;
};

/**
 * Cria sessão nova no step 'menu' com data vazia.
 */
export const createSession = async (phone: string, barbershopId: string): Promise<void> => {
  await prisma.whatsappSession.create({
    data: {
      phone,
      barbershopId,
      step: STEPS.MENU,
      data: Prisma.JsonNull,
    },
  });
};

/**
 * Atualiza step e data da sessão.
 */
export const updateSession = async (
  phone: string,
  barbershopId: string,
  step: string,
  data: Record<string, unknown>,
): Promise<void> => {
  await prisma.whatsappSession.updateMany({
    where: { phone, barbershopId },
    data: {
      step,
      data: data as Prisma.InputJsonValue,
    },
  });
};

/**
 * Remove sessões do phone/barbershop.
 */
export const deleteSession = async (phone: string, barbershopId: string): Promise<void> => {
  await prisma.whatsappSession.deleteMany({
    where: { phone, barbershopId },
  });
};
