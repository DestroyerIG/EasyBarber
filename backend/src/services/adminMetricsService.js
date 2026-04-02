import { adminRepository } from '../repositories/adminRepository.js';

export const adminMetricsService = {
  async getMetrics(periodDays = 30) {
    return adminRepository.getPlatformMetrics(periodDays);
  },
};
