import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockFindAccountUserById = jest.fn();
const mockFindAccountProfileByUserId = jest.fn();
const mockUpdateAccountProfile = jest.fn();
const mockFindAnyUserByEmail = jest.fn();
const mockGetClient = jest.fn();
const mockUpdateUserEmailById = jest.fn();

jest.unstable_mockModule('../repositories/barbershopSettingsRepository.js', () => ({
  barbershopSettingsRepository: {
    findAccountUserById: mockFindAccountUserById,
    findAccountProfileByUserId: mockFindAccountProfileByUserId,
    updateAccountProfile: mockUpdateAccountProfile,
  },
}));

jest.unstable_mockModule('../repositories/authRepository.js', () => ({
  authRepository: {
    findAnyUserByEmail: mockFindAnyUserByEmail,
    getClient: mockGetClient,
  },
}));

jest.unstable_mockModule('../services/supabaseAuthService.js', () => ({
  supabaseAuthService: {
    updateUserEmailById: mockUpdateUserEmailById,
  },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { barbershopSettingsService } = await import('../services/barbershopSettingsService.js');
const { ConflictError } = await import('../utils/errors.js');

describe('barbershopSettingsService.updateAccountProfile', () => {
  const baseAuthUser = {
    barbershopId: 'shop-1',
    userId: 'user-1',
    role: 'tenant_admin',
  };

  const basePayload = {
    barbershopName: '  Barbearia Central  ',
    ownerName: '  Joao da Silva  ',
    whatsapp: '(11) 99876-5432',
    cpfCnpj: '705.960.904-04',
    email: '  Novo@Email.com ',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockFindAccountUserById.mockResolvedValue({
      userId: 'user-1',
      barbershopId: 'shop-1',
      role: 'tenant_admin',
      email: 'atual@email.com',
      supabaseUserId: 'sb-user-1',
      passwordHash: 'hash',
      authProvider: 'supabase',
      emailVerified: true,
      plan: 'profissional',
      barbershopName: 'Barbearia Central',
      subscriptionStatus: 'active',
      subscriptionCurrentPeriodEnd: null,
    });

    mockFindAccountProfileByUserId.mockResolvedValue({
      barbershopName: 'Barbearia Atual',
      ownerName: 'Responsavel Atual',
      whatsapp: '11911112222',
      cpfCnpj: '70596090404',
      email: 'atual@email.com',
    });

    mockFindAnyUserByEmail.mockResolvedValue(null);
    mockUpdateUserEmailById.mockResolvedValue({
      userId: 'sb-user-1',
      email: 'novo@email.com',
    });

    mockUpdateAccountProfile.mockResolvedValue({
      barbershopName: 'Barbearia Central',
      ownerName: 'Joao da Silva',
      whatsapp: '11998765432',
      cpfCnpj: '70596090404',
      email: 'novo@email.com',
    });

    mockGetClient.mockResolvedValue({
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    });
  });

  it('normaliza payload e atualiza auth externo antes do commit local', async () => {
    const dbClient = {
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    mockGetClient.mockResolvedValue(dbClient);

    const result = await barbershopSettingsService.updateAccountProfile(baseAuthUser, basePayload);

    expect(mockFindAnyUserByEmail).toHaveBeenCalledWith('novo@email.com');
    expect(mockUpdateUserEmailById).toHaveBeenCalledWith('sb-user-1', 'novo@email.com');
    expect(mockUpdateAccountProfile).toHaveBeenCalledWith(
      'shop-1',
      'user-1',
      {
        barbershopName: 'Barbearia Central',
        ownerName: 'Joao da Silva',
        whatsapp: '11998765432',
        cpfCnpj: '70596090404',
        email: 'novo@email.com',
      },
      dbClient
    );
    expect(dbClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(dbClient.query).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(result.profile).toEqual(
      expect.objectContaining({
        email: 'novo@email.com',
        cpfCnpj: '70596090404',
      })
    );
  });

  it('retorna 409 quando o e-mail já pertence a outro usuário', async () => {
    mockFindAnyUserByEmail.mockResolvedValue({
      id: 'user-2',
      email: 'novo@email.com',
    });

    await expect(
      barbershopSettingsService.updateAccountProfile(baseAuthUser, basePayload)
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockUpdateUserEmailById).not.toHaveBeenCalled();
    expect(mockUpdateAccountProfile).not.toHaveBeenCalled();
  });

  it('restaura o e-mail no auth externo quando o update local falha após sincronização', async () => {
    const dbClient = {
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    const dbError = new Error('violacao inesperada');

    mockGetClient.mockResolvedValue(dbClient);
    mockUpdateAccountProfile.mockRejectedValue(dbError);

    await expect(
      barbershopSettingsService.updateAccountProfile(baseAuthUser, basePayload)
    ).rejects.toThrow('violacao inesperada');

    expect(dbClient.query).toHaveBeenCalledWith('BEGIN');
    expect(dbClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockUpdateUserEmailById).toHaveBeenNthCalledWith(1, 'sb-user-1', 'novo@email.com');
    expect(mockUpdateUserEmailById).toHaveBeenNthCalledWith(2, 'sb-user-1', 'atual@email.com');
  });
});
