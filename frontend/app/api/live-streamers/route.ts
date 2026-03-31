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
    const all = data.streamers || []
    const casinoOnly = all.filter((s: any) => s.category === 'casino')
    console.log('[live-streamers] total:', all.length, '| casino:', casinoOnly.length, '| categories:', JSON.stringify(all.map((s: any) => ({ ch: s.channel, cat: s.category }))))
    return NextResponse.json({ streamers: casinoOnly })
  } catch {
    return NextResponse.json({ streamers: [] })
  }
}
