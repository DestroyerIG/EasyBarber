import pool from '../config/database.js';

class DashboardRepository {
  constructor() {
    this.pool = pool;
  }

  async getDashboardData(barbershopId, today) {
    const [
      appointmentsToday,
      earningsToday,
      expensesToday,
      clientsCount,
      weeklyEarnings
    ] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*) as total FROM appointments 
         WHERE barbershop_id = $1 AND date = $2 AND status = 'confirmado'`,
        [barbershopId, today]
      ),
      this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM earnings 
         WHERE barbershop_id = $1 AND date = $2`,
        [barbershopId, today]
      ),
      this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
         WHERE barbershop_id = $1 AND date = $2`,
        [barbershopId, today]
      ),
      this.pool.query(
        `SELECT COUNT(*) as total FROM clients WHERE barbershop_id = $1`,
        [barbershopId]
      ),
      this.pool.query(
        `SELECT date, COALESCE(SUM(amount), 0) as total 
         FROM earnings 
         WHERE barbershop_id = $1 
         AND date >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY date 
         ORDER BY date`,
        [barbershopId]
      )
    ]);

    return {
      appointmentsToday: parseInt(appointmentsToday.rows[0].total),
      earningsToday: parseFloat(earningsToday.rows[0].total),
      expensesToday: parseFloat(expensesToday.rows[0].total),
      totalClients: parseInt(clientsCount.rows[0].total),
      weeklyEarnings: weeklyEarnings.rows,
    };
  }
}

export const dashboardRepository = new DashboardRepository();
