import pool from '../config/database.js';

class AppointmentRepository {
  constructor() {
    this.pool = pool;
  }

  async findAll(barbershopId, { date, status, view = 'day', barberId } = {}) {
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

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async validateEntityOwnership(dbClient, barbershopId, { clientId, barberId, serviceId }) {
    const result = await dbClient.query(
      `SELECT
         (SELECT COUNT(*) FROM clients  WHERE id = $1 AND barbershop_id = $4) AS client_ok,
         (SELECT COUNT(*) FROM barbers  WHERE id = $2 AND barbershop_id = $4 AND active = true) AS barber_ok,
         (SELECT COUNT(*) FROM services WHERE id = $3 AND barbershop_id = $4 AND active = true) AS service_ok`,
      [clientId, barberId, serviceId, barbershopId]
    );
    return result.rows[0];
  }

  async findConflict(dbClient, barbershopId, barberId, date, time, excludeId = null) {
    let query = `SELECT id FROM appointments 
       WHERE barbershop_id = $1 AND barber_id = $2 
       AND date = $3 AND time = $4 AND status != 'cancelado'`;
    const params = [barbershopId, barberId, date, time];

    if (excludeId) {
      query += ' AND id != $5';
      params.push(excludeId);
    }

    const result = await dbClient.query(query, params);
    return result.rows[0] || null;
  }

  async create(dbClient, data) {
    const result = await dbClient.query(
      `INSERT INTO appointments 
       (barbershop_id, client_id, barber_id, service_id, date, time, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')
       RETURNING *`,
      [data.barbershopId, data.clientId, data.barberId, data.serviceId, data.date, data.time]
    );
    return result.rows[0];
  }

  async findByIdForUpdate(dbClient, id, barbershopId) {
    const result = await dbClient.query(
      `SELECT id, status, service_id, client_id, date
       FROM appointments 
       WHERE id = $1 AND barbershop_id = $2
       FOR UPDATE`,
      [id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async updateStatus(dbClient, id, status) {
    const result = await dbClient.query(
      `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0] || null;
  }

  async update(dbClient, id, barbershopId, data) {
    const result = await dbClient.query(
      `UPDATE appointments 
       SET client_id = $1, barber_id = $2, service_id = $3, date = $4, time = $5
       WHERE id = $6 AND barbershop_id = $7 AND status = 'confirmado'
       RETURNING *`,
      [data.clientId, data.barberId, data.serviceId, data.date, data.time, id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async softDelete(id, barbershopId) {
    const result = await this.pool.query(
      `UPDATE appointments 
       SET status = 'cancelado'
       WHERE id = $1 AND barbershop_id = $2 AND status != 'cancelado'
       RETURNING *`,
      [id, barbershopId]
    );
    return result.rows[0] || null;
  }

  async getBookedSlots(barbershopId, barberId, date) {
    const result = await this.pool.query(
      `SELECT time FROM appointments 
       WHERE barbershop_id = $1 AND barber_id = $2 
       AND date = $3 AND status != 'cancelado'`,
      [barbershopId, barberId, date]
    );
    return result.rows.map(row => row.time);
  }

  async getClient() {
    return this.pool.connect();
  }
}

export const appointmentRepository = new AppointmentRepository();
