import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { z } from 'zod';

// Schemas de validação
export const registerSchema = z.object({
  barbershopName: z.string().min(2, 'Nome da barbearia deve ter pelo menos 2 caracteres'),
  ownerName: z.string().min(2, 'Nome do responsável deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  whatsapp: z.string().min(10, 'WhatsApp inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  plan: z.enum(['basico', 'profissional', 'premium']).default('basico')
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

export const register = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      barbershopName,
      ownerName,
      email,
      whatsapp,
      password,
      plan = 'basico'
    } = req.body;

    const userExists = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const barbershopResult = await client.query(
      `INSERT INTO barbershops (name, owner_name, email, whatsapp, plan) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [barbershopName, ownerName, email, whatsapp, plan]
    );

    const barbershopId = barbershopResult.rows[0].id;

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO users (barbershop_id, email, password_hash, role) 
       VALUES ($1, $2, $3, $4)`,
      [barbershopId, email, passwordHash, 'admin']
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      {
        barbershopId,
        email,
        plan,
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Barbearia cadastrada com sucesso',
      token,
      barbershop: {
        id: barbershopId,
        name: barbershopName,
        plan
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro no registro:', error);
    res.status(500).json({ error: 'Erro ao cadastrar barbearia' });
  } finally {
    client.release();
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      `SELECT u.*, b.plan, b.name as barbershop_name, b.id as barbershop_id
       FROM users u
       JOIN barbershops b ON u.barbershop_id = b.id
       WHERE u.email = $1 AND b.active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        barbershopId: user.barbershop_id,
        email: user.email,
        plan: user.plan,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        email: user.email,
        role: user.role,
        barbershopName: user.barbershop_name,
        plan: user.plan
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
};
