import type { Request, Response, NextFunction } from 'express';
import type { Coupon } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// Prisma returns camelCase; frontend AdminCoupon type expects snake_case.
const toCouponResponse = (c: Coupon) => ({
  id: c.id,
  code: c.code,
  description: c.description,
  discount_type: c.discountType,
  discount_value: c.discountValue,
  max_uses: c.maxUses,
  current_uses: c.currentUses,
  valid_until: c.validUntil,
  active: c.active,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
});

export const listCoupons = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ data: coupons.map(toCouponResponse) });
  } catch (err) { next(err); }
};

export const createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const { code, description } = body;

    // Normalize: accept snake_case, camelCase, or legacy aliases
    const discountType = String(body.discount_type ?? body.discountType ?? body.type ?? 'percent');
    const discountValue = Number(body.discount_value ?? body.discountValue ?? body.value ?? 0);
    const maxUses = (body.max_uses ?? body.maxUses) ? Number(body.max_uses ?? body.maxUses) : null;
    const rawValidUntil = body.valid_until ?? body.validUntil ?? body.expiresAt ?? null;
    const validUntil = rawValidUntil ? new Date(String(rawValidUntil)) : null;

    if (!code || !discountType || discountValue === undefined || discountValue === null)
      throw new AppError('Campos obrigatórios: code, discount_type, discount_value', 400, 'INVALID_COUPON_PAYLOAD');

    if (!['percent', 'fixed'].includes(discountType))
      throw new AppError('discount_type deve ser "percent" ou "fixed"', 400, 'INVALID_DISCOUNT_TYPE');

    if (discountValue <= 0)
      throw new AppError('discount_value deve ser maior que zero', 400, 'INVALID_DISCOUNT_VALUE');

    logger.info({
      event: 'coupon_create_attempt',
      code,
      discountType,
      discountValue,
      maxUses,
      validUntil,
    });

    try {
      const coupon = await prisma.coupon.create({
        data: {
          code: String(code).trim().toUpperCase(),
          description: description ? String(description).trim() : null,
          discountType,
          discountValue,
          maxUses,
          validUntil,
        },
      });

      logger.info({ event: 'coupon_created', couponId: coupon.id, code: coupon.code });
      res.status(201).json({ data: toCouponResponse(coupon) });
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

    const discountType = body.discount_type ?? body.discountType;
    const discountValue = body.discount_value ?? body.discountValue;
    const maxUses = body.max_uses ?? body.maxUses;
    const hasValidUntil = 'valid_until' in body || 'validUntil' in body || 'expiresAt' in body;
    const rawValidUntil = body.valid_until ?? body.validUntil ?? body.expiresAt ?? null;
    const validUntil = rawValidUntil ? new Date(String(rawValidUntil)) : null;
    const { description, active } = body;

    if (discountType && !['percent', 'fixed'].includes(String(discountType)))
      throw new AppError('discount_type deve ser "percent" ou "fixed"', 400, 'INVALID_DISCOUNT_TYPE');

    const existing = await prisma.coupon.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError('Cupom não encontrado.', 404, 'COUPON_NOT_FOUND');

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...(description !== undefined && { description: description ? String(description).trim() : null }),
        ...(discountType !== undefined && { discountType: String(discountType) }),
        ...(discountValue !== undefined && { discountValue: Number(discountValue) }),
        ...(maxUses !== undefined && { maxUses: maxUses ? Number(maxUses) : null }),
        ...(hasValidUntil && { validUntil }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });
    res.json({ data: toCouponResponse(coupon) });
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
