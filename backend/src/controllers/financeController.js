import pool from '../config/database.js';
import { z } from 'zod';

// Helper para obter data local
const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().split('T')[0];
};

// Schemas de validação
export const addExpenseSchema = z.object({
  description: z.string().min(2, 'Descrição deve ter pelo menos 2 caracteres'),
  category: z.string().min(1, 'Categoria é obrigatória'),
  amount: z.number().positive('Valor deve ser positivo'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
});

export const updateExpenseSchema = z.object({
  description: z.string().min(2, 'Descrição deve ter pelo menos 2 caracteres').optional(),
  category: z.string().min(1, 'Categoria é obrigatória').optional(),
  amount: z.number().positive('Valor deve ser positivo').optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').optional()
});

export const getFinanceSummary = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const today = getLocalDate();

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

    if (!month || !year) {
      return res.status(400).json({ error: 'month e year são obrigatórios' });
    }

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

export const updateExpense = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;
    const { description, category, amount, date } = req.body;

    const result = await pool.query(
      `UPDATE expenses 
       SET description = COALESCE($1, description),
           category = COALESCE($2, category),
           amount = COALESCE($3, amount),
           date = COALESCE($4, date)
       WHERE id = $5 AND barbershop_id = $6
       RETURNING *`,
      [description, category, amount, date, id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gasto não encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao atualizar gasto:', error);
    res.status(500).json({ error: 'Erro ao atualizar gasto' });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM expenses WHERE id = $1 AND barbershop_id = $2 RETURNING *',
      [id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gasto não encontrado' });
    }

    res.json({ message: 'Gasto excluído com sucesso' });

  } catch (error) {
    console.error('Erro ao excluir gasto:', error);
    res.status(500).json({ error: 'Erro ao excluir gasto' });
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
