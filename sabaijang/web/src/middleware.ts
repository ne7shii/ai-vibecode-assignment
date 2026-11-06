import { NextResponse, type NextRequest } from 'next/server';

// "/" and paths without a language prefix → /th/... (US-45: Thai default, English available)
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/brand') || /\.[a-z0-9]+$/i.test(pathname)) return;
  if (pathname === '/th' || pathname === '/en' || pathname.startsWith('/th/') || pathname.startsWith('/en/')) return;
  const url = req.nextUrl.clone();
  url.pathname = `/th${pathname === '/' ? '' : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!api|_next|brand|favicon|icon).*)'] };
