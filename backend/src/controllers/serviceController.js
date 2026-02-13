import pool from '../config/database.js';

export const getServices = async (req, res) => {
  try {
    const { barbershopId } = req.user;

    const result = await pool.query(
      'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
      [barbershopId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({ error: 'Erro ao buscar serviços' });
  }
};

export const createService = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { name, price, duration_minutes } = req.body;

    const result = await pool.query(
      `INSERT INTO services (barbershop_id, name, price, duration_minutes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [barbershopId, name, price, duration_minutes]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao criar serviço:', error);
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
};

export const getBarbers = async (req, res) => {
  try {
    const { barbershopId } = req.user;

    const result = await pool.query(
      'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
      [barbershopId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar barbeiros:', error);
    res.status(500).json({ error: 'Erro ao buscar barbeiros' });
  }
};

export const createBarber = async (req, res) => {
  try {
    const { barbershopId, plan } = req.user;
    const { name, photo } = req.body;

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM barbers WHERE barbershop_id = $1 AND active = true',
      [barbershopId]
    );

    const currentBarbers = parseInt(countResult.rows[0].total);

    const limits = {
      basico: 1,
      profissional: 5,
      premium: 999
    };

    if (currentBarbers >= limits[plan]) {
      return res.status(403).json({ 
        error: 'Limite de barbeiros atingido',
        message: `Seu plano ${plan} permite até ${limits[plan]} barbeiro(s)` 
      });
    }

    const result = await pool.query(
      `INSERT INTO barbers (barbershop_id, name, photo)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [barbershopId, name, photo]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao criar barbeiro:', error);
    res.status(500).json({ error: 'Erro ao criar barbeiro' });
  }
};
