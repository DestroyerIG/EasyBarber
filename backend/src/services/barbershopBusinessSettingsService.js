import { barbershopSettingsRepository } from '../repositories/barbershopSettingsRepository.js';
import logger from '../utils/logger.js';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const ALLOWED_SLOT_INTERVALS = new Set([0, 15, 20, 30, 45, 60, 90, 120]);
const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const DEFAULT_DIAS_ABERTOS = {
  seg: true,
  ter: true,
  qua: true,
  qui: true,
  sex: true,
  sab: false,
  dom: false,
};

export const DEFAULT_BUSINESS_SETTINGS = {
  openingTime: '08:00',
  closingTime: '18:00',
  slotIntervalMinutes: 30,
  diasAbertos: { ...DEFAULT_DIAS_ABERTOS },
  allowWalkins: false,
  autoConfirmAppointments: true,
  timezone: DEFAULT_TIMEZONE,
};

const BOOLEAN_TRUE_VALUES = new Set([true, 1, '1', 'true']);

const toMinutes = (timeValue) => {
  const [hours, minutes] = timeValue.split(':').map(Number);
  return (hours * 60) + minutes;
};

const fromMinutes = (totalMinutes) => {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const normalizeBoolean = (value, fallback) => {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return BOOLEAN_TRUE_VALUES.has(value.trim().toLowerCase());
  }

  return BOOLEAN_TRUE_VALUES.has(value);
};

const normalizeTime = (value, fallback) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  if (/^\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized.slice(0, 5);
  }

  return fallback;
};

const normalizeSlotInterval = (value) => {
  const numeric = Number(value);

  if (Number.isInteger(numeric) && ALLOWED_SLOT_INTERVALS.has(numeric)) {
    return numeric;
  }

  return DEFAULT_BUSINESS_SETTINGS.slotIntervalMinutes;
};

const normalizeDiasAbertos = (value) => {
  if (Array.isArray(value)) {
    const selected = new Set(value.map((day) => String(day || '').trim().toLowerCase()));
    return DIAS_SEMANA.reduce((acc, day) => ({
      ...acc,
      [day]: selected.has(day),
    }), {});
  }

  if (value && typeof value === 'object') {
    return DIAS_SEMANA.reduce((acc, day) => ({
      ...acc,
      [day]: value[day] === true,
    }), {});
  }

  return { ...DEFAULT_DIAS_ABERTOS };
};

