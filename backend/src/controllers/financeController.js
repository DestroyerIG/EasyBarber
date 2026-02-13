import pool from '../config/database.js';

export const getFinanceSummary = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT 
        (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE barbershop_id = $1 AND date = $2) as earnings_today,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE barbershop_id = $1 AND date = $2) as expenses_today,
        (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE barbershop_id = $1 AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)) as earnings_month,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE barbershop_id = $1 AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)) as expenses_month`,
      [barbershopId, today]
    );

    const data = result.rows[0];

    res.json({
      today: {
        earnings: parseFloat(data.earnings_today),
        expenses: parseFloat(data.expenses_today),
        profit: parseFloat(data.earnings_today) - parseFloat(data.expenses_today)
      },
      month: {
        earnings: parseFloat(data.earnings_month),
        expenses: parseFloat(data.expenses_month),
        profit: parseFloat(data.earnings_month) - parseFloat(data.expenses_month)
      }
    });

  } catch (error) {
    console.error('Erro ao buscar resumo financeiro:', error);
    res.status(500).json({ error: 'Erro ao buscar resumo financeiro' });
  }
};

export const getMonthlyReport = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { month, year } = req.query;

    const result = await pool.query(
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
      [barbershopId, `${year}-${String(month).padStart(2, '0')}-01`]
    );

    const report = result.rows.map(row => ({
      date: row.date,
      earnings: parseFloat(row.earnings),
      expenses: parseFloat(row.expenses),
      profit: parseFloat(row.earnings) - parseFloat(row.expenses)
    }));

    res.json(report);

  } catch (error) {
    console.error('Erro ao buscar relatório mensal:', error);
    res.status(500).json({ error: 'Erro ao buscar relatório mensal' });
  }
};

export const addExpense = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { description, category, amount, date } = req.body;

    const result = await pool.query(
      `INSERT INTO expenses (barbershop_id, description, category, amount, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [barbershopId, description, category, amount, date]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao adicionar gasto:', error);
    res.status(500).json({ error: 'Erro ao adicionar gasto' });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { startDate, endDate } = req.query;

    let query = 'SELECT * FROM expenses WHERE barbershop_id = $1';
    const params = [barbershopId];

    if (startDate && endDate) {
      query += ' AND date >= $2 AND date <= $3';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY date DESC';

    const result = await pool.query(query, params);

    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar gastos:', error);
    res.status(500).json({ error: 'Erro ao buscar gastos' });
  }
};
