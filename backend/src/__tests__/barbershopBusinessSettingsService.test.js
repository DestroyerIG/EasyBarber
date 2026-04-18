import { jest, describe, it, beforeEach, expect } from '@jest/globals';

const mockFindOperationalSettingsByBarbershopId = jest.fn();

jest.unstable_mockModule('../repositories/barbershopSettingsRepository.js', () => ({
  barbershopSettingsRepository: {
    findOperationalSettingsByBarbershopId: mockFindOperationalSettingsByBarbershopId,
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

const {
  DEFAULT_BUSINESS_SETTINGS,
  getBarbershopBusinessSettings,
  isWithinBusinessHours,
  generateAvailableTimeSlots,
} = await import('../services/barbershopBusinessSettingsService.js');

describe('barbershopBusinessSettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aplica fallback seguro quando configuracao nao existe', async () => {
    mockFindOperationalSettingsByBarbershopId.mockResolvedValue(null);

    const settings = await getBarbershopBusinessSettings('tenant-fallback');

    expect(settings).toEqual(DEFAULT_BUSINESS_SETTINGS);
  });

  it('valida expediente: 07:30 fora e 10:00 dentro do horario', () => {
    const settings = {
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: false,
      autoConfirmAppointments: true,
      timezone: 'America/Sao_Paulo',
    };

    const outside = isWithinBusinessHours(settings, new Date('2026-04-18T07:30:00-03:00'));
    const inside = isWithinBusinessHours(settings, new Date('2026-04-18T10:00:00-03:00'));

    expect(outside).toBe(false);
    expect(inside).toBe(true);
  });

  it('gera slots validos entre 08:00 e 18:00 com intervalo de 30 minutos sem ultrapassar fechamento', () => {
    const settings = {
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: false,
      autoConfirmAppointments: true,
      timezone: 'America/Sao_Paulo',
    };

    const slots = generateAvailableTimeSlots(
      settings,
      '2026-04-20',
      {
        serviceDurationMinutes: 30,
        bookedTimes: ['09:00'],
        currentDate: new Date('2026-04-18T10:00:00-03:00'),
      }
    );

    expect(slots[0]).toBe('08:00');
    expect(slots).toContain('17:30');
    expect(slots).not.toContain('18:00');
    expect(slots).not.toContain('18:30');
    expect(slots).not.toContain('09:00');
  });

  it('carrega configuracao dinamicamente sem cache e aplica mudanca apos salvar', async () => {
    mockFindOperationalSettingsByBarbershopId
      .mockResolvedValueOnce({
        openingTime: '08:00',
        closingTime: '18:00',
        slotIntervalMinutes: 30,
        allowWalkins: false,
        autoConfirmAppointments: true,
        timezone: 'America/Sao_Paulo',
      })
      .mockResolvedValueOnce({
        openingTime: '09:00',
        closingTime: '21:00',
        slotIntervalMinutes: 20,
        allowWalkins: true,
        autoConfirmAppointments: false,
        timezone: 'America/Sao_Paulo',
      });

    const beforeUpdate = await getBarbershopBusinessSettings('tenant-dynamic');
    const afterUpdate = await getBarbershopBusinessSettings('tenant-dynamic');

    expect(beforeUpdate).toEqual(
      expect.objectContaining({
        openingTime: '08:00',
        closingTime: '18:00',
        slotIntervalMinutes: 30,
      })
    );

    expect(afterUpdate).toEqual(
      expect.objectContaining({
        openingTime: '09:00',
        closingTime: '21:00',
        slotIntervalMinutes: 20,
        allowWalkins: true,
        autoConfirmAppointments: false,
      })
    );

    expect(mockFindOperationalSettingsByBarbershopId).toHaveBeenCalledTimes(2);
  });

  it('mantem isolamento multi-tenant para horarios de atendimento', async () => {
    mockFindOperationalSettingsByBarbershopId.mockImplementation(async (barbershopId) => {
      if (barbershopId === 'tenant-a') {
        return {
          openingTime: '08:00',
          closingTime: '18:00',
          slotIntervalMinutes: 30,
          allowWalkins: false,
          autoConfirmAppointments: true,
          timezone: 'America/Sao_Paulo',
        };
      }

      return {
        openingTime: '10:00',
        closingTime: '22:00',
        slotIntervalMinutes: 60,
        allowWalkins: true,
        autoConfirmAppointments: false,
        timezone: 'America/Sao_Paulo',
      };
    });

    const tenantASettings = await getBarbershopBusinessSettings('tenant-a');
    const tenantBSettings = await getBarbershopBusinessSettings('tenant-b');

    expect(tenantASettings).toEqual(
      expect.objectContaining({ openingTime: '08:00', closingTime: '18:00', slotIntervalMinutes: 30 })
    );
    expect(tenantBSettings).toEqual(
      expect.objectContaining({ openingTime: '10:00', closingTime: '22:00', slotIntervalMinutes: 60 })
    );
  });
});
