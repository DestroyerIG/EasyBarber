import { BaseRepository } from './BaseRepository.js';

class BarberRepository extends BaseRepository {
  constructor() {
    super('barbers');
  }

  async findAllActive(barbershopId) {
    const result = await this.pool.query(
      'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
      [barbershopId]
    );
    return result.rows;
  }

  async countActive(barbershopId) {
    const result = await this.pool.query(
      'SELECT COUNT(*) as total FROM barbers WHERE barbershop_id = $1 AND active = true',
      [barbershopId]
    );
    return parseInt(result.rows[0].total);
  }
}

export const barberRepository = new BarberRepository();
