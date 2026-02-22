import pool from '../config/database.js';
import { z } from 'zod';

// Schemas de validação
export const createServiceSchema = z.object({
  name: z.string().min(2, 'Nome do serviço deve ter pelo menos 2 caracteres'),
  price: z.number().positive('Preço deve ser positivo'),
  duration_minutes: z.number().int().min(10, 'Duração mínima é 10 minutos').max(300, 'Duração máxima é 300 minutos')
});

export const createBarberSchema = z.object({
  name: z.string().min(2, 'Nome do barbeiro deve ter pelo menos 2 caracteres'),
  photo: z.string().url('URL da foto inválida').optional().nullable()
});

export const updateServiceSchema = z.object({
  name: z.string().min(2, 'Nome do serviço deve ter pelo menos 2 caracteres').optional(),
  price: z.number().positive('Preço deve ser positivo').optional(),
  duration_minutes: z.number().int().min(10, 'Duração mínima é 10 minutos').max(300, 'Duração máxima é 300 minutos').optional()
});

export const updateBarberSchema = z.object({
  name: z.string().min(2, 'Nome do barbeiro deve ter pelo menos 2 caracteres').optional(),
  photo: z.string().url('URL da foto inválida').optional().nullable()
});

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

export const updateService = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;
    const { name, price, duration_minutes } = req.body;

    const result = await pool.query(
      `UPDATE services 
       SET name = COALESCE($1, name),
           price = COALESCE($2, price),
           duration_minutes = COALESCE($3, duration_minutes)
       WHERE id = $4 AND barbershop_id = $5
       RETURNING *`,
      [name, price, duration_minutes, id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao atualizar serviço:', error);
    res.status(500).json({ error: 'Erro ao atualizar serviço' });
  }
};

export const deleteService = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;

    // Soft delete
    const result = await pool.query(
      `UPDATE services 
       SET active = false 
       WHERE id = $1 AND barbershop_id = $2
       RETURNING *`,
      [id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    res.json({ message: 'Serviço excluído com sucesso' });

  } catch (error) {
    console.error('Erro ao excluir serviço:', error);
    res.status(500).json({ error: 'Erro ao excluir serviço' });
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

    if (currentBarbers >= (limits[plan] || 1)) {
      return res.status(403).json({
        error: 'Limite de barbeiros atingido',
        message: `Seu plano ${plan} permite até ${limits[plan]} barbeiro(s)`
      });
    }

    const result = await pool.query(
      `INSERT INTO barbers (barbershop_id, name, photo)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [barbershopId, name, photo || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao criar barbeiro:', error);
    res.status(500).json({ error: 'Erro ao criar barbeiro' });
  }
};

export const updateBarber = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;
    const { name, photo } = req.body;

    const result = await pool.query(
      `UPDATE barbers 
       SET name = COALESCE($1, name),
           photo = COALESCE($2, photo)
       WHERE id = $3 AND barbershop_id = $4
       RETURNING *`,
      [name, photo, id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Barbeiro não encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao atualizar barbeiro:', error);
    res.status(500).json({ error: 'Erro ao atualizar barbeiro' });
  }
};

export const deleteBarber = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;

    // Soft delete
    const result = await pool.query(
      `UPDATE barbers 
       SET active = false 
       WHERE id = $1 AND barbershop_id = $2
       RETURNING *`,
      [id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Barbeiro não encontrado' });
    }

    res.json({ message: 'Barbeiro excluído com sucesso' });

  } catch (error) {
    console.error('Erro ao excluir barbeiro:', error);
    res.status(500).json({ error: 'Erro ao excluir barbeiro' });
  }
};
