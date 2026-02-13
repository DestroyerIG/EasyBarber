import pool from '../config/database.js';

export const getDashboard = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const today = new Date().toISOString().split('T')[0];

    const [
      appointmentsToday,
      earningsToday,
      expensesToday,
      clientsCount,
      weeklyEarnings
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as total FROM appointments 
         WHERE barbershop_id = $1 AND date = $2 AND status = 'confirmado'`,
        [barbershopId, today]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM earnings 
         WHERE barbershop_id = $1 AND date = $2`,
        [barbershopId, today]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
         WHERE barbershop_id = $1 AND date = $2`,
        [barbershopId, today]
      ),
      pool.query(
        `SELECT COUNT(*) as total FROM clients WHERE barbershop_id = $1`,
        [barbershopId]
      ),
      pool.query(
        `SELECT date, COALESCE(SUM(amount), 0) as total 
         FROM earnings 
         WHERE barbershop_id = $1 
         AND date >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY date 
         ORDER BY date`,
        [barbershopId]
      )
    ]);

    const earnings = parseFloat(earningsToday.rows[0].total);
    const expenses = parseFloat(expensesToday.rows[0].total);
    const profit = earnings - expenses;

    res.json({
      appointmentsToday: parseInt(appointmentsToday.rows[0].total),
      earningsToday: earnings,
      expensesToday: expenses,
      profitToday: profit,
      totalClients: parseInt(clientsCount.rows[0].total),
      weeklyEarnings: weeklyEarnings.rows
    });

  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
};
