import { barbershopSettingsRepository } from '../../repositories/barbershopSettingsRepository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const INSTANCE_PREFIX = 'easybarber';
const INSTANCE_MAX_LENGTH = 80;
const INSTANCE_SUFFIX_LENGTH = 8;

export const normalizeWhatsAppInstanceName = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .trim();

  return normalized || null;
};

const sanitizeInstanceToken = (value, fallback = INSTANCE_PREFIX) =>
  normalizeWhatsAppInstanceName(value) || fallback;

const buildBarbershopSuffix = (barbershopId) => {
  const compactId = String(barbershopId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (!compactId) {
    return 'tenant';
  }

  return compactId.slice(-INSTANCE_SUFFIX_LENGTH);
};

export const buildDeterministicWhatsAppInstanceName = ({ barbershopId, shopName }) => {
  const suffix = buildBarbershopSuffix(barbershopId);
  const baseSlug = sanitizeInstanceToken(shopName, INSTANCE_PREFIX);
  const fixedSuffixLength = suffix.length + 1;
  const maxBaseLength = Math.max(12, INSTANCE_MAX_LENGTH - fixedSuffixLength);
  const truncatedBase = baseSlug.slice(0, maxBaseLength).replace(/[-_.]+$/g, '') || INSTANCE_PREFIX;

  return `${truncatedBase}_${suffix}`;
};

export const getBarbershopWhatsAppInstanceContext = async (barbershopId) => {
  const context = await barbershopSettingsRepository.findWhatsAppInstanceContextByBarbershopId(barbershopId);

  if (!context || context.active !== true) {
    throw new NotFoundError('Barbearia');
  }

  return {
    ...context,
    whatsappInstanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName),
  };
};

export const ensureBarbershopWhatsAppInstanceName = async (barbershopId) => {
  let context;

  try {
    context = await barbershopSettingsRepository.ensureWhatsAppInstanceName(
      barbershopId,
      ({ id, name }) => buildDeterministicWhatsAppInstanceName({
        barbershopId: id,
        shopName: name,
      })
    );
  } catch (error) {
    const uniqueViolation = error?.code === '23505';
    const constraint = String(error?.constraint || '').trim();

    if (uniqueViolation && constraint === 'uq_barbershops_whatsapp_instance_name_norm') {
      throw new ValidationError(
        'Nao foi possivel reservar a instancia WhatsApp',
        ['Ja existe outra barbearia usando o identificador gerado. Tente novamente.']
      );
    }

    throw error;
  }

  if (!context || context.active !== true) {
    throw new NotFoundError('Barbearia');
  }

  return {
    ...context,
    whatsappInstanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName),
  };
};
