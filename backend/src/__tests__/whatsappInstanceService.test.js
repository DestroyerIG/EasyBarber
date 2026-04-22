import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockFindWhatsAppInstanceContextByBarbershopId = jest.fn();
const mockEnsureWhatsAppInstanceName = jest.fn();

jest.unstable_mockModule('../repositories/barbershopSettingsRepository.js', () => ({
  barbershopSettingsRepository: {
    findWhatsAppInstanceContextByBarbershopId: mockFindWhatsAppInstanceContextByBarbershopId,
    ensureWhatsAppInstanceName: mockEnsureWhatsAppInstanceName,
  },
}));

const {
  normalizeWhatsAppInstanceName,
  buildDeterministicWhatsAppInstanceName,
  getBarbershopWhatsAppInstanceContext,
  ensureBarbershopWhatsAppInstanceName,
} = await import('../services/whatsapp/whatsappInstanceService.js');

describe('whatsappInstanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes instance names to lowercase safe tokens', () => {
    expect(normalizeWhatsAppInstanceName(' Barbearia São João #1 ')).toBe('barbearia-sao-joao-1');
  });

  it('builds deterministic unique names per barbershop', () => {
    const a = buildDeterministicWhatsAppInstanceName({
      barbershopId: 'shop-12345678',
      shopName: 'Studio Corte',
    });

    const b = buildDeterministicWhatsAppInstanceName({
      barbershopId: 'shop-87654321',
      shopName: 'Studio Corte',
    });

    expect(a).toBe('studio-corte_12345678');
    expect(b).toBe('studio-corte_87654321');
    expect(a).not.toBe(b);
  });

  it('returns persisted instance context already linked to the barbershop', async () => {
    mockFindWhatsAppInstanceContextByBarbershopId.mockResolvedValue({
      id: 'tenant-1',
      name: 'Barber Prime',
      active: true,
      whatsappInstanceName: 'BARBER_PRIME_ABC12345',
    });

    const result = await getBarbershopWhatsAppInstanceContext('tenant-1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tenant-1',
        whatsappInstanceName: 'barber_prime_abc12345',
      })
    );
  });

  it('creates and persists a new instance name for a new barbershop', async () => {
    mockEnsureWhatsAppInstanceName.mockImplementation(async (_barbershopId, builder) => ({
      id: 'tenant-2',
      name: 'Barbearia Elite',
      active: true,
      whatsappInstanceName: builder({
        id: 'tenant-2',
        name: 'Barbearia Elite',
      }),
      createdNow: true,
    }));

    const result = await ensureBarbershopWhatsAppInstanceName('tenant-2');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tenant-2',
        whatsappInstanceName: 'barbearia-elite_tenant2',
      })
    );
  });

  it('reuses the same persisted instance instead of regenerating it', async () => {
    mockEnsureWhatsAppInstanceName.mockResolvedValue({
      id: 'tenant-3',
      name: 'Joao Barber',
      active: true,
      whatsappInstanceName: 'joao-barber_tenant3',
      createdNow: false,
    });

    const result = await ensureBarbershopWhatsAppInstanceName('tenant-3');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tenant-3',
        whatsappInstanceName: 'joao-barber_tenant3',
      })
    );
    expect(mockEnsureWhatsAppInstanceName).toHaveBeenCalledTimes(1);
  });
});
