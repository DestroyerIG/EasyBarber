import api from '@/lib/api';

export interface BarbershopProfileResponse {
  cpfCnpj: string | null;
}

export const barbershopProfileApi = {
  async getProfile(): Promise<BarbershopProfileResponse> {
    const response = await api.get('/barbershop/profile');
    return response.data;
  },

  async updateProfile(cpfCnpj: string): Promise<BarbershopProfileResponse> {
    const response = await api.put('/barbershop/profile', { cpfCnpj });
    return response.data;
  },
};
