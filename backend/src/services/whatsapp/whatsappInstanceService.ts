import { barbershopSettingsRepository } from '../../repositories/barbershopSettingsRepository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const INSTANCE_PREFIX = 'easybarber';
const INSTANCE_MAX_LENGTH = 80;
const INSTANCE_SUFFIX_LENGTH = 8;

export const normalizeWhatsAppInstanceName = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .trim();

  return normalized || null;
};

const sanitizeInstanceToken = (value: string | null | undefined, fallback: string = INSTANCE_PREFIX): string =>
  normalizeWhatsAppInstanceName(value) || fallback;

const buildBarbershopSuffix = (barbershopId: string | number | null | undefined): string => {
  const compactId = String(barbershopId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (!compactId) {
    return 'tenant';
  }

  return compactId.slice(-INSTANCE_SUFFIX_LENGTH);
};

export const buildDeterministicWhatsAppInstanceName = ({
  barbershopId,
  shopName,
}: {
  barbershopId: string | number | null | undefined;
  shopName: string | null | undefined;
}): string => {
  const suffix = buildBarbershopSuffix(barbershopId);
  const baseSlug = sanitizeInstanceToken(shopName, INSTANCE_PREFIX);
  const fixedSuffixLength = suffix.length + 1;
  const maxBaseLength = Math.max(12, INSTANCE_MAX_LENGTH - fixedSuffixLength);
  const truncatedBase = baseSlug.slice(0, maxBaseLength).replace(/[-_.]+$/g, '') || INSTANCE_PREFIX;

  return `${truncatedBase}_${suffix}`;
};

interface WhatsAppInstanceContext {
  whatsappInstanceName: string | null;
  active: boolean;
  [key: string]: unknown;
}

export const getBarbershopWhatsAppInstanceContext = async (
  barbershopId: string,
): Promise<WhatsAppInstanceContext> => {
  const context = await barbershopSettingsRepository.findWhatsAppInstanceContextByBarbershopId(barbershopId);

  if (!context || context.active !== true) {
    throw new NotFoundError('Barbearia');
  }

  return {
    ...context,
    whatsappInstanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName as string | null),
  } as WhatsAppInstanceContext;
};

export const ensureBarbershopWhatsAppInstanceName = async (
  barbershopId: string,
): Promise<WhatsAppInstanceContext> => {
  let context: WhatsAppInstanceContext;

  try {
    context = await barbershopSettingsRepository.ensureWhatsAppInstanceName(
      barbershopId,
      ({ id, name }: { id: unknown; name: unknown }) => buildDeterministicWhatsAppInstanceName({
        barbershopId: id as string,
        shopName: name as string,
      })
    ) as WhatsAppInstanceContext;
  } catch (error) {
    const err = error as Record<string, unknown>;
    const uniqueViolation = err?.code === '23505';
    const constraint = String(err?.constraint || '').trim();

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
    whatsappInstanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName as string | null),
  } as WhatsAppInstanceContext;
};
