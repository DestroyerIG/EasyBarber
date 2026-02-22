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
export const createAppointmentSchema = z.object({
  clientId: z.string().uuid('ID do cliente inválido'),
  barberId: z.string().uuid('ID do barbeiro inválido'),
  serviceId: z.string().uuid('ID do serviço inválido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM')
});

export const updateStatusSchema = z.object({
  status: z.enum(['confirmado', 'concluido', 'cancelado'], {
    errorMap: () => ({ message: 'Status deve ser: confirmado, concluido ou cancelado' })
  })
});

export const getAppointments = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { date, status, view = 'day', barberId } = req.query;

    let query = `
      SELECT 
        a.*,
        c.name as client_name,
        c.phone as client_phone,
        b.name as barber_name,
        s.name as service_name,
        s.price as service_price
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      JOIN barbers b ON a.barber_id = b.id
      JOIN services s ON a.service_id = s.id
      WHERE a.barbershop_id = $1
    `;

    const params = [barbershopId];
    let paramIndex = 2;

    if (barberId) {
      query += ` AND a.barber_id = $${paramIndex}`;
      params.push(barberId);
      paramIndex++;
    }

    if (date) {
      if (view === 'day') {
        query += ` AND a.date = $${paramIndex}`;
        params.push(date);
        paramIndex++;
      } else if (view === 'week') {
        query += ` AND a.date >= $${paramIndex} AND a.date < $${paramIndex + 1}`;
        const startDate = new Date(date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
        params.push(startDate.toISOString().split('T')[0]);
        params.push(endDate.toISOString().split('T')[0]);
        paramIndex += 2;
      }
    }

    if (status) {
      query += ` AND a.status = $${paramIndex}`;
      params.push(status);
    }

    query += ' ORDER BY a.date, a.time';

    const result = await pool.query(query, params);

    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
};

export const createAppointment = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { clientId, barberId, serviceId, date, time } = req.body;

    const conflict = await pool.query(
      `SELECT id FROM appointments 
       WHERE barbershop_id = $1 AND barber_id = $2 
       AND date = $3 AND time = $4 AND status != 'cancelado'`,
      [barbershopId, barberId, date, time + ':00']
    );

    if (conflict.rows.length > 0) {
      return res.status(400).json({ error: 'Horário já ocupado' });
    }

    const result = await pool.query(
      `INSERT INTO appointments 
       (barbershop_id, client_id, barber_id, service_id, date, time, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')
       RETURNING *`,
      [barbershopId, clientId, barberId, serviceId, date, time + ':00']
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
};

export const updateAppointmentStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { barbershopId } = req.user;
    const { id } = req.params;
    const { status } = req.body;

    const result = await client.query(
      `UPDATE appointments 
       SET status = $1 
       WHERE id = $2 AND barbershop_id = $3
       RETURNING *`,
      [status, id, barbershopId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    if (status === 'concluido') {
      const appointment = result.rows[0];

      const service = await client.query(
        'SELECT price FROM services WHERE id = $1',
        [appointment.service_id]
      );

      if (service.rows.length > 0) {
        await client.query(
          `INSERT INTO earnings (barbershop_id, appointment_id, amount, date)
           VALUES ($1, $2, $3, $4)`,
          [barbershopId, id, service.rows[0].price, appointment.date]
        );

        await client.query(
          `UPDATE clients 
           SET last_visit = $1, 
               total_spent = total_spent + $2
           WHERE id = $3`,
          [appointment.date, service.rows[0].price, appointment.client_id]
        );
      }
    }

    await client.query('COMMIT');

    res.json(result.rows[0]);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar agendamento:', error);
    res.status(500).json({ error: 'Erro ao atualizar agendamento' });
  } finally {
    client.release();
  }
};

export const getAvailableSlots = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { barberId, date, serviceId } = req.query;

    if (!barberId || !date) {
      return res.status(400).json({ error: 'barberId e date são obrigatórios' });
    }

    // Buscar duração do serviço específico (ou padrão 60 min)
    let duration = 60;
    if (serviceId) {
      const service = await pool.query(
        `SELECT duration_minutes FROM services 
         WHERE id = $1 AND barbershop_id = $2`,
        [serviceId, barbershopId]
      );
      if (service.rows.length > 0) {
        duration = service.rows[0].duration_minutes;
      }
    }

    const bookedSlots = await pool.query(
      `SELECT time FROM appointments 
       WHERE barbershop_id = $1 AND barber_id = $2 
       AND date = $3 AND status != 'cancelado'`,
      [barbershopId, barberId, date]
    );

    const bookedTimes = bookedSlots.rows.map(row => row.time);

    const slots = [];
    const startHour = 9;
    const endHour = 19;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += duration) {
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        if (!bookedTimes.includes(time)) {
          slots.push(time.substring(0, 5));
        }
      }
    }

    res.json(slots);

  } catch (error) {
    console.error('Erro ao buscar horários:', error);
    res.status(500).json({ error: 'Erro ao buscar horários disponíveis' });
  }
};

// Schema de validação para edição
export const updateAppointmentSchema = z.object({
  clientId: z.string().uuid('ID do cliente inválido'),
  barberId: z.string().uuid('ID do barbeiro inválido'),
  serviceId: z.string().uuid('ID do serviço inválido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM')
});

export const updateAppointment = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;
    const { clientId, barberId, serviceId, date, time } = req.body;

    // Verificar conflito de horário (excluindo o próprio agendamento)
    const conflict = await pool.query(
      `SELECT id FROM appointments 
       WHERE barbershop_id = $1 AND barber_id = $2 
       AND date = $3 AND time = $4 AND status != 'cancelado' AND id != $5`,
      [barbershopId, barberId, date, time + ':00', id]
    );

    if (conflict.rows.length > 0) {
      return res.status(400).json({ error: 'Horário já ocupado' });
    }

    const result = await pool.query(
      `UPDATE appointments 
       SET client_id = $1, barber_id = $2, service_id = $3, date = $4, time = $5
       WHERE id = $6 AND barbershop_id = $7 AND status = 'confirmado'
       RETURNING *`,
      [clientId, barberId, serviceId, date, time + ':00', id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado ou não pode ser editado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error);
    res.status(500).json({ error: 'Erro ao atualizar agendamento' });
  }
};

export const deleteAppointment = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM appointments 
       WHERE id = $1 AND barbershop_id = $2
       RETURNING *`,
      [id, barbershopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    res.json({ message: 'Agendamento excluído com sucesso' });

  } catch (error) {
    console.error('Erro ao excluir agendamento:', error);
    res.status(500).json({ error: 'Erro ao excluir agendamento' });
  }
};
