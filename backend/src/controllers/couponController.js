import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';

// GET /admin/coupons - listar todos
export const listCoupons = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM coupons ORDER BY created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
};

// POST /admin/coupons - criar
export const createCoupon = async (req, res, next) => {
  try {
    const { code, description, discount_type, discount_value, max_uses, valid_until } = req.body;

    if (!code || !discount_type || discount_value === undefined || discount_value === null)
      throw new AppError('Campos obrigatórios: code, discount_type, discount_value', 400, 'INVALID_COUPON_PAYLOAD');

    if (!['percent', 'fixed'].includes(discount_type))
      throw new AppError('discount_type deve ser "percent" ou "fixed"', 400, 'INVALID_DISCOUNT_TYPE');

    if (Number(discount_value) <= 0)
      throw new AppError('discount_value deve ser maior que zero', 400, 'INVALID_DISCOUNT_VALUE');

    const { rows } = await pool.query(
      `INSERT INTO coupons (code, description, discount_type, discount_value, max_uses, valid_until)
       VALUES (UPPER($1), $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        code.trim(),
        description?.trim() || null,
        discount_type,
        Number(discount_value),
        max_uses ? Number(max_uses) : null,
        valid_until || null,
      ]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return next(new AppError('Já existe um cupom com esse código.', 409, 'COUPON_CODE_DUPLICATE'));
    next(err);
  }
};

// PATCH /admin/coupons/:id - editar
export const updateCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { description, discount_type, discount_value, max_uses, valid_until, active } = req.body;

    if (discount_type && !['percent', 'fixed'].includes(discount_type))
      throw new AppError('discount_type deve ser "percent" ou "fixed"', 400, 'INVALID_DISCOUNT_TYPE');

    const { rows } = await pool.query(
      `UPDATE coupons
       SET description    = COALESCE($1, description),
           discount_type  = COALESCE($2, discount_type),
           discount_value = COALESCE($3, discount_value),
           max_uses       = COALESCE($4, max_uses),
           valid_until    = COALESCE($5, valid_until),
           active         = COALESCE($6, active),
           updated_at     = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        description?.trim() ?? null,
        discount_type ?? null,
        discount_value !== undefined ? Number(discount_value) : null,
        max_uses !== undefined ? (max_uses ? Number(max_uses) : null) : null,
        valid_until !== undefined ? (valid_until || null) : null,
        active !== undefined ? Boolean(active) : null,
        id,
      ]
    );

    if (!rows[0]) throw new AppError('Cupom não encontrado.', 404, 'COUPON_NOT_FOUND');
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
};

// DELETE /admin/coupons/:id - remover
export const deleteCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(`DELETE FROM coupons WHERE id = $1`, [id]);
    if (!rowCount) throw new AppError('Cupom não encontrado.', 404, 'COUPON_NOT_FOUND');
    res.json({ success: true });
  } catch (err) { next(err); }
};
