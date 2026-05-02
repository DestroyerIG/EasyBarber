import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';

export const couponService = {
  /**
   * Valida o cupom e calcula desconto SEM consumir uso.
   * Usar para visualização (rota /validate-coupon).
   */
  async validate(code, originalAmount) {
    if (!code) return { discount: 0, finalAmount: originalAmount, coupon: null };

    const result = await pool.query(
      `SELECT * FROM coupons
       WHERE UPPER(code) = UPPER($1)
         AND active = TRUE
         AND (valid_until IS NULL OR valid_until > NOW())
         AND (max_uses IS NULL OR current_uses < max_uses)`,
      [code.trim()]
    );

    const coupon = result.rows[0];
    if (!coupon) throw new AppError('Cupom inválido ou expirado.', 400, 'INVALID_COUPON');

    const discount =
      coupon.discount_type === 'percent'
        ? Number(((originalAmount * Number(coupon.discount_value)) / 100).toFixed(2))
        : Math.min(Number(coupon.discount_value), originalAmount);

    const finalAmount = Math.max(0, Number((originalAmount - discount).toFixed(2)));

    return { discount, finalAmount, coupon };
  },

  /**
   * Valida o cupom, calcula desconto E incrementa current_uses.
   * Usar SOMENTE no checkout efetivo (billingService.createCheckoutSession).
   */
  async validateAndApply(code, originalAmount) {
    const result = await this.validate(code, originalAmount);

    if (result.coupon) {
      await pool.query(
        `UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1`,
        [result.coupon.id]
      );
    }

    return result;
  },
};
