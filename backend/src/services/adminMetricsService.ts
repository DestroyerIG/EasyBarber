import { adminRepository } from '../repositories/adminRepository.js';

export const adminMetricsService = {
  async getMetrics(periodDays: number = 30): Promise<unknown> {
    return adminRepository.getPlatformMetrics(periodDays);
  },
};
