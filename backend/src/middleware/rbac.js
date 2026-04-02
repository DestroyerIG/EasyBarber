import { ForbiddenError } from '../utils/errors.js';
import { normalizeRole } from '../utils/roles.js';

export const requireRole = (allowedRoles = []) => {
  return (req, _res, next) => {
    const role = normalizeRole(req.user?.role);

    if (!role) {
      return next(new ForbiddenError('Acesso negado: perfil não identificado'));
    }

    if (!allowedRoles.includes(role)) {
      return next(new ForbiddenError('Acesso negado para este perfil'));
    }

    return next();
  };
};

export const requireAdmin = requireRole(['platform_admin']);
export const requireTenantRoles = requireRole(['tenant_admin', 'employee']);
