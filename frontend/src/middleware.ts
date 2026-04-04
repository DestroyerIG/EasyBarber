import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/dashboard', '/admin'];
const AUTH_PAGES = ['/login', '/cadastro'];

const hasSessionCookie = (request: NextRequest) => {
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;
  return Boolean(accessToken || refreshToken);
};

const isPathMatch = (pathname: string, paths: string[]) => {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = hasSessionCookie(request);

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/cadastro'],
};
