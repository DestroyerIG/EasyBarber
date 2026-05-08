/**
 * Utilitário padrão para manipulação de datas no backend.
 * Resolve problemas de timezone e formatos string ('YYYY-MM-DD') no Prisma.
 */

// Se precisar lidar estritamente com fuso do Brasil, você pode usar libs como date-fns-tz
// Mas esta implementação resolve nativamente com foco em converter inputs para Date objects UTC corretos.

/**
 * Converte qualquer entrada de data (string, Date, numérico) para um objeto Date válido.
 * Trata entradas "YYYY-MM-DD" assumindo meia-noite (UTC ou Local, dependendo do caso).
 */
export const toDate = (input: string | Date | number): Date => {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) throw new Error('Invalid Date object');
    return input;
  }

  // Se for string "YYYY-MM-DD", garante parse correto sem inconsistência de fuso
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return new Date(`${input.trim()}T00:00:00.000Z`); // ou defina o offset de BRT: T00:00:00.000-03:00 se quiser manter localmente no inicio do dia BR
  }

  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format for input: ${input}`);
  }
  
  return parsed;
};

/**
 * Retorna o início do dia (00:00:00.000) para uma dada data.
 * Ideal para consultas Prisma: { gte: startOfDay(date) }
 */
export const startOfDay = (input: string | Date | number, useUTC = false): Date => {
  const date = toDate(input);
  const result = new Date(date);
  
  if (useUTC) {
    result.setUTCHours(0, 0, 0, 0);
  } else {
    result.setHours(0, 0, 0, 0);
  }
  
  return result;
};

/**
 * Retorna o fim do dia (23:59:59.999) para uma dada data.
 * Ideal para consultas Prisma: { lte: endOfDay(date) }
 */
export const endOfDay = (input: string | Date | number, useUTC = false): Date => {
  const date = toDate(input);
  const result = new Date(date);
  
  if (useUTC) {
    result.setUTCHours(23, 59, 59, 999);
  } else {
    result.setHours(23, 59, 59, 999);
  }
  
  return result;
};

/**
 * Converte garantidamente para ISO-8601 (formato que Prisma e JSON esperam nativamente).
 */
export const toISO = (input: string | Date | number): string => {
  return toDate(input).toISOString();
};

/**
 * Recebe o query param do controller, podendo ser undefined. 
 * Retorna o objeto Date ou null.
 */
export const normalizeDateInput = (input: unknown): Date | null => {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  
  try {
    return toDate(input as string | number | Date);
  } catch (error) {
    return null; // ou throw novo erro de validação (400 Bad Request) se preferir
  }
};
