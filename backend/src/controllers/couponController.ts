import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';

export const listCoupons = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ data: coupons });
  } catch (err) { next(err); }
};

export const createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, description, discount_type, discount_value, max_uses, valid_until } = req.body as Record<string, unknown>;

    if (!code || !discount_type || discount_value === undefined || discount_value === null)
      throw new AppError('Campos obrigatórios: code, discount_type, discount_value', 400, 'INVALID_COUPON_PAYLOAD');

    if (!['percent', 'fixed'].includes(String(discount_type)))
      throw new AppError('discount_type deve ser "percent" ou "fixed"', 400, 'INVALID_DISCOUNT_TYPE');

    if (Number(discount_value) <= 0)
      throw new AppError('discount_value deve ser maior que zero', 400, 'INVALID_DISCOUNT_VALUE');

    try {
      const coupon = await prisma.coupon.create({
        data: {
          code: String(code).trim().toUpperCase(),
          description: description ? String(description).trim() : null,
          discountType: String(discount_type),
          discountValue: Number(discount_value),
          maxUses: max_uses ? Number(max_uses) : null,
          expiresAt: valid_until ? new Date(String(valid_until)) : null,
        },
      });
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
    const { description, discount_type, discount_value, max_uses, valid_until, active } = req.body as Record<string, unknown>;

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
        ...(valid_until !== undefined && { expiresAt: valid_until ? new Date(String(valid_until)) : null }),
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
