import pool from '../config/database.js';

export const getClients = async (req, res) => {
  try {
    const { barbershopId } = req.user;

    const result = await pool.query(
      `SELECT * FROM clients 
       WHERE barbershop_id = $1 
       ORDER BY created_at DESC`,
      [barbershopId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar clientes:', error);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
};

export const createClient = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { name, phone } = req.body;

    const exists = await pool.query(
      'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
      [barbershopId, phone]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Cliente já cadastrado com este telefone' });
    }

    const result = await pool.query(
      `INSERT INTO clients (barbershop_id, name, phone)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [barbershopId, name, phone]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
};

export const getClientHistory = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        a.*,
        b.name as barber_name,
        s.name as service_name,
        s.price as service_price
       FROM appointments a
       JOIN barbers b ON a.barber_id = b.id
       JOIN services s ON a.service_id = s.id
       WHERE a.barbershop_id = $1 AND a.client_id = $2
       ORDER BY a.date DESC, a.time DESC`,
      [barbershopId, id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico do cliente' });
  }
};
