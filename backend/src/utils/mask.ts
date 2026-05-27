export const maskEmail = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.includes('@')) return null;
  const [local, domain] = value.split('@');
  if (!local || !domain) return null;
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
};
