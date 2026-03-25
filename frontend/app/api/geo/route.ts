import { NextRequest, NextResponse } from 'next/server'

// Restricted jurisdictions (per casino licence requirements)
// Expand this list based on your specific licence conditions
const RESTRICTED_COUNTRY_CODES = new Set([
  'US', // until individual state licences obtained
  'CN', // mainland China
  'KP', // North Korea
  'IR', // Iran
  'SY', // Syria
  'CU', // Cuba
])

export async function GET(req: NextRequest) {
  // In production: use Cloudflare cf-ipcountry header or MaxMind GeoIP
  const country = req.headers.get('cf-ipcountry') ||
                  req.headers.get('x-vercel-ip-country') ||
                  'XX'

  const restricted = RESTRICTED_COUNTRY_CODES.has(country)

  return NextResponse.json({
    country,
    restricted,
    message: restricted
      ? 'This service is not available in your jurisdiction.'
      : 'Access permitted.'
  })
}
