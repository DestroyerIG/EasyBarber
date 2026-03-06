import pool from '../config/database.js';

/**
 * Base repository com helpers comuns de DB
 */
export class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
    this.pool = pool;
  }

  async findById(id, barbershopId) {
    const result = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND barbershop_id = $2`,
      [id, barbershopId]
    );
    return result.rows[0] || null;
  }

  static ALLOWED_ORDER_COLUMNS = new Set([
    'created_at', 'updated_at', 'name', 'date', 'time', 'amount', 'price',
    'created_at DESC', 'created_at ASC', 'updated_at DESC', 'updated_at ASC',
    'name ASC', 'name DESC', 'date DESC', 'date ASC', 'amount DESC', 'amount ASC',
    'price ASC', 'price DESC',
  ]);

  validateOrderBy(orderBy) {
    if (!BaseRepository.ALLOWED_ORDER_COLUMNS.has(orderBy)) {
      throw new Error(`Invalid orderBy column: ${orderBy}`);
    }
    return orderBy;
  }

  async findAll(barbershopId, { orderBy = 'created_at DESC', where = '', params = [] } = {}) {
    this.validateOrderBy(orderBy);
    const baseParams = [barbershopId];
    const whereClause = where ? `AND ${where}` : '';
    const result = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE barbershop_id = $1 ${whereClause} ORDER BY ${orderBy}`,
      [...baseParams, ...params]
    );
    return result.rows;
  }

  async findAllPaginated(barbershopId, { page = 1, limit = 20, orderBy = 'created_at DESC', where = '', params = [] } = {}) {
    this.validateOrderBy(orderBy);
    const offset = (page - 1) * limit;
    const baseParams = [barbershopId];
    const whereClause = where ? `AND ${where}` : '';

    const [dataResult, countResult] = await Promise.all([
      this.pool.query(
        `SELECT * FROM ${this.tableName} WHERE barbershop_id = $1 ${whereClause} ORDER BY ${orderBy} LIMIT $${baseParams.length + params.length + 1} OFFSET $${baseParams.length + params.length + 2}`,
        [...baseParams, ...params, limit, offset]
      ),
      this.pool.query(
        `SELECT COUNT(*) as total FROM ${this.tableName} WHERE barbershop_id = $1 ${whereClause}`,
        [...baseParams, ...params]
      ),
    ]);

    return {
      data: dataResult.rows,
      meta: {
        total: parseInt(countResult.rows[0].total),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
      },
    };
  }

  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const result = await this.pool.query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async update(id, barbershopId, data) {
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    if (keys.length === 0) return this.findById(id, barbershopId);

    const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);

    const result = await this.pool.query(
      `UPDATE ${this.tableName} SET ${setClauses} WHERE id = $${keys.length + 1} AND barbershop_id = $${keys.length + 2} RETURNING *`,
      [...values, id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async delete(id, barbershopId) {
    const result = await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE id = $1 AND barbershop_id = $2 RETURNING *`,
      [id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async softDelete(id, barbershopId, field = 'active') {
    const result = await this.pool.query(
      `UPDATE ${this.tableName} SET ${field} = false WHERE id = $1 AND barbershop_id = $2 RETURNING *`,
      [id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async getClient() {
    return this.pool.connect();
  }
}
