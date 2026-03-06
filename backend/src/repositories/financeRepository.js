import pool from '../config/database.js';

class FinanceRepository {
  constructor() {
    this.pool = pool;
  }

  async getSummary(barbershopId, today) {
    const result = await this.pool.query(
      `SELECT 
        (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE barbershop_id = $1 AND date = $2) as earnings_today,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE barbershop_id = $1 AND date = $2) as expenses_today,
        (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE barbershop_id = $1 AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)) as earnings_month,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE barbershop_id = $1 AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)) as expenses_month`,
      [barbershopId, today]
    );
    return result.rows[0];
  }

  async getMonthlyReport(barbershopId, startDate) {
    const result = await this.pool.query(
      `SELECT 
        date,
        (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE barbershop_id = $1 AND date = days.date) as earnings,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE barbershop_id = $1 AND date = days.date) as expenses
       FROM generate_series(
         $2::date,
         ($2::date + INTERVAL '1 month - 1 day')::date,
         '1 day'::interval
       ) AS days(date)
       ORDER BY date`,
      [barbershopId, startDate]
    );
    return result.rows;
  }

  async createExpense(barbershopId, { description, category, amount, date }) {
    const result = await this.pool.query(
      `INSERT INTO expenses (barbershop_id, description, category, amount, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [barbershopId, description, category, amount, date]
    );
    return result.rows[0];
  }

  async updateExpense(id, barbershopId, { description, category, amount, date }) {
    const result = await this.pool.query(
      `UPDATE expenses 
       SET description = COALESCE($1, description),
           category = COALESCE($2, category),
           amount = COALESCE($3, amount),
           date = COALESCE($4, date)
       WHERE id = $5 AND barbershop_id = $6
       RETURNING *`,
      [description, category, amount, date, id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async deleteExpense(id, barbershopId) {
    const result = await this.pool.query(
      'DELETE FROM expenses WHERE id = $1 AND barbershop_id = $2 RETURNING *',
      [id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async getExpenses(barbershopId, { startDate, endDate } = {}) {
    let query = 'SELECT * FROM expenses WHERE barbershop_id = $1';
    const params = [barbershopId];

    if (startDate && endDate) {
      query += ' AND date >= $2 AND date <= $3';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY date DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async createEarning(dbClient, { barbershopId, appointmentId, amount, date }) {
    await dbClient.query(
      `INSERT INTO earnings (barbershop_id, appointment_id, amount, date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (appointment_id) DO NOTHING`,
      [barbershopId, appointmentId, amount, date]
    );
  }

  async findEarningByAppointment(dbClient, appointmentId) {
    const result = await dbClient.query(
      'SELECT id FROM earnings WHERE appointment_id = $1',
      [appointmentId]
    );
    return result.rows[0] || null;
  }
}

export const financeRepository = new FinanceRepository();
