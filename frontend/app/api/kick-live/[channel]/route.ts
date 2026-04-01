import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { channel: string } }
) {
  const channel = params.channel.toLowerCase()
  try {
    const res = await fetch(`https://kick.com/api/v1/channels/${channel}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://kick.com',
        'Origin': 'https://kick.com',
      },
      next: { revalidate: 0 },
    })
    if (!res.ok) {
      return NextResponse.json({ isLive: false, viewers: 0 })
    }
    const data = await res.json()
    if (data?.livestream) {
      return NextResponse.json({
        isLive: true,
        viewers: data.livestream.viewer_count || 0,
        title: data.livestream.session_title || '',
        category: data.livestream.categories?.[0]?.name || '',
      })
    }
    return NextResponse.json({ isLive: false, viewers: 0 })
  } catch {
    return NextResponse.json({ isLive: false, viewers: 0 })
  }
}
