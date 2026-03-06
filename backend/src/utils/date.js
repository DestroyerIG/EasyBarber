/**
 * Utilitários de data compartilhados entre services.
 * Centraliza lógica de timezone para evitar duplicação.
 */

export const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().split('T')[0];
};

export const formatDateBR = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR');
};
