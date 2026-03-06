import { BaseRepository } from './BaseRepository.js';

class ServiceRepository extends BaseRepository {
  constructor() {
    super('services');
  }

  async findAllActive(barbershopId) {
    const result = await this.pool.query(
      'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
      [barbershopId]
    );
    return result.rows;
  }

  async findPrice(serviceId) {
    const result = await this.pool.query(
      'SELECT price FROM services WHERE id = $1',
      [serviceId]
    );
    return result.rows[0] || null;
  }

  async findDuration(serviceId, barbershopId) {
    const result = await this.pool.query(
      `SELECT duration_minutes FROM services 
       WHERE id = $1 AND barbershop_id = $2 AND active = true`,
      [serviceId, barbershopId]
    );
    return result.rows[0] || null;
  }
}

export const serviceRepository = new ServiceRepository();
