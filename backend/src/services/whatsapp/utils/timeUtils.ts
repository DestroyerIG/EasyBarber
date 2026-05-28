/**
 * timeUtils.ts — formatação de horário vindo de queries.
 *
 * Prisma $queryRaw devolve colunas `time` como objeto Date (1970-01-01THH:MM:00Z),
 * não string. Chamar .substring direto lança "substring is not a function".
 * formatTimeHm aceita Date ou string e devolve "HH:MM".
 */
export const formatTimeHm = (t: Date | string | null | undefined): string => {
  if (t == null) return '';
  if (typeof t === 'string') return t.length >= 5 ? t.substring(0, 5) : t;
  const h = String(t.getUTCHours()).padStart(2, '0');
  const m = String(t.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};
