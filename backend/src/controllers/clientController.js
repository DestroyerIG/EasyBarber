import pool from '../config/database.js';
import { z } from 'zod';

// Schema de validação
export const createClientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  phone: z.string().min(10, 'Telefone inválido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  birthDate: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal(''))
});

export const updateClientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  phone: z.string().min(10, 'Telefone inválido').optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  birthDate: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal(''))
});

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
    const { name, phone, email, birthDate, address, notes } = req.body;

    const exists = await pool.query(
      'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
      [barbershopId, phone]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Cliente já cadastrado com este telefone' });
    }

    const result = await pool.query(
      `INSERT INTO clients (barbershop_id, name, phone, email, birth_date, address, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [barbershopId, name, phone, email || null, birthDate || null, address || null, notes || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
};

export const updateClient = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;
    const { name, phone, email, birthDate, address, notes } = req.body;

    const result = await pool.query(
      `UPDATE clients 
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = $3,
           birth_date = $4,
           address = $5,
           notes = $6
       WHERE id = $7 AND barbershop_id = $8
       RETURNING *`,
      [name, phone, email || null, birthDate || null, address || null, notes || null, id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
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
