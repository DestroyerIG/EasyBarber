import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const DASHBOARD_ALIAS_ROUTES = [
  'agendamentos',
  'financeiro',
  'clientes',
  'servicos',
  'planos',
  'configuracoes',
  'whatsapp',
] as const;

type DashboardAliasRoute = typeof DASHBOARD_ALIAS_ROUTES[number];

const PROTECTED_PATHS = [
  '/dashboard',
  ...DASHBOARD_ALIAS_ROUTES.map((route) => `/${route}`),
  '/admin',
];
const AUTH_PAGES = ['/login', '/cadastro'];

const hasSessionCookie = (request: NextRequest) => {
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;
  return Boolean(accessToken || refreshToken);
};

const isPathMatch = (pathname: string, paths: string[]) => {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
};

const isDashboardAliasRoute = (value: string): value is DashboardAliasRoute => {
  return DASHBOARD_ALIAS_ROUTES.includes(value as DashboardAliasRoute);
};

const resolveLegacyDashboardPath = (pathname: string) => {
  if (!pathname.startsWith('/dashboard/')) {
    return null;
  }

  const pathWithoutPrefix = pathname.replace('/dashboard/', '');
  const firstSegment = pathWithoutPrefix.split('/')[0];

  if (!firstSegment || !isDashboardAliasRoute(firstSegment)) {
    return null;
  }

  return `/${pathWithoutPrefix}`;
};

const resolveDashboardRewritePath = (pathname: string) => {
  const firstSegment = pathname.split('/')[1];

  if (!firstSegment || !isDashboardAliasRoute(firstSegment)) {
    return null;
  }

  return `/dashboard${pathname}`;
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = hasSessionCookie(request);

  const legacyPath = resolveLegacyDashboardPath(pathname);
  if (legacyPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = legacyPath;
    return NextResponse.redirect(redirectUrl);
  }

  const isProtectedPath = isPathMatch(pathname, PROTECTED_PATHS);
  const isAuthPage = isPathMatch(pathname, AUTH_PAGES);

  if (isProtectedPath && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const rewritePath = resolveDashboardRewritePath(pathname);
  if (rewritePath) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = rewritePath;
    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/agendamentos/:path*',
    '/financeiro/:path*',
    '/clientes/:path*',
    '/servicos/:path*',
    '/planos/:path*',
    '/configuracoes/:path*',
    '/whatsapp/:path*',
    '/admin/:path*',
    '/login',
    '/cadastro',
  ],
};
