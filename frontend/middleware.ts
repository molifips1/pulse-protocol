import { NextRequest, NextResponse } from 'next/server'

const RESTRICTED_COUNTRIES = new Set(['CN', 'KP', 'IR', 'SY', 'CU'])
// US blocked until state licences — remove individual states as licences obtained
const RESTRICTED_US_STATES = new Set(['US'])

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip static assets and API health checks
  if (pathname.startsWith('/_next') || pathname === '/api/geo' || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  const country = req.headers.get('cf-ipcountry') ||
                  req.headers.get('x-vercel-ip-country') ||
                  'XX'

  if (RESTRICTED_COUNTRIES.has(country) || RESTRICTED_US_STATES.has(country)) {
    return NextResponse.redirect(new URL('/restricted', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