const normalizeTimezone = (value) => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  const fromEnv = process.env.BUSINESS_TIMEZONE || process.env.APP_TIMEZONE || process.env.TZ || '';
  const preferred = candidate || fromEnv || DEFAULT_TIMEZONE;

  try {
    Intl.DateTimeFormat('pt-BR', { timeZone: preferred }).format(new Date());
    return preferred;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

const getClockInTimezone = (currentDate, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(currentDate);

  const hourPart = parts.find((part) => part.type === 'hour');
  const minutePart = parts.find((part) => part.type === 'minute');

  const hours = Number(hourPart?.value || 0);
  const minutes = Number(minutePart?.value || 0);

  return {
    hours,
    minutes,
    totalMinutes: (hours * 60) + minutes,
  };
};

const getDateInTimezone = (currentDate, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(currentDate);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
};

const getDiaSemanaFromDate = (dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date(`${dateValue}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][date.getDay()];
};

const normalizeBookedTimes = (bookedTimes = []) => {
  const normalized = new Set();

  for (const bookedTime of bookedTimes) {
    const time = normalizeTime(String(bookedTime || ''), '');
    if (time) {
      normalized.add(time);
    }
  }

  return normalized;
};

export const normalizeBusinessSettings = (settings = {}) => {
  const openingTime = normalizeTime(settings.openingTime, DEFAULT_BUSINESS_SETTINGS.openingTime);
  const closingTime = normalizeTime(settings.closingTime, DEFAULT_BUSINESS_SETTINGS.closingTime);

  let normalizedOpening = openingTime;
  let normalizedClosing = closingTime;

  if (toMinutes(normalizedClosing) <= toMinutes(normalizedOpening)) {
    normalizedOpening = DEFAULT_BUSINESS_SETTINGS.openingTime;
    normalizedClosing = DEFAULT_BUSINESS_SETTINGS.closingTime;
  }

  return {
    openingTime: normalizedOpening,
    closingTime: normalizedClosing,
    slotIntervalMinutes: normalizeSlotInterval(settings.slotIntervalMinutes),
    diasAbertos: normalizeDiasAbertos(settings.diasAbertos),
    allowWalkins: normalizeBoolean(settings.allowWalkins, DEFAULT_BUSINESS_SETTINGS.allowWalkins),
    autoConfirmAppointments: normalizeBoolean(settings.autoConfirmAppointments, DEFAULT_BUSINESS_SETTINGS.autoConfirmAppointments),
    timezone: normalizeTimezone(settings.timezone),
  };
};

export const getBarbershopBusinessSettings = async (barbershopId) => {
  try {
    const settings = await barbershopSettingsRepository.findOperationalSettingsByBarbershopId(barbershopId);

    if (!settings) {
      logger.warn(
        { barbershopId },
        'Configuracao operacional nao encontrada; aplicando fallback seguro para o atendimento'
      );
      return { ...DEFAULT_BUSINESS_SETTINGS };
    }

    const normalized = normalizeBusinessSettings(settings);

    logger.debug(
      {
        barbershopId,
        openingTime: normalized.openingTime,
        closingTime: normalized.closingTime,
        slotIntervalMinutes: normalized.slotIntervalMinutes,
        diasAbertos: normalized.diasAbertos,
        allowWalkins: normalized.allowWalkins,
        autoConfirmAppointments: normalized.autoConfirmAppointments,
        timezone: normalized.timezone,
      },
      'Configuracao operacional carregada para o bot'
    );

    return normalized;
  } catch (error) {
    logger.error(
      { err: error, barbershopId },
      'Falha ao carregar configuracao operacional; aplicando fallback seguro para o atendimento'
    );

    return { ...DEFAULT_BUSINESS_SETTINGS };
  }
};

export const formatBusinessHoursRange = (settings = {}) => {
  const normalized = normalizeBusinessSettings(settings);
  return `${normalized.openingTime} as ${normalized.closingTime}`;
};

export const isWithinBusinessHours = (settings = {}, currentDate = new Date()) => {
  const normalized = normalizeBusinessSettings(settings);
  const now = getClockInTimezone(currentDate, normalized.timezone).totalMinutes;
  const openingMinutes = toMinutes(normalized.openingTime);
  const closingMinutes = toMinutes(normalized.closingTime);

  return now >= openingMinutes && now < closingMinutes;
};

export const isBusinessOpenOnDate = (settings = {}, selectedDate = new Date()) => {
  const normalized = normalizeBusinessSettings(settings);
  const diaSemana = getDiaSemanaFromDate(selectedDate);

  if (!diaSemana) {
    return true;
  }

  return normalized.diasAbertos[diaSemana] === true;
};

export const generateAvailableTimeSlots = (
  settings = {},
  selectedDate,
  {
    serviceDurationMinutes,
    bookedTimes = [],
    currentDate = new Date(),
  } = {}
) => {
  const normalized = normalizeBusinessSettings(settings);
  if (!isBusinessOpenOnDate(normalized, selectedDate || currentDate)) {
    return [];
  }

  const openingMinutes = toMinutes(normalized.openingTime);
  const closingMinutes = toMinutes(normalized.closingTime);
  const duration = Number.isInteger(serviceDurationMinutes) && serviceDurationMinutes > 0
    ? serviceDurationMinutes
    : DEFAULT_BUSINESS_SETTINGS.slotIntervalMinutes;
  const slotStep = normalized.slotIntervalMinutes > 0 ? normalized.slotIntervalMinutes : duration;

  const normalizedBookedTimes = normalizeBookedTimes(bookedTimes);

  let firstSlotMinute = openingMinutes;

  const todayInTimezone = getDateInTimezone(currentDate, normalized.timezone);
  if (selectedDate && todayInTimezone && selectedDate === todayInTimezone) {
    const nowMinutes = getClockInTimezone(currentDate, normalized.timezone).totalMinutes;

    if (nowMinutes > openingMinutes) {
      const elapsed = nowMinutes - openingMinutes;
      const nextStep = Math.ceil(elapsed / slotStep);
      firstSlotMinute = openingMinutes + (nextStep * slotStep);
    }
  }

  const availableSlots = [];

  for (let minute = firstSlotMinute; minute + duration <= closingMinutes; minute += slotStep) {
    const slot = fromMinutes(minute);
    if (!normalizedBookedTimes.has(slot)) {
      availableSlots.push(slot);
    }
  }

  return availableSlots;
};
