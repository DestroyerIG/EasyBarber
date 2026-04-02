const LEGACY_ROLE_MAP = {
  admin: 'tenant_admin',
  barber: 'employee',
};

export const normalizeRole = (role) => {
  if (!role) {
    return role;
  }

  return LEGACY_ROLE_MAP[role] || role;
};
