import { NextRequest, NextResponse } from 'next/server'

const RESTRICTED_COUNTRIES = new Set(['CN', 'KP', 'IR', 'SY', 'CU'])

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/_next') || pathname === '/api/geo' || pathname === '/favicon.ico' || pathname === '/restricted') {
    return NextResponse.next()
  }

  const country = req.headers.get('cf-ipcountry') ||
                  req.headers.get('x-vercel-ip-country') ||
                  'XX'

  if (RESTRICTED_COUNTRIES.has(country)) {
    return NextResponse.redirect(new URL('/restricted', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}