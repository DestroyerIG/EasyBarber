import { BaseRepository } from './BaseRepository.js';

class ClientRepository extends BaseRepository {
  constructor() {
    super('clients');
  }

  async findByPhone(barbershopId, phone) {
    const result = await this.pool.query(
      'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
      [barbershopId, phone]
    );
    return result.rows[0] || null;
  }

  async getHistory(barbershopId, clientId) {
    const result = await this.pool.query(
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
      [barbershopId, clientId]
    );
    return result.rows;
  }

  async updateLastVisit(client, barbershopId, clientId, date, amount) {
    await client.query(
      `UPDATE clients 
       SET last_visit = $1, total_spent = total_spent + $2
       WHERE id = $3 AND barbershop_id = $4`,
      [date, amount, clientId, barbershopId]
    );
  }
}

export const clientRepository = new ClientRepository();
