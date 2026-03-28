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
    return NextResponse.json({ streamers: data.streamers || [] })
  } catch {
    return NextResponse.json({ streamers: [] })
  }
}
