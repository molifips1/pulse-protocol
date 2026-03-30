import { NextResponse } from 'next/server'

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
    const casinoOnly = (data.streamers || []).filter((s: any) => s.category === 'casino')
    return NextResponse.json({ streamers: casinoOnly })
  } catch {
    return NextResponse.json({ streamers: [] })
  }
}
