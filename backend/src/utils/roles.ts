import type { UserRole } from '../types/domain.js';

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  admin: 'tenant_admin',
  barber: 'employee',
};

export const normalizeRole = (role: string | undefined | null): UserRole | undefined => {
  if (!role) return undefined;
  return (LEGACY_ROLE_MAP[role] as UserRole) ?? (role as UserRole);
};
