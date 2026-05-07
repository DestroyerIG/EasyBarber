import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';

export const couponService = {
  async validate(code: string, originalAmount: number): Promise<{ discount: number; finalAmount: number; coupon: Record<string, unknown> | null }> {
    if (!code) return { discount: 0, finalAmount: originalAmount, coupon: null };

    const coupon = await prisma.coupon.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        active: true,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
    });

    if (!coupon) throw new AppError('Cupom inválido ou expirado.', 400, 'INVALID_COUPON');

    // column-vs-column comparison: maxUses vs currentUses — filter app-side
    if (coupon.maxUses !== null && coupon.currentUses >= coupon.maxUses)
      throw new AppError('Cupom inválido ou expirado.', 400, 'INVALID_COUPON');

    const discountValue = Number(coupon.discountValue);
    const discount =
      coupon.discountType === 'percent'
        ? Number(((originalAmount * discountValue) / 100).toFixed(2))
        : Math.min(discountValue, originalAmount);

    const finalAmount = Math.max(0, Number((originalAmount - discount).toFixed(2)));

    return { discount, finalAmount, coupon: coupon as unknown as Record<string, unknown> };
  },

  async validateAndApply(code: string, originalAmount: number) {
    const result = await this.validate(code, originalAmount);

    if (result.coupon) {
      await prisma.coupon.update({
        where: { id: (result.coupon as { id: string }).id },
        data: { currentUses: { increment: 1 } },
      });
    }

    return result;
  },
};
