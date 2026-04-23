const PUBLIC_AUTH_PATHS = ['/login', '/cadastro', '/esqueci-senha', '/auth/redefinir-senha'] as const;

const isPathMatch = (pathname: string, paths: readonly string[]) => {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
};

export const publicAuthPaths = [...PUBLIC_AUTH_PATHS];

export const isPublicAuthPath = (pathname: string) => {
  return isPathMatch(pathname, PUBLIC_AUTH_PATHS);
};
