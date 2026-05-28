const PUBLIC_AUTH_PATHS = ['/login', '/cadastro', '/esqueci-senha', '/auth/redefinir-senha', '/termos', '/privacidade'] as const;

const isPathMatch = (pathname: string, paths: readonly string[]) => {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
};

export const publicAuthPaths = [...PUBLIC_AUTH_PATHS];

export const isPublicAuthPath = (pathname: string) => {
  // Landing ('/') é marketing público: sem sessão esperada, evita /auth/me e
  // /auth/refresh dispararem 401 para visitantes anônimos. Match exato.
  return pathname === '/' || isPathMatch(pathname, PUBLIC_AUTH_PATHS);
};
