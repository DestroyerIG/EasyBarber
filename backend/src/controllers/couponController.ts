import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export const listCoupons = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ data: coupons });
  } catch (err) { next(err); }
};

export const createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const { code, description, discount_type, discount_value, max_uses } = body;

    // Accept valid_until (snake), validUntil (camel), or expiresAt (legacy) for compatibility
    const rawValidUntil = body.valid_until ?? body.validUntil ?? body.expiresAt ?? null;
    const parsedValidUntil = rawValidUntil ? new Date(String(rawValidUntil)) : null;

    if (!code || !discount_type || discount_value === undefined || discount_value === null)
      throw new AppError('Campos obrigatórios: code, discount_type, discount_value', 400, 'INVALID_COUPON_PAYLOAD');

    if (!['percent', 'fixed'].includes(String(discount_type)))
      throw new AppError('discount_type deve ser "percent" ou "fixed"', 400, 'INVALID_DISCOUNT_TYPE');

    if (Number(discount_value) <= 0)
      throw new AppError('discount_value deve ser maior que zero', 400, 'INVALID_DISCOUNT_VALUE');

    logger.info({
      event: 'coupon_create_attempt',
      code,
      validUntil: parsedValidUntil,
      discountType: discount_type,
      discountValue: discount_value,
    });

    try {
      const coupon = await prisma.coupon.create({
        data: {
          code: String(code).trim().toUpperCase(),
          description: description ? String(description).trim() : null,
          discountType: String(discount_type),
          discountValue: Number(discount_value),
          maxUses: max_uses ? Number(max_uses) : null,
          validUntil: parsedValidUntil,
        },
      });

      logger.info({ event: 'coupon_created', couponId: coupon.id, code: coupon.code });
      res.status(201).json({ data: coupon });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002')
        return next(new AppError('Já existe um cupom com esse código.', 409, 'COUPON_CODE_DUPLICATE'));
      throw err;
    }
  } catch (err) { next(err); }
};

export const updateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const { description, discount_type, discount_value, max_uses, active } = body;

    // Accept valid_until (snake), validUntil (camel), or expiresAt (legacy) for compatibility
    const hasValidUntil = 'valid_until' in body || 'validUntil' in body || 'expiresAt' in body;
    const rawValidUntil = body.valid_until ?? body.validUntil ?? body.expiresAt ?? null;
    const parsedValidUntil = rawValidUntil ? new Date(String(rawValidUntil)) : null;

    if (discount_type && !['percent', 'fixed'].includes(String(discount_type)))
      throw new AppError('discount_type deve ser "percent" ou "fixed"', 400, 'INVALID_DISCOUNT_TYPE');

    const existing = await prisma.coupon.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError('Cupom não encontrado.', 404, 'COUPON_NOT_FOUND');

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...(description !== undefined && { description: description ? String(description).trim() : null }),
        ...(discount_type !== undefined && { discountType: String(discount_type) }),
        ...(discount_value !== undefined && { discountValue: Number(discount_value) }),
        ...(max_uses !== undefined && { maxUses: max_uses ? Number(max_uses) : null }),
        ...(hasValidUntil && { validUntil: parsedValidUntil }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });
    res.json({ data: coupon });
  } catch (err) { next(err); }
};

export const deleteCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.coupon.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError('Cupom não encontrado.', 404, 'COUPON_NOT_FOUND');
    await prisma.coupon.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) { next(err); }
};
