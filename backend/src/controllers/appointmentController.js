import pool from '../config/database.js';

export const getAppointments = async (req, res) => {
  try {
    const { barbershopId } = req.user;
    const { date, status, view = 'day' } = req.query;

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
      [barbershopId, barberId, date, time]
    );

    if (conflict.rows.length > 0) {
      return res.status(400).json({ error: 'Horário já ocupado' });
    }

    const result = await pool.query(
      `INSERT INTO appointments 
       (barbershop_id, client_id, barber_id, service_id, date, time, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')
       RETURNING *`,
      [barbershopId, clientId, barberId, serviceId, date, time]
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
    const { barberId, date } = req.query;

    const service = await pool.query(
      `SELECT duration_minutes FROM services 
       WHERE barbershop_id = $1 
       LIMIT 1`,
      [barbershopId]
    );

    const duration = service.rows[0]?.duration_minutes || 60;

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
