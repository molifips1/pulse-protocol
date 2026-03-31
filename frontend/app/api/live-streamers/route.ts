import { NextResponse } from 'next/server'
import { KNOWN_STREAMERS } from '../../lib/utils'

const ORACLE_URL = process.env.ORACLE_URL || ''
const knownSet = new Set(KNOWN_STREAMERS.map(s => s.toLowerCase()))

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
    const casinoOnly = (data.streamers || []).filter((s: any) =>
      knownSet.has((s.channel || '').toLowerCase())
    )
    return NextResponse.json({ streamers: casinoOnly })
  } catch {
    return NextResponse.json({ streamers: [] })
  }
}
