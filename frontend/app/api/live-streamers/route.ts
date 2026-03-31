import { NextResponse } from 'next/server'
import { KNOWN_STREAMERS } from '@/lib/utils'

const ORACLE_URL = process.env.ORACLE_URL || ''

export async function GET() {
  if (!ORACLE_URL) {
    return NextResponse.json({ streamers: [] })
  }
  try {
    const res = await fetch(`${ORACLE_URL}/live-streamers`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return NextResponse.json({ streamers: [] })
    const data = await res.json()
    const all = data.streamers || []
    const knownOnly = all.filter((s: any) =>
      KNOWN_STREAMERS.includes((s.channel || s.name || '').toLowerCase())
    )
    return NextResponse.json({ streamers: knownOnly })
  } catch {
    return NextResponse.json({ streamers: [] })
  }
}
